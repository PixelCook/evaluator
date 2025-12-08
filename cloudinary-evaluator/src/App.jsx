import React, { useMemo, useState, useEffect, useCallback } from "react";
import "./App.css";
import Donut from "./components/Donut";
import Pill from "./components/Pill";
import Suggestion from "./components/Suggestion";
import { analyzeFromHar, analyzeFromHtml, analyzeFromUrl, finalizeAnalysis } from "./lib/analyzer";

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [htmlInput, setHtmlInput] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [activeTab, setActiveTab] = useState("website");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [expandedDetailsSection, setExpandedDetailsSection] = useState(false);
  const [expandedNonCloudinarySection, setExpandedNonCloudinarySection] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [sitemapProgress, setSitemapProgress] = useState({ current: 0, total: 0, totalPages: 0, completed: [], failed: [] });
  const [sitemapCancelToken, setSitemapCancelToken] = useState(null);
  const [useSitemap, setUseSitemap] = useState(false);
  const [assetDetails, setAssetDetails] = useState(new Map()); // Map<url, {contentLength, contentType, duration, loading, error}>

  // Handle hash navigation to Detailed Analysis section
  useEffect(() => {
    let timeoutId = null;

    const handleHashChange = () => {
      if (window.location.hash === '#detailed-analysis') {
        // Wait for the element to be available (analysis might not be loaded yet)
        const checkElement = () => {
          const element = document.getElementById('detailed-analysis');
          if (element) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              // Expand the section if it's collapsed
              setExpandedDetailsSection(prev => {
                if (!prev) return true;
                return prev;
              });
            }, 100);
            return true;
          }
          return false;
        };

        // Try immediately
        if (!checkElement()) {
          // If not found, try again after a short delay (for when analysis loads)
          timeoutId = setTimeout(() => {
            checkElement();
          }, 500);
        }
      }
    };

    // Handle initial load with hash
    handleHashChange();

    // Handle hash changes
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [analysis]); // Re-run when analysis changes

  // Define loadAssetDetails before useEffect that uses it
  const loadAssetDetails = useCallback(async (asset) => {
    const url = asset.url;
    
    // Check if already loaded or loading
    setAssetDetails(prev => {
      const existing = prev.get(url);
      if (existing && (existing.loading || existing.contentLength)) {
        return prev; // Already loading or loaded
      }
      
      // Set loading state
      const newMap = new Map(prev);
      newMap.set(url, { loading: true, error: null });
      return newMap;
    });
    
    try {
      const details = await fetchAssetSize(url);
      setAssetDetails(prev => {
        const newMap = new Map(prev);
        if (details && details.contentLength) {
          newMap.set(url, {
            contentLength: details.contentLength,
            contentType: details.contentType,
            duration: details.duration,
            loading: false,
            error: null
          });
        } else if (details && details.error) {
          newMap.set(url, {
            loading: false,
            error: details.error,
            status: details.status
          });
        } else {
          newMap.set(url, {
            loading: false,
            error: 'Unable to determine size'
          });
        }
        return newMap;
      });
    } catch (error) {
      setAssetDetails(prev => {
        const newMap = new Map(prev);
        newMap.set(url, {
          loading: false,
          error: error.message || 'Failed to fetch details'
        });
        return newMap;
      });
    }
  }, []);

  // Load asset details automatically for assets with issues and non-Cloudinary images
  useEffect(() => {
    if (analysis) {
      // Load details for Cloudinary assets with issues (they have optimization potential)
      if (analysis.perAsset) {
        const assetsWithIssues = analysis.perAsset.filter(asset => asset.issues && asset.issues.length > 0);
        assetsWithIssues.forEach(asset => {
          loadAssetDetails(asset);
        });
      }
      
      // Load details for non-Cloudinary images (they would benefit from migrating to Cloudinary)
      if (analysis.nonCloudinaryImages) {
        analysis.nonCloudinaryImages.forEach(img => {
          // Create a pseudo-asset object for non-Cloudinary images
          const pseudoAsset = { url: img.url, issues: ['Migrate to Cloudinary'] };
          loadAssetDetails(pseudoAsset);
        });
      }
    }
  }, [analysis, loadAssetDetails]);

  const cloudNames = useMemo(() => {
    if (!analysis) return [];
    const names = (analysis.cloudinaryRequests ?? [])
      .map(req => req.cld?.cloudName)
      .filter(Boolean);
    return [...new Set(names)];
  }, [analysis]);

  // Calculate total potential bandwidth savings
  const totalBandwidthSavings = useMemo(() => {
    if (!analysis) return null;
    
    let totalSavings = 0;
    let totalCurrentSize = 0;
    let assetsWithSavings = 0;
    let cloudinaryAssetsWithSavings = 0;
    let nonCloudinaryAssetsWithSavings = 0;
    
    // Calculate savings for Cloudinary assets
    if (analysis.perAsset) {
      analysis.perAsset.forEach(asset => {
        const details = assetDetails.get(asset.url);
        if (details && details.contentLength) {
          const savings = calculatePotentialSavings(asset, details);
          if (savings && savings.potentialSavings > 0) {
            totalSavings += savings.potentialSavings;
            totalCurrentSize += savings.currentSize;
            assetsWithSavings++;
            cloudinaryAssetsWithSavings++;
          }
        }
      });
    }
    
    // Calculate savings for non-Cloudinary images
    if (analysis.nonCloudinaryImages) {
      analysis.nonCloudinaryImages.forEach(img => {
        const details = assetDetails.get(img.url);
        if (details && details.contentLength) {
          const pseudoAsset = { url: img.url, issues: ['Migrate to Cloudinary'] };
          const savings = calculatePotentialSavings(pseudoAsset, details);
          if (savings && savings.potentialSavings > 0) {
            totalSavings += savings.potentialSavings;
            totalCurrentSize += savings.currentSize;
            assetsWithSavings++;
            nonCloudinaryAssetsWithSavings++;
          }
        }
      });
    }
    
    const savingsPercent = totalCurrentSize > 0 
      ? Math.round((totalSavings / totalCurrentSize) * 100) 
      : 0;
    
    return {
      totalSavings,
      totalCurrentSize,
      savingsPercent,
      assetsWithSavings,
      cloudinaryAssetsWithSavings,
      nonCloudinaryAssetsWithSavings,
      totalAssets: (analysis.perAsset?.length || 0) + (analysis.nonCloudinaryImages?.length || 0)
    };
  }, [analysis, assetDetails]);

  const getIssueDocLink = (issue) => {
    if (issue.includes("f_auto")) {
      return "https://cloudinary.com/documentation/transformation_reference#f_auto";
    }
    if (issue.includes("q_auto")) {
      return "https://cloudinary.com/documentation/transformation_reference#q_auto";
    }
    if (issue.includes("width/height transformations") || issue.includes("resize")) {
      return "https://cloudinary.com/documentation/resizing_and_cropping#banner";
    }
    if (issue.includes("c_limit")) {
      return "https://cloudinary.com/documentation/transformation_reference#c_limit";
    }
    if (issue.includes("Cache-Control")) {
      return "https://cloudinary.com/documentation/caching";
    }
    if (issue.includes("Migrate non-Cloudinary")) {
      return "https://cloudinary.com/documentation/image_upload_api_reference";
    }
    return null;
  };

  const getScoreColor = (score) => {
    if (score >= 90) return "green";
    if (score >= 75) return "blue";
    if (score >= 50) return "yellow";
    return "red";
  };

  const recommendationsByIssue = useMemo(() => {
    if (!analysis?.perAsset) return [];
    const issueMap = new Map();
    
    analysis.perAsset.forEach(asset => {
      asset.issues.forEach(issue => {
        if (!issueMap.has(issue)) {
          issueMap.set(issue, { issue, urls: [] });
        }
        issueMap.get(issue).urls.push(asset.url);
      });
    });
    
    return Array.from(issueMap.values()).map(item => ({
      issue: item.issue,
      count: item.urls.length,
      urls: item.urls,
      docLink: getIssueDocLink(item.issue),
    }));
  }, [analysis]);

  const problemUrls = useMemo(() => {
    if (!analysis?.perAsset) return [];
    return analysis.perAsset
      .filter(asset => asset.issues.length > 0)
      .map(asset => asset.url);
  }, [analysis]);

  const correctUrls = useMemo(() => {
    if (!analysis?.perAsset) return [];
    return analysis.perAsset
      .filter(asset => asset.issues.length === 0)
      .map(asset => asset.url);
  }, [analysis]);

  const sortedAssets = useMemo(() => {
    if (!analysis?.perAsset) return [];
    if (!sortColumn) return analysis.perAsset;

    const sorted = [...analysis.perAsset].sort((a, b) => {
      let aValue, bValue;

      switch (sortColumn) {
        case 'url':
          aValue = a.url.toLowerCase();
          bValue = b.url.toLowerCase();
          break;
        case 'pageUrl':
          aValue = (a.pageUrl || '').toLowerCase();
          bValue = (b.pageUrl || '').toLowerCase();
          break;
        case 'status':
          // Sort by hasIssues: problems first if ascending, correct first if descending
          aValue = a.issues.length > 0 ? 1 : 0;
          bValue = b.issues.length > 0 ? 1 : 0;
          break;
        case 'issues':
          aValue = a.issues.length;
          bValue = b.issues.length;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [analysis, sortColumn, sortDirection]);

  async function handleHarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    setError("");
    setStatus(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = analyzeFromHar(json);
      setAnalysis(result);
      setStatus(`Analyzed ${file.name}`);
    } catch (err) {
      console.error('HAR upload error:', {
        message: err.message,
        stack: err.stack,
        error: err
      });
      setError("Failed to parse HAR file. Please ensure it's a valid HAR file.");
      setStatus("");
    } finally {
      setIsBusy(false);
    }
  }

  function handleHtmlAnalyze() {
    if (!htmlInput.trim()) {
      setError("Paste some HTML first.");
      return;
    }
    setIsBusy(true);
    setError("");
    setStatus("Scanning HTML…");
    try {
      const result = analyzeFromHtml(htmlInput);
      setAnalysis(result);
      setStatus("HTML scan complete.");
    } catch (err) {
      console.error('HTML analyze error:', {
        message: err.message,
        stack: err.stack,
        error: err
      });
      setError("Failed to analyze HTML. Please check the HTML content.");
      setStatus("");
    } finally {
      setIsBusy(false);
    }
  }

  async function fetchThroughWorker(url) {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl || typeof workerUrl !== 'string' || workerUrl.trim() === '' || 
        workerUrl.includes('your-subdomain') ||
        (!workerUrl.startsWith('http://') && !workerUrl.startsWith('https://'))) {
      throw new Error('Worker not configured');
    }
    
    const trimmedWorkerUrl = workerUrl.trim().replace(/\/+$/, '');
    const proxyUrl = `${trimmedWorkerUrl}?url=${encodeURIComponent(url)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    
    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/html' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const text = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = { error: response.statusText, status: response.status };
        }
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  }

  function parseRobotsTxt(robotsText) {
    const sitemaps = [];
    const lines = robotsText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('sitemap:')) {
        const sitemapUrl = trimmed.substring(8).trim();
        if (sitemapUrl) {
          sitemaps.push(sitemapUrl);
        }
      }
    }
    return sitemaps;
  }

  async function fetchAssetSize(url) {
    try {
      // Make an initial HEAD request
      let response = await fetch(url, { method: 'HEAD' });
      const cldError = response.headers.get('x-cld-error');
      
      // Check if the status is greater than 399
      if (response.status > 399) {
        return { status: response.status, error: cldError };
      }
      
      let contentLength = response.headers.get('Content-Length');
      let contentType = response.headers.get('Content-Type');
      let serverTiming = response.headers.get('Server-Timing');
      let duration = 0;
      
      if (serverTiming) {
        const durationMatch = serverTiming.match(/du=(\d+(\.\d+)?)/);
        if (durationMatch) {
          duration = parseFloat(durationMatch[1]);
        }
      }
      
      if (contentLength && contentLength > 0) {
        contentLength = parseInt(contentLength, 10);
        return { contentLength, contentType, duration };
      }
      
      // If Content-Length is not available or is 0, add a delay and then make a range request
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Make a range request to determine the total size
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-'
        }
      });
      
      const contentRange = response.headers.get('Content-Range');
      if (contentRange) {
        const sizeMatch = contentRange.match(/\/(\d+)$/);
        if (sizeMatch) {
          contentLength = parseInt(sizeMatch[1], 10);
          if (contentLength > 0) {
            return { contentLength, contentType, duration };
          }
        }
      }
      
      // If unable to determine size, return null
      return null;
    } catch (error) {
      console.error('Error fetching asset size:', error);
      return null;
    }
  }

  function transformContentType(contentType) {
    if (!contentType) return 'Unknown';
    const typeParts = contentType.split(';');
    let format = typeParts[0].split('/')[1]?.toUpperCase() || 'Unknown';
    let codec = 'Unknown';
    
    if (typeParts.length > 1) {
      const codecMatch = typeParts[1].match(/codecs="?(.*?)"?$/);
      if (codecMatch && codecMatch[1]) {
        codec = codecMatch[1].toUpperCase();
      }
    }
    
    return `${format}, Codec=${codec}`;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function formatToMB(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      // For values less than 1MB, show in KB or bytes
      const kb = bytes / 1024;
      if (kb < 1) {
        return bytes + ' B';
      }
      return Math.round(kb * 100) / 100 + ' KB';
    }
    return Math.round(mb * 100) / 100 + ' MB';
  }

  function calculatePotentialSavings(asset, details) {
    if (!details || !details.contentLength) return null;
    
    const currentSize = details.contentLength;
    const issues = asset.issues || [];
    let potentialSavings = 0;
    const optimizations = [];
    
    // Check if this is a non-Cloudinary asset (would get all optimizations)
    const isNonCloudinary = issues.some(issue => issue.includes('Migrate to Cloudinary'));
    
    if (isNonCloudinary) {
      // Non-Cloudinary images would benefit from all optimizations when migrated
      // Estimate combined savings: format (25%) + quality (15%) + resizing (10%) = ~40% total
      potentialSavings = currentSize * 0.40;
      optimizations.push(
        { type: 'Format (f_auto)', savings: currentSize * 0.25 },
        { type: 'Quality (q_auto)', savings: currentSize * 0.15 },
        { type: 'Resizing (w_1200, c_limit)', savings: currentSize * 0.10 }
      );
    } else {
      // Estimate based on average savings percentages for Cloudinary assets
      // Check for missing f_auto (format optimization)
      if (issues.some(issue => issue.includes('f_auto'))) {
        // Estimate 20-30% savings from modern formats (WebP, AVIF)
        const formatSavings = currentSize * 0.25;
        potentialSavings += formatSavings;
        optimizations.push({ type: 'Format (f_auto)', savings: formatSavings });
      }
      
      // Check for missing q_auto (quality optimization)
      if (issues.some(issue => issue.includes('q_auto'))) {
        // Estimate 10-20% savings from quality optimization
        const qualitySavings = currentSize * 0.15;
        potentialSavings += qualitySavings;
        optimizations.push({ type: 'Quality (q_auto)', savings: qualitySavings });
      }
      
      // Check for missing resizing (c_limit)
      if (issues.some(issue => issue.includes('c_limit') || issue.includes('resize'))) {
        // Estimate 5-15% savings from proper resizing
        const resizeSavings = currentSize * 0.10;
        potentialSavings += resizeSavings;
        optimizations.push({ type: 'Resizing (c_limit)', savings: resizeSavings });
      }
      
      // Avoid double counting - if multiple optimizations, use a combined estimate
      if (optimizations.length > 1) {
        // Combined savings might be less than sum (some overlap)
        potentialSavings = currentSize * Math.min(0.4, optimizations.length * 0.15);
      }
    }
    
    return {
      currentSize,
      potentialSavings: Math.round(potentialSavings),
      optimizedSize: Math.round(currentSize - potentialSavings),
      savingsPercent: Math.round((potentialSavings / currentSize) * 100),
      optimizations,
      isNonCloudinary
    };
  }

  function hasCloudinaryTransformations(segment) {
    if (!segment) return false;
    const CLOUDINARY_TX_PATTERN = /[a-z]+_(?:auto|limit|fill|crop|scale|fit|pad|lfill|limit|mfit|mpad|thumb|imagga_crop|imagga_scale|imagga_pad|\d+)/i;
    if (!segment.includes(',')) {
      return CLOUDINARY_TX_PATTERN.test(segment);
    }
    const parts = segment.split(',');
    return parts.some(part => CLOUDINARY_TX_PATTERN.test(part.trim()) || /^[a-z]+_\d+/.test(part.trim()));
  }

  function buildOptimizedUrl(asset) {
    if (!asset.cld) return null;
    
    const cld = asset.cld;
    const currentUrl = asset.url;
    const issues = asset.issues || [];
    
    try {
      const urlObj = new URL(currentUrl);
      const segments = urlObj.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
      
      // Get existing transformations
      const existingTx = cld.transformations ? cld.transformations.split(",").filter(Boolean) : [];
      const txSet = new Set(existingTx);
      
      // Extract existing width and height if present
      let existingWidth = null;
      let existingHeight = null;
      for (const tx of existingTx) {
        if (tx.startsWith('w_')) {
          const widthMatch = tx.match(/^w_(\d+)/);
          if (widthMatch) existingWidth = parseInt(widthMatch[1], 10);
        }
        if (tx.startsWith('h_')) {
          const heightMatch = tx.match(/^h_(\d+)/);
          if (heightMatch) existingHeight = parseInt(heightMatch[1], 10);
        }
      }
      
      // Add missing optimizations
      const needsFAuto = issues.some(issue => issue.includes('f_auto'));
      const needsQAuto = issues.some(issue => issue.includes('q_auto'));
      const needsResize = issues.some(issue => issue.includes('resize') || issue.includes('w_, h_'));
      const needsCLimit = issues.some(issue => issue.includes('c_limit'));
      
      // Build optimized transformations
      const optimizedTx = [...existingTx];
      
      // Add resizing if needed (width/height with c_limit)
      const hasWidth = existingWidth !== null;
      const hasHeight = existingHeight !== null;
      
      if (needsResize && (!hasWidth && !hasHeight)) {
        // Add default responsive dimensions for displayable content
        // Use 1200px width as a reasonable desktop display size
        optimizedTx.push('w_1200');
        optimizedTx.push('c_limit');
      } else if (hasWidth || hasHeight) {
        // If width/height exist, ensure c_limit is present
        if (needsCLimit && !txSet.has('c_limit')) {
          optimizedTx.push('c_limit');
        }
      }
      
      if (needsFAuto && !txSet.has('f_auto')) {
        optimizedTx.push('f_auto');
      }
      if (needsQAuto && !txSet.has('q_auto') && ![...txSet].some(t => t.startsWith('q_auto:'))) {
        optimizedTx.push('q_auto');
      }
      
      // Reconstruct URL with optimized transformations
      if (cld.resourceType && cld.deliveryType) {
        // Standard Cloudinary URL structure
        const cloudName = cld.cloudName || urlObj.hostname;
        const basePath = `/${cloudName}/${cld.resourceType}/${cld.deliveryType}`;
        const txString = optimizedTx.length > 0 ? optimizedTx.join(',') : '';
        const publicId = cld.publicId || '';
        
        // Build the path
        let optimizedPath = basePath;
        if (txString) {
          optimizedPath += `/${txString}`;
        }
        if (publicId) {
          optimizedPath += `/${publicId}`;
        }
        
        return `${urlObj.protocol}//${urlObj.host}${optimizedPath}`;
      } else {
        // CNAME or non-standard structure - try to insert transformations
        // Find where transformations should go
        let txIndex = -1;
        for (let i = 0; i < segments.length; i++) {
          if (hasCloudinaryTransformations(segments[i])) {
            txIndex = i;
            break;
          }
        }
        
        if (txIndex >= 0) {
          // Replace existing transformations
          const newSegments = [...segments];
          newSegments[txIndex] = optimizedTx.join(',');
          return `${urlObj.protocol}//${urlObj.host}/${newSegments.join('/')}`;
        } else {
          // Try to insert transformations before the public ID
          // Look for a segment that looks like a file/public ID
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].includes('.') || segments[i].length > 10) {
              // Likely a public ID or filename
              const newSegments = [...segments];
              newSegments.splice(i, 0, optimizedTx.join(','));
              return `${urlObj.protocol}//${urlObj.host}/${newSegments.join('/')}`;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error building optimized URL:', error);
      return null;
    }
  }

  function parseSitemap(xmlText) {
    const urls = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    
    // Check for sitemap index
    const sitemapIndex = doc.querySelector('sitemapindex');
    if (sitemapIndex) {
      const sitemapUrls = Array.from(doc.querySelectorAll('sitemap > loc')).map(el => el.textContent.trim());
      return { type: 'index', urls: sitemapUrls };
    }
    
    // Regular sitemap
    const urlElements = doc.querySelectorAll('url > loc');
    urlElements.forEach(el => {
      const url = el.textContent.trim();
      if (url) urls.push(url);
    });
    
    return { type: 'sitemap', urls };
  }

  function compileSitemapResults(pageResults, totalPages) {
    const allCloudinaryRequests = [];
    const allNonCloudinaryImages = [];
    let totalRequests = 0;
    
    pageResults.forEach(({ url: pageUrl, result }) => {
      totalRequests += result.totalRequests || 0;
      
      result.cloudinaryRequests?.forEach(req => {
        allCloudinaryRequests.push({ ...req, pageUrl });
      });
      
      result.nonCloudinaryImages?.forEach(img => {
        allNonCloudinaryImages.push({ ...img, pageUrl });
      });
    });
    
    const combinedResult = {
      totalRequests,
      cloudinaryRequests: allCloudinaryRequests,
      nonCloudinaryImages: allNonCloudinaryImages
    };
    
    const finalized = finalizeAnalysis(combinedResult);
    
    return {
      ...finalized,
      isSitemapAnalysis: true,
      sitemapStats: {
        pagesAnalyzed: pageResults.length,
        totalPagesInSitemap: totalPages,
        percentage: totalPages > 0 ? ((pageResults.length / totalPages) * 100).toFixed(1) : '0.0'
      }
    };
  }

  async function handleSiteUrlAnalyze() {
    if (!siteUrl.trim()) {
      setError("Enter a website URL first.");
      return;
    }
    setIsBusy(true);
    setError("");
    setStatus(`Fetching ${siteUrl}…`);
    
    const cancelToken = { cancelled: false };
    setSitemapCancelToken(cancelToken);
    setSitemapProgress({ current: 0, total: 0, totalPages: 0, completed: [], failed: [] });
    
    try {
      let url = siteUrl.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }
      
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      
      console.log('[App] Starting site URL analysis:', {
        siteUrl,
        normalizedUrl: url,
        baseUrl,
        timestamp: new Date().toISOString()
      });
      
      // Validate worker URL
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      if (!workerUrl || typeof workerUrl !== 'string' || workerUrl.trim() === '' || 
          workerUrl.includes('your-subdomain') ||
          (!workerUrl.startsWith('http://') && !workerUrl.startsWith('https://'))) {
        setError("Website URL fetching is not configured. Please use HAR file upload or paste HTML as an alternative method.");
        setStatus("");
        setIsBusy(false);
        return;
      }
      
      // Step 1: Check robots.txt for sitemap, then try domain/sitemap.xml (only if checkbox is enabled)
      let sitemapUrl = null;
      let sitemapXml = null;
      if (useSitemap) {
        setStatus("Checking robots.txt for sitemap...");
        try {
          const robotsUrl = `${baseUrl}/robots.txt`;
          const robotsText = await fetchThroughWorker(robotsUrl);
          const sitemaps = parseRobotsTxt(robotsText);
          if (sitemaps.length > 0) {
            sitemapUrl = sitemaps[0];
            console.log('[App] Found sitemap in robots.txt:', sitemapUrl);
          }
        } catch (err) {
          console.log('[App] robots.txt not found or error:', err.message);
        }
        
        // Fallback: Try domain/sitemap.xml if not found in robots.txt
        if (!sitemapUrl) {
          setStatus("Checking domain/sitemap.xml...");
          try {
            const defaultSitemapUrl = `${baseUrl}/sitemap.xml`;
            // Try to fetch and parse it to verify it's a valid sitemap
            const fetchedSitemapXml = await fetchThroughWorker(defaultSitemapUrl);
            // If we got content, try to parse it
            if (fetchedSitemapXml) {
              const testParse = parseSitemap(fetchedSitemapXml);
              // If parsing succeeded (has urls or is an index), use it
              if (testParse.urls && testParse.urls.length > 0) {
                sitemapUrl = defaultSitemapUrl;
                sitemapXml = fetchedSitemapXml; // Store it so we don't fetch again
                console.log('[App] Found sitemap at domain/sitemap.xml:', sitemapUrl);
              }
            }
          } catch (err) {
            console.log('[App] domain/sitemap.xml not found or error:', err.message);
            // Continue with single page analysis
          }
        }
      }
      
      // Step 2: If sitemap found and enabled, analyze 10 random pages
      if (useSitemap && sitemapUrl && !cancelToken.cancelled) {
        // Only fetch if we haven't already fetched it (from domain/sitemap.xml check)
        if (!sitemapXml) {
          setStatus("Fetching sitemap...");
          sitemapXml = await fetchThroughWorker(sitemapUrl);
        }
        if (cancelToken.cancelled) return;
        
        const sitemapData = parseSitemap(sitemapXml);
        let urlsToAnalyze = [];
        
        if (sitemapData.type === 'index') {
          // Fetch first sitemap from index
          if (sitemapData.urls.length > 0) {
            setStatus("Fetching first sitemap from index...");
            const firstSitemapXml = await fetchThroughWorker(sitemapData.urls[0]);
            if (cancelToken.cancelled) return;
            const firstSitemap = parseSitemap(firstSitemapXml);
            urlsToAnalyze = firstSitemap.urls;
          }
        } else {
          urlsToAnalyze = sitemapData.urls;
        }
        
        if (urlsToAnalyze.length > 0 && !cancelToken.cancelled) {
          const totalPages = urlsToAnalyze.length;
          
          // Randomly select 10 pages (or all if less than 10)
          const numPagesToAnalyze = Math.min(10, urlsToAnalyze.length);
          const shuffled = [...urlsToAnalyze].sort(() => Math.random() - 0.5);
          const pagesToAnalyze = shuffled.slice(0, numPagesToAnalyze);
          
          const percentage = ((pagesToAnalyze.length / totalPages) * 100).toFixed(1);
          
          setSitemapProgress({ 
            current: 0, 
            total: pagesToAnalyze.length, 
            totalPages,
            completed: [], 
            failed: [] 
          });
          
          setStatus(`Analyzing ${numPagesToAnalyze} random pages (${percentage}% of ${totalPages} pages in sitemap)...`);
          
          const allResults = [];
          const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          
          for (let i = 0; i < pagesToAnalyze.length; i++) {
            if (cancelToken.cancelled) {
              setStatus("Analysis cancelled.");
              setIsBusy(false);
              return;
            }
            
            const pageUrl = pagesToAnalyze[i];
            setSitemapProgress(prev => ({ ...prev, current: i + 1 }));
            setStatus(`Analyzing page ${i + 1}/${pagesToAnalyze.length} (${percentage}% of ${totalPages} total)...`);
            
            try {
              const html = await fetchThroughWorker(pageUrl);
              if (cancelToken.cancelled) return;
              
      const result = analyzeFromHtml(html);
              allResults.push({ url: pageUrl, result });
              
              setSitemapProgress(prev => ({
                ...prev,
                completed: [...prev.completed, pageUrl]
              }));
              
              if (i < pagesToAnalyze.length - 1) {
                await delay(2000);
              }
            } catch (err) {
              console.error(`[App] Failed to analyze ${pageUrl}:`, err);
              setSitemapProgress(prev => ({
                ...prev,
                failed: [...prev.failed, { url: pageUrl, error: err.message }]
              }));
            }
          }
          
          if (cancelToken.cancelled) return;
          
          setStatus("Compiling results...");
          const compiledResult = compileSitemapResults(allResults, totalPages);
          setAnalysis(compiledResult);
          setStatus(`Analysis complete: ${allResults.length} pages analyzed (${percentage}% of ${totalPages} total pages)`);
          setIsBusy(false);
          return;
        }
      }
      
      // Step 3: Fallback to single page analysis
      if (cancelToken.cancelled) return;
      
      setStatus(`Fetching ${url}…`);
      const html = await fetchThroughWorker(url);
      if (cancelToken.cancelled) return;
      
      console.log('[App] Received HTML, length:', html.length);
      
      const result = analyzeFromHtml(html);
      console.log('[App] Analysis complete:', {
        assetsFound: result.perAsset?.length || 0,
        score: result.score,
        totalRequests: result.totalRequests,
        cloudinaryAssets: result.coverage?.cloudinary || 0,
        nonCloudinaryImages: result.coverage?.nonCloudinaryImages || 0
      });
      
      const totalAssets = (result.perAsset?.length || 0) + (result.nonCloudinaryImages?.length || 0);
      if (totalAssets === 0) {
        setError("No images or assets were found in the analysis. This may indicate that the website is blocking automated requests or serving content dynamically. Please try: (1) Whitelisting the user-agent 'CloudinaryEvaluator/1.0' in your bot protection settings, or (2) Using a HAR file export from your browser instead.");
        setStatus("");
        setIsBusy(false);
        return;
      }
      
      setAnalysis(result);
      setStatus(`Analyzed ${url}`);
    } catch (err) {
      console.error('[App] Site URL analyze error:', {
        message: err.message,
        name: err.name,
        stack: err.stack,
        error: err,
        url: siteUrl,
        timestamp: new Date().toISOString()
      });
      
      const errorMessage = err.message && err.message.length > 0 
        ? err.message 
        : "Failed to fetch or analyze the website. Please try using a HAR file or paste HTML directly.";
      
      setError(errorMessage);
      setStatus("");
    } finally {
      setIsBusy(false);
      setSitemapCancelToken(null);
    }
  }

  function handleDeliveryUrlAnalyze() {
    if (!deliveryUrl.trim()) {
      setError("Enter a Cloudinary delivery URL first.");
      return;
    }
    setIsBusy(true);
    setError("");
    setStatus("Analyzing delivery URL…");
    try {
      const result = analyzeFromUrl(deliveryUrl.trim());
      setAnalysis(result);
      setStatus("Delivery URL analyzed.");
    } catch (err) {
      console.error('Delivery URL analyze error:', {
        message: err.message,
        stack: err.stack,
        error: err,
        url: deliveryUrl
      });
      setError("Failed to analyze the delivery URL. Please check that it's a valid Cloudinary URL.");
      setStatus("");
    } finally {
      setIsBusy(false);
    }
  }

  function resetAnalysis() {
    setAnalysis(null);
    setHtmlInput("");
    setSiteUrl("");
    setDeliveryUrl("");
    setStatus("");
    setError("");
    setExpandedDetailsSection(false);
    setExpandedNonCloudinarySection(false);
    setExpandedRows(new Set());
    setSortColumn(null);
    setSortDirection('asc');
  }

  function exportUrls(urls, filename) {
    const content = urls.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  function handleExportAllAssets() {
    const allUrls = analysis.perAsset.map(asset => asset.url);
    exportUrls(allUrls, "cloudinary-all-assets.txt");
  }

  function handleExportAllData() {
    const data = {
      recommendations: recommendationsByIssue,
      problemUrls,
      correctUrls,
      allAssets: analysis.perAsset.map(asset => ({
        url: asset.url,
        issues: asset.issues
      }))
    };
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudinary-analysis-data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleExportTableCSV() {
    if (!analysis?.perAsset) return;
    
    const headers = ['URL', 'Status', 'Issues Count', 'Issues'];
    const rows = analysis.perAsset.map(asset => [
      asset.url,
      asset.issues.length > 0 ? 'Problem' : 'Correct',
      asset.issues.length.toString(),
      asset.issues.join('; ')
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudinary-analysis-table.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toggleRowExpansion(assetUrl) {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(assetUrl)) {
      newExpanded.delete(assetUrl);
    } else {
      newExpanded.add(assetUrl);
    }
    setExpandedRows(newExpanded);
  }

  function handleSort(column) {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function getSortIcon(column) {
    if (sortColumn !== column) {
      return <span className="text-slate-400 ml-1">↕</span>;
    }
    return sortDirection === 'asc' 
      ? <span className="text-blue-600 ml-1">↑</span>
      : <span className="text-blue-600 ml-1">↓</span>;
  }

  return (
    <div className="bg-white min-h-screen text-gray-800">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start mb-4">
            <img
              src="https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_auto,c_limit,dpr_auto/media-editor/cld-logos/vector_cloudinary_logo_blue_0720_eps.png"
              alt="Cloudinary Logo"
              className="h-12 sm:h-16 md:h-20 w-auto max-w-full"
              loading="lazy"
            />
          </div>
          <p className="text-sm uppercase tracking-wider text-blue-600 font-semibold">
            Cloudinary Evaluator
          </p>
          <h1 className="text-4xl font-bold mt-2">Optimize. Measure. Evaluate.</h1>
          <p className="text-slate-600 mt-3 max-w-3xl mx-auto lg:mx-0">
          Fetch a website URL, upload a HAR export, paste HTML, or analyze a Cloudinary delivery URL to get instant insights into Cloudinary usage, media coverage, and the fastest wins to chase next.{" "}
            <a
              href="https://cloudinary.com/documentation"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              Learn more about Cloudinary →
            </a>
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="bg-white rounded-3xl p-6 shadow border border-slate-200">
          <h2 className="text-2xl font-semibold">Scan a page</h2>
          <p className="text-slate-600 mt-2">
            Enter a website URL to analyze Cloudinary usage and get optimization recommendations. Alternative methods available below.
          </p>

          <div className="mt-6">
            <div className="flex flex-wrap gap-2 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab("website")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "website"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
                disabled={isBusy}
              >
                Website URL
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("html")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "html"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
                disabled={isBusy}
              >
                HTML
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("delivery")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "delivery"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
                disabled={isBusy}
              >
                Delivery URL
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("har")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "har"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
                disabled={isBusy}
              >
                HAR File (Backup)
              </button>
            </div>

            <div className="mt-6">
              {activeTab === "har" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Upload HAR File (Alternative Method)</label>
                  <input
                    type="file"
                    accept=".har,application/json"
                    className="mt-2 block w-full rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={handleHarUpload}
                    disabled={isBusy}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Upload a HAR file to analyze a saved network capture. Chrome/Edge: DevTools → Network → Save all as{" "}
                    <a href="https://developer.chrome.com/docs/devtools/network/reference/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">HAR</a>.
                  </p>
                </div>
              )}

              {activeTab === "html" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Paste HTML</label>
                  <textarea
                    value={htmlInput}
                    onChange={e => setHtmlInput(e.target.value)}
                    rows={8}
                    className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="<img src='https://res.cloudinary.com/demo/...'>"
                    disabled={isBusy}
                  />
                  <div className="flex flex-wrap gap-3 mt-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-white font-semibold disabled:opacity-60"
                      onClick={handleHtmlAnalyze}
                      disabled={isBusy || !htmlInput.trim()}
                    >
                      Scan HTML
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "website" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-slate-700">Website URL</label>
                    <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">Recommended</span>
                  </div>
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={e => setSiteUrl(e.target.value)}
                    className="mt-2 block w-full rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com"
                    disabled={isBusy}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="use-sitemap"
                      checked={useSitemap}
                      onChange={e => setUseSitemap(e.target.checked)}
                      disabled={isBusy}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="use-sitemap" className="text-sm text-slate-700 cursor-pointer">
                      Analyze random 10 pages from sitemap.xml (checks robots.txt and domain/sitemap.xml).
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Enter your website URL to analyze your Cloudinary usage. Enable the checkbox above to analyze multiple pages from your sitemap. Optimization savings are estimated based on average savings percentages (25% for format optimization, 15% for quality optimization, 10% for resizing).
                  </p>
                  {sitemapProgress.total > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-900">
                          Analyzing page {sitemapProgress.current} of {sitemapProgress.total}
                          {sitemapProgress.totalPages > 0 && (
                            <span className="text-xs font-normal text-blue-700 ml-2">
                              ({sitemapProgress.totalPages > 0 ? ((sitemapProgress.current / sitemapProgress.totalPages) * 100).toFixed(1) : '0.0'}% of {sitemapProgress.totalPages} total pages)
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (sitemapCancelToken) {
                              sitemapCancelToken.cancelled = true;
                            }
                            setSitemapProgress({ current: 0, total: 0, totalPages: 0, completed: [], failed: [] });
                          }}
                          className="text-xs text-blue-700 hover:text-blue-900 underline"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${sitemapProgress.total > 0 ? (sitemapProgress.current / sitemapProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-blue-700">
                        Completed: {sitemapProgress.completed.length} | Failed: {sitemapProgress.failed.length}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 mt-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-white font-semibold disabled:opacity-60"
                      onClick={handleSiteUrlAnalyze}
                      disabled={isBusy || !siteUrl.trim()}
                    >
                      Analyze Site
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "delivery" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Cloudinary Delivery URL</label>
                  <input
                    type="url"
                    value={deliveryUrl}
                    onChange={e => setDeliveryUrl(e.target.value)}
                    className="mt-2 block w-full rounded-2xl border border-slate-300 px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://res.cloudinary.com/demo/image/upload/sample.jpg"
                    disabled={isBusy}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Analyze a single Cloudinary delivery URL for optimization opportunities.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-white font-semibold disabled:opacity-60"
                      onClick={handleDeliveryUrlAnalyze}
                      disabled={isBusy || !deliveryUrl.trim()}
                    >
                      Analyze URL
                    </button>
                  </div>
                </div>
              )}
            </div>

            {analysis && (
              <div className="mt-6 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-60"
                  onClick={resetAnalysis}
                  disabled={isBusy}
                >
                  Reset
                </button>
              </div>
            )}

            {status && <div className="mt-4 text-sm text-blue-600">{status}</div>}
            {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
          </div>
        </section>

        <aside className="bg-gradient-to-b from-white to-blue-50 rounded-3xl p-6 shadow border border-blue-100 relative overflow-hidden">
          <div 
            className="absolute inset-0 opacity-5 pointer-events-none"
            // style={{
            //   backgroundImage: `url('https://cdn.prod.website-files.com/64d41aab8183c7c3324ddb29/674f5ed6ef4a6bb77f9723ba_0-glyph-square.svg')`,
            //   backgroundSize: '20%',
            //   backgroundRepeat: 'repeat',
            //   backgroundPosition: 'center stretch',
            // }}
          />
          <div className="relative z-10">
            <div>
              <h2 className="text-xl font-semibold">Cloudinary Evaluator Score:</h2>
              {cloudNames.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {cloudNames.map(name => (
                    <Pill key={name}>{name}</Pill>
                  ))}
                </div>
              )}
            </div>

            <div className="grid place-items-center mt-6">
              <Donut value={analysis?.score ?? 0} color={getScoreColor(analysis?.score ?? 0)} />
            </div>

            <p className="mt-4 text-slate-700">
              {analysis ? (
                <>
                  You are currently capturing{" "}
                  <strong>{analysis.score}%</strong> of Cloudinary's potential value.
                  {analysis.isSitemapAnalysis && analysis.sitemapStats && (
                    <span className="block mt-2 text-sm text-slate-600">
                      Sample size: {analysis.sitemapStats.pagesAnalyzed} of {analysis.sitemapStats.totalPagesInSitemap} pages ({analysis.sitemapStats.percentage}%)
                    </span>
                  )}
                </>
              ) : (
                <>Enter a website URL above to analyze your Cloudinary usage.</>
              )}
            </p>

            {totalBandwidthSavings && totalBandwidthSavings.totalSavings > 0 && (
              <div className="mt-6 p-4 bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-xl">
                <h3 className="font-semibold text-green-900 mb-2 mt-0">Estimated Potential Bandwidth Savings</h3>
                <div className="text-3xl font-bold text-green-700 mb-1">
                  {totalBandwidthSavings.savingsPercent}%
                  <span className="text-base font-normal text-slate-600 ml-2">
                    ({formatToMB(totalBandwidthSavings.totalSavings)})
                  </span>
                </div>
                {totalBandwidthSavings.nonCloudinaryAssetsWithSavings > 0 && (
                  <div className="text-sm text-slate-600">
                    Includes {totalBandwidthSavings.nonCloudinaryAssetsWithSavings} non-Cloudinary image{totalBandwidthSavings.nonCloudinaryAssetsWithSavings > 1 ? 's' : ''} that would benefit from migrating to Cloudinary (~40% estimated savings).
                  </div>
                )}
              </div>
            )}

            {analysis && (
              <div className="mt-6">
                <h3 className="font-semibold">Suggestions</h3>
                {analysis.suggestions.length ? (
                  <ul className="mt-2 space-y-2">
                    {analysis.suggestions.map((text, index) => {
                      const docLink = getIssueDocLink(text);
                      return (
                        <li key={index} className="flex gap-3 items-start">
                          <span className="mt-2 w-2 h-2 rounded-full bg-blue-500" />
                          <div className="flex-1">
                            {docLink ? (
                              <a
                                href={docLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {text}
                              </a>
                            ) : (
                              <span>{text}</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-slate-600 mt-2">No immediate suggestions — nice work!</p>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-xl bg-slate-50">
                    <div className="text-slate-500">Cloudinary assets</div>
                    <div className="text-lg font-bold">{analysis.coverage.cloudinary}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50">
                    <div className="text-slate-500">Non-Cloudinary images</div>
                    <div className="text-lg font-bold">{analysis.coverage.nonCloudinaryImages}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50">
                    <div className="text-slate-500">
                      Using{" "}
                      <a
                        href="https://cloudinary.com/documentation/transformation_reference#f_auto"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                      >
                        f_auto
                      </a>
                    </div>
                    <div className="text-lg font-bold">
                      {analysis.coverage.autoFormat} / {analysis.coverage.cloudinary}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50">
                    <div className="text-slate-500">
                      Using{" "}
                      <a
                        href="https://cloudinary.com/documentation/transformation_reference#q_auto"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                      >
                        q_auto
                      </a>
                    </div>
                    <div className="text-lg font-bold">
                      {analysis.coverage.autoQuality} / {analysis.coverage.cloudinary}
                    </div>
                  </div>
                </div>
                
                {/* Disclaimer if assets seem missing */}
                {(analysis.coverage.cloudinary === 0 && analysis.coverage.nonCloudinaryImages === 0) || 
                 (analysis.coverage.total < 5 && analysis.coverage.cloudinary === 0) ? (
                  <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> Few or no assets were detected in this analysis. If you expected to see more assets, the website may be blocking automated requests or serving content dynamically. Consider: (1) Whitelisting the user-agent <code className="bg-yellow-100 px-1 rounded text-xs">CloudinaryEvaluator/1.0</code> in your bot protection settings, or (2) Using a HAR file export from your browser for a more complete analysis.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      </main>

      {analysis && analysis.perAsset && analysis.perAsset.length > 0 && (
        <section id="detailed-analysis" className="max-w-6xl mx-auto px-6">
              <div className="mt-6 p-6 bg-white rounded-3xl shadow border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setExpandedDetailsSection(!expandedDetailsSection)}
                className="flex items-center gap-2 text-left font-semibold text-xl hover:text-blue-600"
              >
                <span className={`transition-transform ${expandedDetailsSection ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                <span>
                  Detailed Analysis
                  <span className="ml-2 text-base font-normal text-slate-500">
                    ({analysis.perAsset.length} {analysis.perAsset.length === 1 ? 'asset' : 'assets'})
                  </span>
                </span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportTableCSV}
                  className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportAllAssets}
                  className="px-3 py-1 text-sm bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 font-medium"
                >
                  Export URLs
                </button>
                <button
                  type="button"
                  onClick={handleExportAllData}
                  className="px-3 py-1 text-sm bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 font-medium"
                >
                  Export JSON
                </button>
                      </div>
                    </div>

            {expandedDetailsSection && (
              <div className="pt-4 border-t border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-300">
                        <th 
                          className="text-left py-3 px-4 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none"
                          onClick={() => handleSort('url')}
                        >
                          <div className="flex items-center">
                            URL
                            {getSortIcon('url')}
                </div>
                        </th>
                        {analysis.isSitemapAnalysis && (
                          <th 
                            className="text-left py-3 px-4 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none"
                            onClick={() => handleSort('pageUrl')}
                          >
                            <div className="flex items-center">
                              Page
                              {getSortIcon('pageUrl')}
              </div>
                          </th>
                        )}
                        <th 
                          className="text-left py-3 px-4 font-semibold text-slate-700 w-32 cursor-pointer hover:bg-slate-100 select-none"
                          onClick={() => handleSort('status')}
                        >
                          <div className="flex items-center">
                            Status
                            {getSortIcon('status')}
              </div>
                        </th>
                        <th 
                          className="text-left py-3 px-4 font-semibold text-slate-700 w-40 cursor-pointer hover:bg-slate-100 select-none"
                          onClick={() => handleSort('issues')}
                        >
                          <div className="flex items-center">
                            Issues
                            {getSortIcon('issues')}
                          </div>
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700 w-48">
                          Optimization Details
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAssets.map((asset, index) => {
                        const hasIssues = asset.issues.length > 0;
                        const isExpanded = expandedRows.has(asset.url);
                        return (
                          <React.Fragment key={asset.url + index}>
                            <tr className={`border-b border-slate-200 hover:bg-slate-50 ${hasIssues ? 'bg-red-50/30' : 'bg-green-50/30'}`}>
                              <td className="py-3 px-4">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                                  className="text-blue-700 break-all hover:underline font-mono text-sm"
                  >
                    {asset.url}
                  </a>
                              </td>
                              {analysis.isSitemapAnalysis && (
                                <td className="py-3 px-4">
                                  {asset.pageUrl ? (
                                    <a
                                      href={asset.pageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue-600 break-all hover:underline text-sm"
                                      title={asset.pageUrl}
                                    >
                                      {asset.pageUrl.length > 50 ? `${asset.pageUrl.substring(0, 50)}...` : asset.pageUrl}
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 text-sm">—</span>
                                  )}
                                </td>
                              )}
                              <td className="py-3 px-4">
                                {hasIssues ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                    Problem
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                    ✓ Correct
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {hasIssues ? (
                                  <span className="text-sm text-slate-600">
                                    {asset.issues.length} {asset.issues.length === 1 ? 'issue' : 'issues'}
                                  </span>
                                ) : (
                                  <span className="text-sm text-green-600">No issues</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {(() => {
                                  const details = assetDetails.get(asset.url);
                                  if (!details) {
                                    if (hasIssues) {
                                      // Auto-load details for assets with issues
                                      setTimeout(() => loadAssetDetails(asset), 0);
                                    }
                                    return <span className="text-xs text-slate-400">—</span>;
                                  }
                                  if (details.loading) {
                                    return <span className="text-xs text-slate-400">Loading...</span>;
                                  }
                                  if (details.error) {
                                    return <span className="text-xs text-red-500" title={details.error}>Error</span>;
                                  }
                                    if (details.contentLength) {
                                      const savings = calculatePotentialSavings(asset, details);
                                      if (savings) {
                                        return (
                                          <div className="text-xs space-y-1">
                                            <div className="text-slate-600">
                                              <span className="font-medium">Size:</span> {formatBytes(details.contentLength)}
                                            </div>
                                            <div className="text-blue-600">
                                              <span className="font-medium">Est. Savings:</span> {formatBytes(savings.potentialSavings)} ({savings.savingsPercent}%)
                                            </div>
                                            <div className="text-green-600">
                                              <span className="font-medium">Est. Optimized:</span> {formatBytes(savings.optimizedSize)}
                                            </div>
                                            <div className="text-slate-400 text-xs italic">
                                              Based on average savings percentages
                                            </div>
                                            {details.contentType && (
                                              <div className="text-slate-500 text-xs mt-1">
                                                {transformContentType(details.contentType)}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      } else {
                                        return (
                                          <div className="text-xs space-y-1">
                                            <div className="text-slate-600">
                                              <span className="font-medium">Size:</span> {formatBytes(details.contentLength)}
                                            </div>
                                            {details.contentType && (
                                              <div className="text-slate-500">
                                                {transformContentType(details.contentType)}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                    }
                                  return <span className="text-xs text-slate-400">—</span>;
                                })()}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {hasIssues && (
                                  <button
                                    type="button"
                                    onClick={() => toggleRowExpansion(asset.url)}
                                    className="text-slate-500 hover:text-slate-700"
                                    aria-label={isExpanded ? "Collapse" : "Expand"}
                                  >
                                    <span className={`transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>
                                      ▶
                                    </span>
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isExpanded && hasIssues && (
                              <tr className="bg-slate-50">
                                <td colSpan={analysis.isSitemapAnalysis ? 6 : 5} className="py-3 px-4 pl-12">
                                  <div className="space-y-4">
                                    {/* Issues List */}
                                    <div className="space-y-2">
                                      {asset.issues.map((issue, issueIndex) => {
                                        const docLink = getIssueDocLink(issue);
                                        return (
                                          <div key={issueIndex} className="flex items-start gap-2 text-sm text-slate-700">
                                            <span className="text-red-500 mt-1">•</span>
                                            <div className="flex-1">
                                              <span>{issue}</span>
                                              {docLink && (
                                                <a
                                                  href={docLink}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="text-blue-600 hover:underline ml-2"
                                                >
                                                  Learn more →
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    
                                    {/* Optimized URL */}
                                    {(() => {
                                      const optimizedUrl = buildOptimizedUrl(asset);
                                      if (optimizedUrl) {
                                        return (
                                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                            <div className="text-sm font-semibold text-blue-900 mb-2">
                                              Optimized URL:
                                            </div>
                                            <div className="flex items-start gap-2">
                                              <code className="flex-1 text-xs text-blue-800 break-all font-mono bg-white p-2 rounded border border-blue-200">
                                                {optimizedUrl}
                                              </code>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(optimizedUrl);
                                                }}
                                                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                                                title="Copy to clipboard"
                                              >
                                                Copy
                                              </button>
                                              <a
                                                href={optimizedUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                                                title="Open in new tab"
                                              >
                                                Open
                                              </a>
                                            </div>
                                            <div className="text-xs text-blue-700 mt-2">
                                              This URL includes all recommended optimizations: {(() => {
                                                const optimizations = [];
                                                if (asset.issues.some(issue => issue.includes('f_auto'))) {
                                                  optimizations.push('f_auto');
                                                }
                                                if (asset.issues.some(issue => issue.includes('q_auto'))) {
                                                  optimizations.push('q_auto');
                                                }
                                                if (asset.issues.some(issue => issue.includes('resize') || issue.includes('w_, h_'))) {
                                                  optimizations.push('w_1200, c_limit (resizing)');
                                                } else if (asset.issues.some(issue => issue.includes('c_limit'))) {
                                                  optimizations.push('c_limit');
                                                }
                                                return optimizations.join(', ');
                                              })()}
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Summary Stats */}
                <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-900">{analysis.perAsset.length}</div>
                    <div className="text-slate-600">Total Assets</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-700">{problemUrls.length}</div>
                    <div className="text-slate-600">With Issues</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">{correctUrls.length}</div>
                    <div className="text-slate-600">Correct</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {analysis && analysis.nonCloudinaryImages && analysis.nonCloudinaryImages.length > 0 && (
        <section id="non-cloudinary-images" className="max-w-6xl mx-auto px-6">
          <div className="mt-6 p-6 bg-white rounded-3xl shadow border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setExpandedNonCloudinarySection(!expandedNonCloudinarySection)}
                className="flex items-center gap-2 text-left font-semibold text-xl hover:text-blue-600"
              >
                <span className={`transition-transform ${expandedNonCloudinarySection ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                <span>
                  Non-Cloudinary Images
                  <span className="ml-2 text-base font-normal text-slate-500">
                    ({analysis.nonCloudinaryImages.length} {analysis.nonCloudinaryImages.length === 1 ? 'image' : 'images'})
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const urls = analysis.nonCloudinaryImages.map(img => img.url).join("\n");
                  const blob = new Blob([urls], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "non-cloudinary-images.txt";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1 text-sm bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 font-medium"
              >
                Export URLs
              </button>
            </div>

            {expandedNonCloudinarySection && (
              <div className="pt-4 border-t border-slate-200">
                <p className="text-slate-600 mb-4">
                  These images are not using Cloudinary. Consider migrating them to Cloudinary to leverage optimization, CDN delivery, and automatic format/quality optimization. Estimated savings shown below are based on average optimization percentages (~40% total: 25% format, 15% quality, 10% resizing).
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {analysis.nonCloudinaryImages.map((img, index) => {
                    const details = assetDetails.get(img.url);
                    const pseudoAsset = { url: img.url, issues: ['Migrate to Cloudinary'] };
                    const savings = details && details.contentLength ? calculatePotentialSavings(pseudoAsset, details) : null;
                    
                    return (
                      <div
                        key={index}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <a
                            href={img.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-700 break-all hover:underline font-mono text-sm flex-1"
                          >
                            {img.url}
                          </a>
                          {savings && (
                            <div className="text-xs text-right whitespace-nowrap">
                              <div className="text-slate-600">
                                <span className="font-medium">Size:</span> {formatBytes(details.contentLength)}
                              </div>
                              <div className="text-blue-600">
                                <span className="font-medium">Est. Savings:</span> {formatBytes(savings.potentialSavings)} ({savings.savingsPercent}%)
                              </div>
                              <div className="text-green-600">
                                <span className="font-medium">Est. Optimized:</span> {formatBytes(savings.optimizedSize)}
                              </div>
                            </div>
                          )}
                          {details && details.loading && (
                            <span className="text-xs text-slate-400">Loading...</span>
                          )}
                          {details && details.error && !details.loading && (
                            <span className="text-xs text-slate-400">Unavailable</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section id="faq" className="max-w-6xl mx-auto px-6 pb-16 mt-10">
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow">
          <h2 className="text-xl font-semibold">FAQ</h2>
          <div className="mt-3 space-y-3 text-slate-700">
            <details>
              <summary className="cursor-pointer font-medium">Why use HAR as a backup?</summary>
              <div className="mt-2">
                HAR files capture response headers and all network requests, allowing us to evaluate caching and assets not present directly in markup. Use this method if you prefer to analyze a saved network capture.
              </div>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Can it fetch my site directly?</summary>
              <div className="mt-2">
                Yes! Simply enter your website URL and click "Analyze Site" to automatically fetch and analyze your Cloudinary usage. If you prefer, you can also upload a HAR file or paste HTML directly.
              </div>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">What does the score mean?</summary>
              <div className="mt-2">
                It is a heuristic snapshot of how fully you leverage Cloudinary's delivery
                optimizations across discovered assets.
              </div>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Where can I learn more?</summary>
              <div className="mt-2">
                Check out the{" "}
                <a
                  href="https://cloudinary.com/documentation"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Cloudinary Documentation
                </a>{" "}
                for guides on transformations, optimization, and best practices.
              </div>
            </details>
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-slate-500">
        Made with ❤️ for Cloudinary devs.{" "}
        <a
          href="https://cloudinary.com/documentation"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          View Documentation
        </a>
      </footer>
    </div>
  );
}