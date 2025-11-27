export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        accent: "var(--color-accent)",
        "code-bg": "var(--color-code-bg)",
        "code-text": "var(--color-code-text)",
      },
      maxWidth: {
        content: "var(--max-content-width)",
      },
      spacing: {
        unit: "var(--spacing-unit)",
      },
    },
  },
  plugins: []
};
    