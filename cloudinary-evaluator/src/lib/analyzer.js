const RESOURCE_TYPES = new Set(["image", "video"]);
const DELIVERY_TYPES = new Set(["upload", "fetch", "private", "authenticated"]);

function parseCloudinaryUrl(url) {
  let parsed;
  try {
    parsed = new URL(url, "https://placeholder");
  } catch {
    return null;
  }

  const segments = parsed.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length < 2) return null;

  let idx = 0;
  let resourceType = segments[idx];
  let cloudName = "";

  if (!RESOURCE_TYPES.has(resourceType)) {
    cloudName = resourceType;
    idx += 1;
    resourceType = segments[idx];
  }

  if (!RESOURCE_TYPES.has(resourceType)) return null;

  const deliveryType = segments[idx + 1];
  if (!DELIVERY_TYPES.has(deliveryType)) return null;

  const remainderSegments = segments.slice(idx + 2);
  if (!remainderSegments.length) return null;

  const transformationSegments = [];
  let stopIndex = remainderSegments.length;

  for (let i = 0; i < remainderSegments.length; i += 1) {
    const segment = remainderSegments[i];
    if (!segment) continue;
    if (/^v\d+$/i.test(segment) || /\.[a-z0-9]+$/i.test(segment)) {
      stopIndex = i;
      break;
    }
    transformationSegments.push(segment);
  }

  const rawTransformations = transformationSegments.join("/");
  const txSet = new Set(rawTransformations.split(",").filter(Boolean));
  const publicId = remainderSegments.slice(stopIndex).join("/");

  return {
    cloudName: cloudName || parsed.hostname,
    resourceType,
    deliveryType,
    publicId,
    transformations: rawTransformations,
    txSet,
  };
}

function hasCloudinaryResponseHeaders(response = {}) {
  const headers = Array.isArray(response.headers) ? response.headers : [];
  const lookup = new Map();

  for (const h of headers) {
    const name = h?.name?.toLowerCase();
    if (!name) continue;
    lookup.set(name, h.value ?? "");
    if (name.startsWith("x-cld-")) return true;
  }

  const server = (lookup.get("server") || "").toLowerCase();
  if (server.includes("cloudinary")) return true;

  if (lookup.has("x-cld-request-id") || lookup.has("x-cloudinary-request-id")) return true;

  return false;
}

function extractDimensionsFromTransformations(txSet, transformations) {
  let width = null;
  let height = null;
  
  // Check for explicit width/height transformations
  for (const tx of txSet) {
    // w_1234 or w_1234:auto
    const wMatch = tx.match(/^w_(\d+)/);
    if (wMatch) width = parseInt(wMatch[1], 10);
    
    // h_1234 or h_1234:auto
    const hMatch = tx.match(/^h_(\d+)/);
    if (hMatch) height = parseInt(hMatch[1], 10);
  }
  
  // Also check the raw transformations string for c_fill, c_crop with dimensions
  if (transformations) {
    const cFillMatch = transformations.match(/c_(?:fill|crop)(?:,w_(\d+))?(?:,h_(\d+))?/);
    if (cFillMatch) {
      if (cFillMatch[1] && !width) width = parseInt(cFillMatch[1], 10);
      if (cFillMatch[2] && !height) height = parseInt(cFillMatch[2], 10);
    }
  }
  
  return { width, height };
}

function extractDisplayDimensions(element) {
  let displayWidth = null;
  let displayHeight = null;
  
  // Check width/height attributes
  const attrWidth = element.getAttribute("width");
  const attrHeight = element.getAttribute("height");
  if (attrWidth) displayWidth = parseInt(attrWidth, 10);
  if (attrHeight) displayHeight = parseInt(attrHeight, 10);
  
  // Check CSS styles (if available)
  const style = element.getAttribute("style") || "";
  const widthMatch = style.match(/width\s*:\s*(\d+)px/i);
  const heightMatch = style.match(/height\s*:\s*(\d+)px/i);
  if (widthMatch && !displayWidth) displayWidth = parseInt(widthMatch[1], 10);
  if (heightMatch && !displayHeight) displayHeight = parseInt(heightMatch[1], 10);
  
  return { displayWidth, displayHeight };
}

