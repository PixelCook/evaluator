import React from "react";
export default function Suggestion({ text }) {
return (
<li className="flex gap-3 items-start">
<span className="mt-2 w-2 h-2 rounded-full bg-blue-500" />
<span>{text}</span>
</li>
);
}