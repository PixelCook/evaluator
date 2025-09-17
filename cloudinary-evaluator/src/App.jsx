import React, { useMemo, useState } from "react";
{cloudNames.length > 0 && (
<div className="flex gap-2 flex-wrap">{cloudNames.map(n => <Pill key={n}>{n}</Pill>)}</div>
)}
</div>


<div className="grid place-items-center mt-6">
<Donut value={analysis?.score ?? 0} />
</div>


<p className="mt-4 text-slate-700">
{analysis ? (
<>You're currently getting <strong>{analysis.score}%</strong> of Cloudinary's potential value.</>
) : (
<>Upload a HAR or paste HTML, then click <em>Scan Website</em>.</>
)}
</p>


{analysis && (
<div className="mt-6">
<h3 className="font-semibold">Suggestions</h3>
{analysis.suggestions.length ? (
<ul className="mt-2 space-y-2">
{analysis.suggestions.map((s, i) => <Suggestion key={i} text={s} />)}
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
<div className="text-slate-500">Using f_auto</div>
<div className="text-lg font-bold">{analysis.coverage.autoFormat} / {analysis.coverage.cloudinary}</div>
</div>
<div className="p-3 rounded-xl bg-slate-50">
<div className="text-slate-500">Using q_auto</div>
<div className="text-lg font-bold">{analysis.coverage.autoQuality} / {analysis.coverage.cloudinary}</div>
</div>
</div>
</div>
)}
</div>


{analysis && (
<div className="mt-6 p-6 bg-white rounded-3xl shadow border border-slate-200">
<h3 className="font-semibold">Analyzed assets</h3>
<ul className="mt-3 space-y-3 max-h-80 overflow-auto pr-2">
{analysis.perAsset.map((a, i) => (
<li key={i} className="text-sm">
<a href={a.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 break-all hover:underline">{a.url}</a>
{a.issues.length ? (
<ul className="list-disc ml-5 mt-1 text-slate-600">
{a.issues.map((m, k) => <li key={k}>{m}</li>)}
</ul>
) : (
<div className="text-emerald-600">✓ Looks good</div>
)}
</li>
))}
</ul>
</div>
)}
</aside>
</main>


<section id="faq" className="max-w-6xl mx-auto px-6 pb-16">
<div className="p-6 bg-white rounded-2xl border border-slate-200 shadow">
<h2 className="text-xl font-semibold">FAQ</h2>
<div className="mt-3 space-y-3 text-slate-700">
<details>
<summary className="cursor-pointer font-medium">Why HAR?</summary>
<div className="mt-2">HAR captures response headers and all network requests. This lets us evaluate caching and identify assets that aren't visible in markup.</div>
</details>
<details>
<summary className="cursor-pointer font-medium">Can it fetch my site directly?</summary>
<div className="mt-2">Direct cross-origin fetches are typically blocked in the browser. For automated crawling, add a tiny proxy or run this analyzer server-side.</div>
</details>
<details>
<summary className="cursor-pointer font-medium">What does the score mean?</summary>
<div className="mt-2">It's a heuristic snapshot of how fully you leverage Cloudinary's delivery optimizations across discovered assets.</div>
</details>
</div>
</div>
</section>


<footer className="py-8 text-center text-slate-500">Made with ❤️ for Cloudinary devs.</footer>
</div>
);
}