function isOversized(actualWidth, actualHeight, displayWidth, displayHeight) {
  // If we don't have display dimensions, we can't determine if it's oversized
  if (!displayWidth && !displayHeight) return false;
  
  // If we have both dimensions, check if actual is significantly larger
  if (actualWidth && actualHeight && displayWidth && displayHeight) {
    const actualArea = actualWidth * actualHeight;
    const displayArea = displayWidth * displayHeight;
    // Consider oversized if actual is more than 2x the display area
    return actualArea > displayArea * 2;
  }
  
  // If we only have one dimension, check if it's significantly larger
  if (actualWidth && displayWidth && actualWidth > displayWidth * 1.5) return true;
  if (actualHeight && displayHeight && actualHeight > displayHeight * 1.5) return true;
  
  return false;
}

function finalizeAnalysis(result) {
  const perAsset = result.cloudinaryRequests.map(entry => {
    const cld = entry.cld || { txSet: new Set() };
    const issues = [];
    if (!cld.txSet.has("f_auto")) {
      issues.push("Enable f_auto to serve modern formats automatically.");
    }
    const hasQAuto = cld.txSet.has("q_auto") || [...cld.txSet].some(t => t.startsWith("q_auto:"));
    if (!hasQAuto) {
      issues.push("Add q_auto to balance bytes vs quality.");
    }
    
    // Check for oversized assets
    const dimensions = extractDimensionsFromTransformations(cld.txSet, cld.transformations);
    const displayDims = entry.displayDimensions || {};
    
    // If we have display dimensions but no width/height transformations, suggest resizing
    if ((displayDims.displayWidth || displayDims.displayHeight) && !dimensions.width && !dimensions.height) {
      issues.push("Add width/height transformations to resize images to display dimensions and reduce file size.");
    }
    // If we have both actual and display dimensions and it's oversized
    else if (dimensions.width && dimensions.height && displayDims.displayWidth && displayDims.displayHeight) {
      if (isOversized(dimensions.width, dimensions.height, displayDims.displayWidth, displayDims.displayHeight)) {
        issues.push(`Image is oversized (${dimensions.width}×${dimensions.height}px displayed as ${displayDims.displayWidth}×${displayDims.displayHeight}px). Crop and resize to match display dimensions.`);
      }
    }
    
    return { url: entry.url, issues, cld, dimensions, displayDimensions: displayDims };
  });

  const total = perAsset.length;
  const suggestions = new Set();

  const autoFormatCount = perAsset.filter(a => a.cld.txSet.has("f_auto")).length;
  const autoQualityCount = perAsset.filter(a => a.cld.txSet.has("q_auto") || [...a.cld.txSet].some(t => t.startsWith("q_auto:"))).length;

  if (total > 0) {
    if (autoFormatCount / total < 0.8) {
      suggestions.add("Adopt f_auto to serve modern formats automatically.");
    }
    if (autoQualityCount / total < 0.8) {
      suggestions.add("Adopt q_auto for balanced quality vs bytes.");
    }
  }

  if (result.nonCloudinaryImages.length > 0) {
    suggestions.add("Migrate non-Cloudinary images to leverage optimization & CDN.");
  }

  // Check for oversized assets across all Cloudinary images
  const oversizedAssets = perAsset.filter(a => {
    return a.issues.some(issue => issue.includes("oversized") || issue.includes("resize"));
  });
  
  if (oversizedAssets.length > 0) {
    suggestions.add(`Resize ${oversizedAssets.length} oversized image${oversizedAssets.length > 1 ? 's' : ''} to match display dimensions and reduce bandwidth.`);
  }

  const cacheFindings = [];
  for (const r of result.cloudinaryRequests) {
    const cc = r.response?.headers?.find?.(h => h.name?.toLowerCase() === "cache-control")?.value || "";
    if (cc && !/max-age=/.test(cc)) cacheFindings.push({ url: r.url, note: `Cache-Control suboptimal: ${cc}` });
  }
  if (cacheFindings.length) {
    suggestions.add("Improve Cache-Control headers on versioned assets.");
  }

  // Calculate score based on Cloudinary usage and optimization
  // If no Cloudinary assets, score is 0
  let score = 0;
  
  const totalAssets = result.totalRequests;
  const cloudinaryAssets = total;
  const nonCloudinaryAssets = result.nonCloudinaryImages.length;
  
  // Count optimized Cloudinary assets (both f_auto and q_auto)
  const optimizedAssets = perAsset.filter(a => {
    const hasFAuto = a.cld.txSet.has("f_auto");
    const hasQAuto = a.cld.txSet.has("q_auto") || [...a.cld.txSet].some(t => t.startsWith("q_auto:"));
    return hasFAuto && hasQAuto;
  }).length;
  
  if (cloudinaryAssets === 0) {
    // No Cloudinary assets = 0 score
    score = 0;
  } else if (totalAssets === 0) {
    // No assets at all = 0 score
    score = 0;
  } else {
    // Score = (Cloudinary usage % * 50) + (Optimization % * 50)
    // Cloudinary usage: percentage of total assets using Cloudinary
    const cloudinaryUsagePercent = (cloudinaryAssets / totalAssets) * 100;
    
    // Optimization: percentage of Cloudinary assets that are fully optimized
    const optimizationPercent = (optimizedAssets / cloudinaryAssets) * 100;
    
    // Weighted score: 50% for using Cloudinary, 50% for optimizing
    score = (cloudinaryUsagePercent * 0.5) + (optimizationPercent * 0.5);
  }
  
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    ...result,
    perAsset,
    score,
    suggestions: [...suggestions],
    coverage: {
      total: result.totalRequests,
      cloudinary: total,
      nonCloudinaryImages: result.nonCloudinaryImages.length,
      autoFormat: autoFormatCount,
      autoQuality: autoQualityCount,
    },
  };
}

