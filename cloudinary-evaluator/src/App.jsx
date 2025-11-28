import React, { useMemo, useState, useEffect } from "react";
import "./App.css";
import Donut from "./components/Donut";
import Pill from "./components/Pill";
import Suggestion from "./components/Suggestion";
import { analyzeFromHar, analyzeFromHtml, analyzeFromUrl } from "./lib/analyzer";

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
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'

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

  const cloudNames = useMemo(() => {
    if (!analysis) return [];
    const names = (analysis.cloudinaryRequests ?? [])
      .map(req => req.cld?.cloudName)
      .filter(Boolean);
    return [...new Set(names)];
  }, [analysis]);

  const getIssueDocLink = (issue) => {
    if (issue.includes("f_auto")) {
      return "https://cloudinary.com/documentation/transformation_reference#f_auto";
    }
    if (issue.includes("q_auto")) {
      return "https://cloudinary.com/documentation/transformation_reference#q_auto";
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

  async function handleSiteUrlAnalyze() {
    if (!siteUrl.trim()) {
      setError("Enter a website URL first.");
      return;
    }
    setIsBusy(true);
    setError("");
    setStatus(`Fetching ${siteUrl}…`);
    try {
      let url = siteUrl.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }
      
      console.log('[App] Starting site URL analysis:', {
        siteUrl,
        normalizedUrl: url,
        timestamp: new Date().toISOString()
      });
      
      // Use Cloudflare Worker proxy to avoid CORS issues
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      
      console.log('[App] Worker URL check:', {
        workerUrl: workerUrl || 'NOT CONFIGURED',
        hasWorkerUrl: !!workerUrl,
        isString: typeof workerUrl === 'string',
        isEmpty: !workerUrl || workerUrl.trim() === '',
        hasPlaceholder: workerUrl?.includes('your-subdomain'),
        startsWithHttp: workerUrl?.startsWith('http://') || workerUrl?.startsWith('https://')
      });
      
      // Validate worker URL is properly configured and is an absolute URL
      // Must check these conditions in order to avoid calling methods on undefined/null
      let proxyUrl;
      
      if (!workerUrl || 
          typeof workerUrl !== 'string' ||
          workerUrl.trim() === '' || 
          workerUrl.includes('your-subdomain') ||
          (!workerUrl.startsWith('http://') && !workerUrl.startsWith('https://'))) {
        console.error('[App] Worker URL validation failed - returning early');
        setError("Website URL fetching is not configured. Please use HAR file upload or paste HTML as an alternative method.");
        setStatus("");
        setIsBusy(false);
        return;
      }
      
      // Construct the proxy URL - workerUrl is guaranteed to be a valid absolute URL at this point
      const trimmedWorkerUrl = workerUrl.trim();
      proxyUrl = `${trimmedWorkerUrl}?url=${encodeURIComponent(url)}`;
      
      console.log('[App] Constructed proxy URL:', proxyUrl);
      
      // Final validation: ensure proxyUrl is an absolute URL to prevent Vite from trying to serve it
      try {
        new URL(proxyUrl); // This will throw if not a valid absolute URL
        console.log('[App] Proxy URL validation passed');
      } catch (e) {
        console.error('[App] Proxy URL validation failed:', {
          proxyUrl,
          error: e.message,
          stack: e.stack
        });
        setError("Invalid worker configuration. Please use HAR file upload or paste HTML as an alternative method.");
        setStatus("");
        setIsBusy(false);
        return;
      }
      
      console.log('[App] Making fetch request to worker:', {
        proxyUrl,
        method: 'GET',
        headers: { 'Accept': 'text/html' }
      });
      const fetchStartTime = Date.now();
      
      let response;
      try {
        response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/html',
          },
        });
      } catch (fetchError) {
        console.error('[App] Fetch request failed (network error):', {
          error: fetchError.message,
          name: fetchError.name,
          stack: fetchError.stack,
          cause: fetchError.cause,
          proxyUrl,
          targetUrl: url
        });
        throw fetchError;
      }
      
      const fetchDuration = Date.now() - fetchStartTime;
      console.log('[App] Fetch response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        duration: `${fetchDuration}ms`,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        let errorData;
        try {
          const text = await response.text();
          console.log('[App] Error response text:', text);
          errorData = JSON.parse(text);
        } catch (e) {
          console.error('[App] Failed to parse error response:', {
            parseError: e.message,
            responseText: await response.text().catch(() => 'Could not read response')
          });
          errorData = { error: response.statusText, status: response.status };
        }
        
        console.error('[App] Worker response error:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          proxyUrl,
          targetUrl: url
        });
        
        // Create user-friendly error message based on status code
        let userFriendlyMessage = errorData.details || errorData.error || `Failed to fetch: ${response.status} ${response.statusText}`;
        
        if (response.status === 403) {
          userFriendlyMessage = "This website is blocking automated requests. This is common for sites with bot protection (like Cloudflare). Try using a HAR file export from your browser instead, or paste the HTML directly.";
        } else if (response.status === 404) {
          userFriendlyMessage = "The website URL could not be found. Please check the URL and try again, or use a HAR file or paste HTML directly.";
        } else if (response.status === 429) {
          userFriendlyMessage = "Too many requests. The website is rate-limiting requests. Please wait a moment and try again, or use a HAR file or paste HTML directly.";
        } else if (response.status >= 500) {
          userFriendlyMessage = "The website server is experiencing issues. Please try again later, or use a HAR file or paste HTML directly.";
        } else if (response.status >= 400) {
          userFriendlyMessage = `Unable to access this website (${response.status}). The site may require authentication or be blocking requests. Try using a HAR file export from your browser or paste the HTML directly.`;
        }
        
        // Create error object with user-friendly message
        const error = new Error(userFriendlyMessage);
        error.status = response.status;
        error.errorData = errorData;
        throw error;
      }
      
      const html = await response.text();
      console.log('[App] Received HTML, length:', html.length);
      
      const result = analyzeFromHtml(html);
      console.log('[App] Analysis complete:', {
        assetsFound: result.perAsset?.length || 0,
        score: result.score
      });
      
      setAnalysis(result);
      setStatus(`Analyzed ${url}`);
    } catch (err) {
      console.error('[App] Site URL analyze error (catch block):', {
        message: err.message,
        name: err.name,
        stack: err.stack,
        error: err,
        cause: err.cause,
        status: err.status,
        errorData: err.errorData,
        url: siteUrl,
        workerUrl: import.meta.env.VITE_WORKER_URL,
        timestamp: new Date().toISOString()
      });
      
      // Use the error message if it's already user-friendly, otherwise show generic message
      const errorMessage = err.message && err.message.length > 0 
        ? err.message 
        : "Failed to fetch or analyze the website. Please try using a HAR file or paste HTML directly.";
      
      setError(errorMessage);
      setStatus("");
    } finally {
      setIsBusy(false);
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
              src="https://res.cloudinary.com/demo/image/upload/v1614540168/media-editor/cld-logos/vector_cloudinary_logo_blue_0720_eps.png"
              alt="Cloudinary Logo"
              className="h-20 w-auto"
            />
          </div>
          <p className="text-sm uppercase tracking-wider text-blue-600 font-semibold">
            Cloudinary Evaluator
          </p>
          <h1 className="text-4xl font-bold mt-2">Optimize. Measure. Elevate.</h1>
          <p className="text-slate-600 mt-3 max-w-3xl mx-auto lg:mx-0">
            Upload a HAR export, paste HTML, fetch a website URL, or analyze a Cloudinary delivery URL to get instant insights into Cloudinary usage, media coverage, and the fastest wins to chase next.{" "}
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
                  <p className="text-xs text-slate-500 mt-2">
                    Enter your website URL to automatically fetch and analyze your Cloudinary usage.
                  </p>
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
            style={{
              backgroundImage: `url('https://cdn.prod.website-files.com/64d41aab8183c7c3324ddb29/674f5ed6ef4a6bb77f9723ba_0-glyph-square.svg')`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
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
                </>
              ) : (
                <>Enter a website URL above to analyze your Cloudinary usage.</>
              )}
            </p>

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
                            <span>{text}</span>
                            {docLink && (
                              <a
                                href={docLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-blue-600 hover:underline ml-2"
                              >
                                Learn more →
                              </a>
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
                                <td colSpan={4} className="py-3 px-4 pl-12">
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