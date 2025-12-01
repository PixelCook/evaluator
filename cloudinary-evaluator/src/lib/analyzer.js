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
  return CLOUDINARY_TX_PATTERN.test(segment) || /^[a-z]+_\d+/.test(segment);
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

  // First, try standard Cloudinary URL structure
  let idx = 0;
  let resourceType = segments[idx];
  let cloudName = "";

  if (!RESOURCE_TYPES.has(resourceType)) {
    cloudName = resourceType;
    idx += 1;
    resourceType = segments[idx];
  }

  if (RESOURCE_TYPES.has(resourceType)) {
    const deliveryType = segments[idx + 1];
    if (DELIVERY_TYPES.has(deliveryType)) {
      // Standard Cloudinary URL structure detected
      const remainderSegments = segments.slice(idx + 2);
      if (!remainderSegments.length) return null;

      // For raw files, transformations are less common, so handle differently
      const isRawFile = resourceType === "raw";
      
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

      const rawTransformations = transformationSegments.join("/");
      const txSet = new Set(rawTransformations.split(",").filter(Boolean));
      const publicId = isRawFile && transformationSegments.length === 0 
        ? remainderSegments.join("/") 
        : remainderSegments.slice(stopIndex).join("/");

      return {
        cloudName: cloudName || parsed.hostname,
        resourceType,
        deliveryType,
        publicId,
        transformations: rawTransformations,
        txSet,
      };
    }
  }

  // Fallback: Detect Cloudinary URLs by transformation patterns (for CNAME scenarios)
  // Look for segments containing Cloudinary transformation patterns
  let transformationSegmentIndex = -1;
  let transformationSegment = "";
  
  for (let i = 0; i < segments.length; i++) {
    if (hasCloudinaryTransformations(segments[i])) {
      transformationSegmentIndex = i;
      transformationSegment = segments[i];
      break;
    }
  }

  if (transformationSegmentIndex === -1) return null;

  // Extract transformations
  const rawTransformations = transformationSegment;
  const txSet = new Set(rawTransformations.split(",").filter(Boolean));
  
  // Everything after the transformation segment is the publicId
  const publicId = segments.slice(transformationSegmentIndex + 1).join("/");
  
  if (!publicId) return null;

  // Try to infer resource type from file extension or default to "image"
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

export function finalizeAnalysis(result) {
  const perAsset = result.cloudinaryRequests.map(entry => {
    const cld = entry.cld || { txSet: new Set() };
    const issues = [];
    const isRawFile = cld.resourceType === "raw";
    
    // Skip f_auto, q_auto, and resizing suggestions for raw files
    if (!isRawFile) {
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
      const hasCLimit = cld.txSet.has("c_limit");
      
      // If no width or height transformations are present, suggest resizing with c_limit
      if (!hasWidth && !hasHeight) {
        issues.push("Add w_, h_, and c_limit transformations to resize images and prevent oversized assets.");
      } else if (!hasCLimit && (hasWidth || hasHeight)) {
        // If they have width/height but no c_limit, suggest adding it as a safety measure
        issues.push("Add c_limit to prevent serving images larger than requested dimensions.");
      }
    }
    
    return { url: entry.url, issues, cld };
  });

  const total = perAsset.length;
  const suggestions = new Set();

  // Only count image/video assets for f_auto and q_auto suggestions (exclude raw files)
  const imageVideoAssets = perAsset.filter(a => a.cld.resourceType !== "raw");
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

  // Check for assets without resizing transformations or c_limit (exclude raw files)
  const assetsNeedingSizing = perAsset.filter(a => {
    return a.cld.resourceType !== "raw" && a.issues.some(issue => 
      issue.includes("w_, h_, and c_limit") || 
      issue.includes("c_limit")
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