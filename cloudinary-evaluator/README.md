# Cloudinary Evaluator

Cloudinary Evaluator is a React + Vite tool that inspects a HAR file or pasted
HTML to see how much of Cloudinary's optimization toolkit a site is using. It
surfaces coverage metrics, a heuristic score, and actionable suggestions.

## Prerequisites

- Node.js 18+ (https://nodejs.org)
- npm 9+ (bundled with Node)

## Setup

1. Clone the repository and move into the project folder.
   ```bash
   git clone <your-fork-url>
   cd cloudinary-evaluator
   ```
2. Install dependencies.
   ```bash
   npm install
   ```

## Running locally

Start the Vite dev server:

```bash
npm run dev
```

The app is served at http://localhost:5173 and supports hot module reloading.

## Production build & preview

- Create an optimized build: `npm run build`
- Preview the production build locally: `npm run preview`
