import React from "react";
export default function Donut({ value }) {
const r = 54;
const c = 2 * Math.PI * r;
const pct = Math.max(0, Math.min(100, value));
const dash = (c * (100 - pct)) / 100;
return (
<svg viewBox="0 0 140 140" className="w-40 h-40">
<circle cx="70" cy="70" r={r} strokeWidth="12" className="fill-none stroke-gray-200" />
<circle cx="70" cy="70" r={r} strokeWidth="12" className="fill-none stroke-current text-blue-600"
strokeDasharray={`${c} ${c}`} strokeDashoffset={dash} transform="rotate(-90 70 70)" strokeLinecap="round" />
<text x="70" y="76" textAnchor="middle" className="text-3xl font-bold">{pct}%</text>
</svg>
);
}