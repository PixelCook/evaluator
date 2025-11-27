import React, { useMemo, useState } from "react";
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
  const [activeTab, setActiveTab] = useState("har");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

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
      setError(err.message || "Failed to parse HAR file.");
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
      setError(err.message || "Failed to analyze HTML.");
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
      const response = await fetch(url, {
        mode: "cors",
        headers: {
          "Accept": "text/html",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      const html = await response.text();
      const result = analyzeFromHtml(html);
      setAnalysis(result);
      setStatus(`Analyzed ${url}`);
    } catch (err) {
      if (err.message.includes("CORS") || err.message.includes("Failed to fetch")) {
        setError("CORS blocked. Try using a HAR file or paste the HTML directly. Some sites block cross-origin requests.");
      } else {
        setError(err.message || "Failed to fetch or analyze the website.");
      }
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
      setError(err.message || "Failed to analyze the delivery URL.");
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
            Choose an input method to analyze Cloudinary usage and get optimization recommendations.
          </p>

          <div className="mt-6">
            <div className="flex flex-wrap gap-2 border-b border-slate-200">
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
                HAR File
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
            </div>

            <div className="mt-6">
              {activeTab === "har" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Upload HAR</label>
                  <input
                    type="file"
                    accept=".har,application/json"
                    className="mt-2 block w-full rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={handleHarUpload}
                    disabled={isBusy}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Chrome/Edge: DevTools → Network → Save all as{" "}
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
                  <label className="block text-sm font-medium text-slate-700">Website URL</label>
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={e => setSiteUrl(e.target.value)}
                    className="mt-2 block w-full rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com"
                    disabled={isBusy}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Note: Some sites block cross-origin requests. If it fails, use a HAR file instead.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-white font-semibold disabled:opacity-60"
                      onClick={handleSiteUrlAnalyze}
                      disabled={isBusy || !siteUrl.trim()}
                    >
                      Fetch & Analyze
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
              <h2 className="text-xl font-semibold">Your Cloudinary footprint</h2>
              {cloudNames.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {cloudNames.map(name => (
                    <Pill key={name}>{name}</Pill>
                  ))}
                </div>
              )}
            </div>

            <div className="grid place-items-center mt-6">
              <Donut value={analysis?.score ?? 0} />
            </div>

            <p className="mt-4 text-slate-700">
              {analysis ? (
                <>
                  You are currently capturing{" "}
                  <strong>{analysis.score}%</strong> of Cloudinary's potential value.
                </>
              ) : (
                <>Upload a HAR or paste HTML, then click <em>Scan Website</em>.</>
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

      {analysis && (
        <>
          {recommendationsByIssue.length > 0 && (
            <section className="max-w-6xl mx-auto px-6">
              <div className="mt-6 p-6 bg-white rounded-3xl shadow border border-slate-200">
                <h3 className="font-semibold text-xl mb-4">Recommendations</h3>
                <div className="space-y-4">
                  {recommendationsByIssue.map((rec, index) => (
                    <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{rec.issue}</p>
                          {rec.docLink && (
                            <a
                              href={rec.docLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                            >
                              Learn more →
                            </a>
                          )}
                        </div>
                        <span className="ml-4 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold whitespace-nowrap">
                          {rec.count} {rec.count === 1 ? "URL" : "URLs"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="max-w-6xl mx-auto px-6">
            <div className="mt-6 p-6 bg-white rounded-3xl shadow border border-slate-200">
              <h3 className="font-semibold">Analyzed assets</h3>
            <ul className="mt-3 space-y-3 max-h-80 overflow-auto pr-2">
              {analysis.perAsset.map((asset, index) => (
                <li key={asset.url + index} className="text-sm">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 break-all hover:underline"
                  >
                    {asset.url}
                  </a>
                  {asset.issues.length ? (
                    <ul className="list-disc ml-5 mt-1 text-slate-600">
                      {asset.issues.map((issue, issueIndex) => {
                        const docLink = getIssueDocLink(issue);
                        return (
                          <li key={issue + issueIndex}>
                            {issue}
                            {docLink && (
                              <>
                                {" "}
                                <a
                                  href={docLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline text-xs"
                                >
                                  Learn more
                                </a>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="text-blue-600">✓ Looks good</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
        </>
      )}

      <section id="faq" className="max-w-6xl mx-auto px-6 pb-16 mt-10">
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow">
          <h2 className="text-xl font-semibold">FAQ</h2>
          <div className="mt-3 space-y-3 text-slate-700">
            <details>
              <summary className="cursor-pointer font-medium">Why HAR?</summary>
              <div className="mt-2">
                HAR captures response headers and all network requests so we can evaluate caching and
                assets not present directly in markup.
              </div>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Can it fetch my site directly?</summary>
              <div className="mt-2">
                Direct cross-origin fetches are often blocked in the browser. For automated crawling,
                add a simple proxy or run the analyzer server-side.
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