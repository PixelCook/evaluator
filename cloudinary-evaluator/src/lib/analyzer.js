const RESOURCE_TYPES = new Set(["image", "video", "raw"]);
const DELIVERY_TYPES = new Set(["upload", "fetch", "private", "authenticated"]);

// Cloudinary transformation parameter patterns (e.g., w_100, h_200, c_fill, f_auto, q_auto)
const CLOUDINARY_TX_PATTERN = /[a-z]+_(?:auto|limit|fill|crop|scale|fit|pad|lfill|limit|mfit|mpad|thumb|imagga_crop|imagga_scale|imagga_pad|\d+)/i;

// Patterns for URLs that are not media files and shouldn't be considered for Cloudinary hosting
const NON_MEDIA_PATTERNS = [
  /^data:/i, // Data URIs
  /doubleclick\.net/i, // Google DoubleClick tracking
  /google-analytics\.com/i, // Google Analytics
  /googletagmanager\.com/i, // Google Tag Manager
  /facebook\.net/i, // Facebook tracking
  /bidswitch\.net/i, // BidSwitch ad tech
  /adsrvr\.org/i, // Ad server
  /adtechus\.com/i, // Ad tech
  /adnxs\.com/i, // AppNexus
  /rubiconproject\.com/i, // Rubicon Project
  /openx\.net/i, // OpenX
  /pubmatic\.com/i, // PubMatic
  /analytics/i, // Analytics services
  /tracking/i, // Tracking pixels
  /pixel/i, // Tracking pixels
  /beacon/i, // Tracking beacons
  /\/activity/i, // Activity tracking endpoints
  /\/collect/i, // Data collection endpoints
  /\/event/i, // Event tracking
  /\/log/i, // Logging endpoints
  /\/sync/i, // Sync endpoints (ad tech, tracking)
  /\/api\//i, // API endpoints
  /\/ads\//i, // Ad serving endpoints
  /\/ad\//i, // Ad endpoints
  /\/track/i, // Tracking endpoints
  /\/imp/i, // Impression tracking
  /\/click/i, // Click tracking
  /dsp_id|user_id|pixel_id|campaign_id/i, // Common tracking query params
  /\.json(\?|$)/i, // JSON files
  /\.xml(\?|$)/i, // XML files (unless SVG)
  /\.txt(\?|$)/i, // Text files
  /\.js(\?|$)/i, // JavaScript files
  /\.css(\?|$)/i, // CSS files
];

// Media file extensions that Cloudinary can host
const MEDIA_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|avi|wmv|flv|mkv|pdf|zip|doc|docx|xls|xlsx|ppt|pptx|txt|json|xml|ico|bmp|tiff?|heic|heif)(\?|$)/i;

