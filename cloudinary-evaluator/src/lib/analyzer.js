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
    return { url: entry.url, issues, cld };
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

  const cacheFindings = [];
  for (const r of result.cloudinaryRequests) {
    const cc = r.response?.headers?.find?.(h => h.name?.toLowerCase() === "cache-control")?.value || "";
    if (cc && !/max-age=/.test(cc)) cacheFindings.push({ url: r.url, note: `Cache-Control suboptimal: ${cc}` });
  }
  if (cacheFindings.length) {
    suggestions.add("Improve Cache-Control headers on versioned assets.");
  }

  // Simple score calculation: start at 100 and subtract points for issues
  let score = 100;

  if (total > 0) {
    if (autoFormatCount / total < 0.8) {
      score -= 12;
    }
    if (autoQualityCount / total < 0.8) {
      score -= 12;
    }
  }

  if (result.nonCloudinaryImages.length > 0) {
    score -= 10;
  }

  if (cacheFindings.length) {
    score -= 6;
  }

  score = Math.max(0, Math.min(100, score));

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
    if (cld) out.cloudinaryRequests.push({ url: firstUrl, cld });
    else out.nonCloudinaryImages.push({ url: firstUrl });
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