export function analyzeFromHar(harJson) {
  const entries = (harJson?.log?.entries ?? []).filter(Boolean);
  const out = { totalRequests: entries.length, cloudinaryRequests: [], nonCloudinaryImages: [] };

  for (const e of entries) {
    const url = e.request?.url || "";
    const mime = e.response?.content?.mimeType || "";
    const cld = parseCloudinaryUrl(url);
    const isCloudinary = cld && hasCloudinaryResponseHeaders(e.response);
    if (isCloudinary) out.cloudinaryRequests.push({ url, response: e.response, cld });
    else if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) out.nonCloudinaryImages.push({ url });
  }

  return finalizeAnalysis(out);
}

export function analyzeFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const els = [...doc.querySelectorAll("img, source, video, picture source")];
  const out = { totalRequests: els.length, cloudinaryRequests: [], nonCloudinaryImages: [] };

  for (const el of els) {
    const raw = el.getAttribute("src") || el.getAttribute("srcset") || el.getAttribute("data-src") || "";
    if (!raw) continue;
    const firstUrl = String(raw).split(/\s+/)[0];
    const cld = parseCloudinaryUrl(firstUrl);
    
    // Extract display dimensions from the element
    const displayDims = extractDisplayDimensions(el);
    
    if (cld) {
      out.cloudinaryRequests.push({ 
        url: firstUrl, 
        cld,
        displayDimensions: displayDims
      });
    } else {
      out.nonCloudinaryImages.push({ url: firstUrl });
    }
  }

  return finalizeAnalysis(out);
}

export function analyzeFromUrl(url) {
  const cld = parseCloudinaryUrl(url);
  if (!cld) {
    throw new Error("URL does not appear to be a Cloudinary delivery URL");
  }
  
  const out = {
    totalRequests: 1,
    cloudinaryRequests: [{ url, cld }],
    nonCloudinaryImages: [],
  };

  return finalizeAnalysis(out);
}