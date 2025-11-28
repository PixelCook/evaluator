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

## Cloudflare Worker Setup (for CORS-free website fetching)

The app includes a Cloudflare Worker to proxy website requests and avoid CORS issues when fetching websites directly. The worker is located in the `worker/` directory and can be deployed separately from the static site.

### Deploying the Worker

1. Navigate to the worker directory:
   ```bash
   cd worker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Authenticate with Cloudflare:
   ```bash
   npx wrangler login
   ```

4. Deploy the worker:
   ```bash
   npm run deploy
   ```
   
   Or from the project root:
   ```bash
   npm run worker:deploy
   ```

5. After deployment, you'll get a worker URL (e.g., `https://cloudinary-evaluator-proxy.your-subdomain.workers.dev`)

6. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```

7. Add your worker URL to `.env`:
   ```
   VITE_WORKER_URL=https://cloudinary-evaluator-proxy.your-subdomain.workers.dev
   ```

8. Restart your dev server for the changes to take effect.

### Development

Run the worker locally for testing:
```bash
npm run worker:dev
```

### Deployment Strategy

- **Static Site (Cloudflare Pages)**: Deploy the built `dist/` folder to Cloudflare Pages
- **Worker**: Deploy separately using `npm run worker:deploy` from the `worker/` directory

Both can be deployed from the same repository but are independent deployments.

### How it works

The worker acts as a proxy that:
- Accepts GET requests with a `url` query parameter
- Fetches the target website server-side (avoiding CORS)
- Returns the HTML with proper CORS headers
- Handles errors gracefully

The app will automatically use the worker when fetching websites via the "Website URL" tab.
