export default {
    content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
    ],
    theme: { extend: {} },
    plugins: []
    };
    
    
    # FILE: postcss.config.js
    export default {
    plugins: {
    tailwindcss: {},
    autoprefixer: {},
    },
    };