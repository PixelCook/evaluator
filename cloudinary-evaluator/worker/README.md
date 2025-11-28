# Cloudinary Evaluator Worker

This is a Cloudflare Worker that proxies website requests to avoid CORS issues when fetching websites from the Cloudinary Evaluator app.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Authenticate with Cloudflare:
   ```bash
   npx wrangler login
   ```

## Development

Run the worker locally:
```bash
npm run dev
```

## Deployment

Deploy to Cloudflare:
```bash
npm run deploy
```

After deployment, you'll receive a worker URL (e.g., `https://cloudinary-evaluator-proxy.your-subdomain.workers.dev`).

## Configuration

1. Copy the worker URL after deployment
2. In the main project root, create or update `.env`:
   ```
   VITE_WORKER_URL=https://cloudinary-evaluator-proxy.your-subdomain.workers.dev
   ```

## Usage

The worker accepts GET requests with a `url` query parameter:
```
https://your-worker.workers.dev?url=https://example.com
```

It will fetch the target URL server-side and return the HTML with proper CORS headers.