function isMediaFile(url, mimeType = '') {
  if (!url || typeof url !== 'string') return false;
  
  // Check if it matches non-media patterns
  for (const pattern of NON_MEDIA_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  
  // Check if it has a media file extension
  if (MEDIA_EXTENSIONS.test(url)) return true;
  
  // Check MIME type if provided
  if (mimeType && /^(image|video)\//.test(mimeType)) return true;
  
  // If no extension and no MIME type, it's likely not a media file
  return false;
}

function hasCloudinaryTransformations(segment) {
  if (!segment) return false;
  // Check if segment contains Cloudinary transformation patterns
  // Examples: "w_144,c_limit", "f_auto,q_auto", "w_100,h_200,c_fill"
  // Cloudinary uses commas to separate transformations, not semicolons
  // Must contain comma-separated transformation patterns
  if (!segment.includes(',')) {
    // Single transformation - must match pattern
    return CLOUDINARY_TX_PATTERN.test(segment);
  }
  // Multiple transformations separated by commas
  const parts = segment.split(',');
  return parts.some(part => CLOUDINARY_TX_PATTERN.test(part.trim()) || /^[a-z]+_\d+/.test(part.trim()));
}

function parseCloudinaryUrl(url) {
  let parsed;
  try {
    parsed = new URL(url, "https://placeholder");
  } catch {
    return null;
  }

  const segments = parsed.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length < 2) return null;

  // Helper to normalize resource type (handle "images" as "image")
  const normalizeResourceType = (type) => {
    if (type === "images") return "image";
    return type;
  };

  // First, try standard Cloudinary URL structure
  let idx = 0;
  let resourceType = segments[idx];
  let cloudName = "";

  if (!RESOURCE_TYPES.has(resourceType) && normalizeResourceType(resourceType) !== "image") {
    cloudName = resourceType;
    idx += 1;
    resourceType = segments[idx];
  }

  // Normalize resource type (images -> image)
  const normalizedResourceType = normalizeResourceType(resourceType);
  
  if (RESOURCE_TYPES.has(normalizedResourceType) || resourceType === "images") {
    const deliveryType = segments[idx + 1];
    let remainderStartIdx = idx + 2;
    
    // Handle case where delivery type is missing (default to "upload")
    if (!DELIVERY_TYPES.has(deliveryType)) {
      // If the next segment looks like transformations, assume delivery type is "upload"
      if (hasCloudinaryTransformations(deliveryType) || deliveryType === undefined) {
        remainderStartIdx = idx + 1;
      } else {
        // Not a standard structure, try fallback
        remainderStartIdx = -1;
      }
    }
    
    if (remainderStartIdx > 0) {
      // Standard Cloudinary URL structure detected (with or without explicit delivery type)
      const remainderSegments = segments.slice(remainderStartIdx);
      if (!remainderSegments.length) return null;

      // For raw files, transformations are less common, so handle differently
      const isRawFile = normalizedResourceType === "raw";
      
      const transformationSegments = [];
      let stopIndex = remainderSegments.length;

      // Look for transformation patterns or version/publicId markers
      for (let i = 0; i < remainderSegments.length; i += 1) {
        const segment = remainderSegments[i];
        if (!segment) continue;
        
        // Check if this segment looks like transformations (contains transformation patterns)
        const hasTransformations = hasCloudinaryTransformations(segment);
        
        // For raw files, be more lenient - transformations are optional
        if (isRawFile) {
          // If we find transformation patterns, treat as transformations
          // Otherwise, everything is the publicId
          if (hasTransformations) {
            transformationSegments.push(segment);
            stopIndex = i + 1;
            break;
          }
          // For raw files without transformations, the entire remainder is the publicId
          stopIndex = 0;
          break;
        } else {
          // For image/video, look for version markers or file extensions
          if (/^v\d+$/i.test(segment) || /\.[a-z0-9]+$/i.test(segment)) {
            stopIndex = i;
            break;
          }
          // Check if segment contains transformation patterns
          if (hasTransformations) {
            transformationSegments.push(segment);
          }
        }
      }

      // Collect all transformations from all segments
      // Each segment may contain comma-separated transformations
      const allTransformations = [];
      for (const segment of transformationSegments) {
        const segmentTx = segment.split(",").map(t => t.trim()).filter(Boolean);
        allTransformations.push(...segmentTx);
      }
      const rawTransformations = allTransformations.join(",");
      const txSet = new Set(allTransformations);
      const publicId = isRawFile && transformationSegments.length === 0 
        ? remainderSegments.join("/") 
        : remainderSegments.slice(stopIndex).join("/");

      return {
        cloudName: cloudName || parsed.hostname,
        resourceType: normalizedResourceType,
        deliveryType: DELIVERY_TYPES.has(deliveryType) ? deliveryType : "upload",
        publicId,
        transformations: rawTransformations,
        txSet,
      };
    }
  }

  // Fallback: For CNAME scenarios, try to find proper Cloudinary structure
  // First, try to find explicit <asset_type>/<delivery_type> structure
  let foundResourceType = null;
  let foundDeliveryType = null;
  let cloudNameIdx = -1;
  let foundResourceTypeIdx = -1;
  
  for (let i = 0; i < segments.length - 1; i++) {
    const normalizedSeg = normalizeResourceType(segments[i]);
    if (RESOURCE_TYPES.has(normalizedSeg) || segments[i] === "images") {
      if (DELIVERY_TYPES.has(segments[i + 1])) {
        foundResourceType = normalizedSeg;
        foundDeliveryType = segments[i + 1];
        foundResourceTypeIdx = i;
        cloudNameIdx = i > 0 ? i - 1 : -1;
        break;
      }
    }
  }
  
  // If we found explicit structure, parse it
  if (foundResourceType && foundDeliveryType && foundResourceTypeIdx >= 0) {
    const resourceTypeIdx = foundResourceTypeIdx;
    const deliveryTypeIdx = resourceTypeIdx + 1;
    const remainderSegments = segments.slice(deliveryTypeIdx + 1);
    
    if (!remainderSegments.length) return null;
    
    const isRawFile = foundResourceType === "raw";
    const transformationSegments = [];
    let stopIndex = remainderSegments.length;
    
    for (let i = 0; i < remainderSegments.length; i += 1) {
      const segment = remainderSegments[i];
      if (!segment) continue;
      
      const hasTransformations = hasCloudinaryTransformations(segment);
      
      if (isRawFile) {
        if (hasTransformations) {
          transformationSegments.push(segment);
          stopIndex = i + 1;
          break;
        }
        stopIndex = 0;
        break;
      } else {
        if (/^v\d+$/i.test(segment) || /\.[a-z0-9]+$/i.test(segment)) {
          stopIndex = i;
          break;
        }
        if (hasTransformations) {
          transformationSegments.push(segment);
        }
      }
    }
    
    // Collect all transformations from all segments
    // Each segment may contain comma-separated transformations
    const allTransformations = [];
    for (const segment of transformationSegments) {
      const segmentTx = segment.split(",").map(t => t.trim()).filter(Boolean);
      allTransformations.push(...segmentTx);
    }
    const rawTransformations = allTransformations.join(",");
    const txSet = new Set(allTransformations);
    const publicId = isRawFile && transformationSegments.length === 0 
      ? remainderSegments.join("/") 
      : remainderSegments.slice(stopIndex).join("/");
    
    const cloudName = cloudNameIdx >= 0 ? segments[cloudNameIdx] : parsed.hostname;
    
    return {
      cloudName,
      resourceType: foundResourceType,
      deliveryType: foundDeliveryType,
      publicId,
      transformations: rawTransformations,
      txSet,
    };
  }
  
  // Second fallback: For CNAME URLs without explicit structure, require:
  // 1. Valid comma-separated Cloudinary transformations (not semicolons)
  // 2. A public ID with file extension after transformations
  // This handles cases like: /path/w_144,c_limit/public_id.png
  if (segments.length < 2) return null;
  
  let transformationSegmentIndex = -1;
  let transformationSegment = "";
  
  // Find a segment with valid Cloudinary transformations (comma-separated)
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    // Must have comma-separated transformations (Cloudinary format)
    // Reject semicolon-separated (not Cloudinary format)
    if (segment.includes(';')) continue; // Reject semicolons
    if (hasCloudinaryTransformations(segment)) {
      transformationSegmentIndex = i;
      transformationSegment = segment;
      break;
    }
  }
  
  if (transformationSegmentIndex === -1) return null;
  
  // Must have segments after transformations (the public ID)
  const publicIdSegments = segments.slice(transformationSegmentIndex + 1);
  if (!publicIdSegments.length) return null;
  
  // The public ID should end with a file extension
  const publicId = publicIdSegments.join("/");
  const hasFileExtension = /\.[a-z0-9]+$/i.test(publicId);
  if (!hasFileExtension) return null;
  
  // Extract transformations
  const rawTransformations = transformationSegment;
  const txSet = new Set(rawTransformations.split(",").filter(Boolean));
  
  // Infer resource type from file extension
  const inferredResourceType = /\.(mp4|webm|mov|avi|wmv|flv|mkv)$/i.test(publicId) ? "video" : "image";
  
  return {
    cloudName: parsed.hostname, // Use CNAME domain as cloudName
    resourceType: inferredResourceType,
    deliveryType: "upload", // Default assumption for CNAME URLs
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

function isSvgFile(publicId, url) {
  if (!publicId && !url) return false;
  const checkString = (publicId || url || "").toLowerCase();
  return /\.svg(\?|$)/i.test(checkString);
}

export function finalizeAnalysis(result) {
  const perAsset = result.cloudinaryRequests.map(entry => {
    const cld = entry.cld || { txSet: new Set() };
    const issues = [];
    const isRawFile = cld.resourceType === "raw";
    const isSvg = isSvgFile(cld.publicId, entry.url);
    
    // Skip f_auto, q_auto, and resizing suggestions for raw files and SVGs
    // SVGs are vector graphics that maintain quality at any size without impacting filesize
    if (!isRawFile && !isSvg) {
      if (!cld.txSet.has("f_auto")) {
        issues.push("Enable f_auto to serve modern formats automatically.");
      }
      const hasQAuto = cld.txSet.has("q_auto") || [...cld.txSet].some(t => t.startsWith("q_auto:"));
      if (!hasQAuto) {
        issues.push("Add q_auto to balance bytes vs quality.");
      }
      
      // Check for resizing transformations
      const hasWidth = [...cld.txSet].some(t => t.startsWith("w_"));
      const hasHeight = [...cld.txSet].some(t => t.startsWith("h_"));
      // Check for any crop mode (c_scale is the default when w_/h_ are present without a c_ parameter)
      const hasCropMode = [...cld.txSet].some(t => t.startsWith("c_"));
      
      // Only suggest resizing if there are no width/height transformations at all
      // Don't suggest c_limit if they already have width/height (they're using c_scale by default, which is fine)
      // Don't suggest changing existing crop modes to c_limit (crop modes are intentional design choices)
      if (!hasWidth && !hasHeight) {
        issues.push("Add w_, h_, and c_limit transformations to resize images and prevent oversized assets.");
      }
    }
    
    const asset = { url: entry.url, issues, cld };
    // Preserve pageUrl if it exists (from sitemap analysis)
    if (entry.pageUrl) {
      asset.pageUrl = entry.pageUrl;
    }
    return asset;
  });

  const total = perAsset.length;
  const suggestions = new Set();

  // Only count image/video assets for f_auto and q_auto suggestions (exclude raw files and SVGs)
  const imageVideoAssets = perAsset.filter(a => {
    const isRaw = a.cld.resourceType === "raw";
    const isSvg = isSvgFile(a.cld.publicId, a.url);
    return !isRaw && !isSvg;
  });
  const imageVideoCount = imageVideoAssets.length;
  
  const autoFormatCount = imageVideoAssets.filter(a => a.cld.txSet.has("f_auto")).length;
  const autoQualityCount = imageVideoAssets.filter(a => a.cld.txSet.has("q_auto") || [...a.cld.txSet].some(t => t.startsWith("q_auto:"))).length;

  if (imageVideoCount > 0) {
    if (autoFormatCount / imageVideoCount < 0.8) {
      suggestions.add("Adopt f_auto to serve modern formats automatically.");
    }
    if (autoQualityCount / imageVideoCount < 0.8) {
      suggestions.add("Adopt q_auto for balanced quality vs bytes.");
    }
  }

  if (result.nonCloudinaryImages.length > 0) {
    suggestions.add("Migrate non-Cloudinary images to leverage optimization & CDN.");
  }

  // Check for assets without resizing transformations (exclude raw files and SVGs)
  // Only suggest resizing when there are no width/height parameters at all
  const assetsNeedingSizing = perAsset.filter(a => {
    const isRaw = a.cld.resourceType === "raw";
    const isSvg = isSvgFile(a.cld.publicId, a.url);
    return !isRaw && !isSvg && a.issues.some(issue => 
      issue.includes("w_, h_, and c_limit")
    );
  });
  
  if (assetsNeedingSizing.length > 0) {
    suggestions.add(`Add w_, h_, and c_limit transformations to ${assetsNeedingSizing.length} image${assetsNeedingSizing.length > 1 ? 's' : ''} to resize and prevent oversized assets.`);
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
  // Exclude raw files and SVGs from optimization scoring
  const optimizedAssets = perAsset.filter(a => {
    const isRaw = a.cld.resourceType === "raw";
    const isSvg = isSvgFile(a.cld.publicId, a.url);
    // For SVGs and raw files, consider them "optimized" since they don't need f_auto/q_auto
    if (isRaw || isSvg) return true;
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
    // Accept as Cloudinary if URL parses as Cloudinary
    // For standard Cloudinary URLs, we also check headers for confirmation
    // For CNAME URLs, we rely on transformation pattern detection
    const isCloudinary = cld && (hasCloudinaryResponseHeaders(e.response) || cld.txSet.size > 0);
    if (isCloudinary) {
      out.cloudinaryRequests.push({ url, response: e.response, cld });
    } else if (isMediaFile(url, mime)) {
      out.nonCloudinaryImages.push({ url });
    }
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
    
    if (cld) {
      out.cloudinaryRequests.push({ 
        url: firstUrl, 
        cld
      });
    } else if (isMediaFile(firstUrl)) {
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