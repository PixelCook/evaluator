const CLD_URL_RE = /https?:\/\/res\.cloudinary\.com\/([^\/]+)\/(image|video)\/(upload|fetch|private|authenticated)\/(.*)/i;
const autoFormatCount = perAsset.filter(a => a.cld.txSet.has("f_auto")).length;
const autoQualityCount = perAsset.filter(a => a.cld.txSet.has("q_auto") || [...a.cld.txSet].some(t => t.startsWith("q_auto:"))).length;


if (total > 0) {
if (autoFormatCount / total < 0.8) { score -= 12; suggestions.add("Adopt f_auto broadly (WebP/AVIF)"); }
if (autoQualityCount / total < 0.8) { score -= 12; suggestions.add("Adopt q_auto for balanced quality vs bytes"); }
}


if (result.nonCloudinaryImages.length > 0) {
score -= 10;
suggestions.add("Migrate non‑Cloudinary images to Cloudinary for optimization & CDN");
}


// Cache‑Control via HAR (if present)
const cacheFindings = [];
for (const r of result.cloudinaryRequests) {
const cc = r.response?.headers?.find?.(h => h.name?.toLowerCase() === "cache-control")?.value || "";
if (cc && !/max-age=/.test(cc)) cacheFindings.push({ url: r.url, note: `Cache-Control suboptimal: ${cc}` });
}
if (cacheFindings.length) { score -= 6; suggestions.add("Tune Cache-Control (longer max-age on versioned URLs)"); }


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
autoQuality: autoQualityCount
}
};
}


export function analyzeFromHar(harJson) {
const entries = (harJson?.log?.entries ?? []).filter(Boolean);
const out = { totalRequests: entries.length, cloudinaryRequests: [], nonCloudinaryImages: [] };


for (const e of entries) {
const url = e.request?.url || "";
const mime = e.response?.content?.mimeType || "";
const cld = parseCloudinaryUrl(url);
if (cld) out.cloudinaryRequests.push({ url, response: e.response, cld });
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