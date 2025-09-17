import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";


createRoot(document.getElementById("root")).render(
<React.StrictMode>
<App />
</React.StrictMode>
);


# FILE: src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;


html, body, #root { height: 100%; }