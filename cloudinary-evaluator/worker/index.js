/**
 * Cloudflare Worker to proxy website requests and avoid CORS issues
 * Deploy with: cd worker && npx wrangler deploy
 */

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    const targetUrlParam = requestUrl.searchParams.get('url');
    
    console.log(`[Worker] ===== INCOMING REQUEST =====`);
    console.log(`[Worker] Method: ${request.method}`);
    console.log(`[Worker] Path: ${requestUrl.pathname}`);
    console.log(`[Worker] Query: ${requestUrl.search}`);
    console.log(`[Worker] Target URL param: ${targetUrlParam || 'MISSING'}`);
    console.log(`[Worker] Full URL: ${request.url}`);
    console.log(`[Worker] Timestamp: ${new Date().toISOString()}`);
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      console.log(`[Worker] Handling OPTIONS preflight request`);
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      console.error(`[Worker] Method not allowed: ${request.method}`);
      return new Response('Method not allowed', { status: 405 });
    }

    // Get the target URL from query parameter
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    
    console.log(`[Worker] Query string parsing:`, {
      search: url.search,
      searchParams: Object.fromEntries(url.searchParams.entries()),
      targetUrl: targetUrl || 'NOT FOUND'
    });

    // Handle root path requests
    if (url.pathname === '/' && !targetUrl) {
      console.log(`[Worker] Root path request without URL param - returning usage info`);
      return new Response(
        JSON.stringify({ 
          service: 'Cloudinary Evaluator Proxy',
          usage: 'Add ?url=<target-url> to proxy a website request',
          example: `${url.origin}?url=https://example.com`
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    if (!targetUrl) {
      console.error(`[Worker] Missing url parameter in request`);
      return new Response(
        JSON.stringify({ error: 'Missing url parameter. Add ?url=<target-url> to proxy a website request.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Validate URL
    console.log(`[Worker] Validating target URL: ${targetUrl}`);
    let target;
    try {
      target = new URL(targetUrl);
      console.log(`[Worker] URL parsed successfully - protocol: ${target.protocol}, host: ${target.host}`);
      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(target.protocol)) {
        throw new Error(`Invalid protocol: ${target.protocol}. Only http: and https: are allowed.`);
      }
      console.log(`[Worker] URL validation passed`);
    } catch (e) {
      console.error('[Worker] ===== URL VALIDATION ERROR =====');
      console.error('[Worker] Error message:', e.message);
      console.error('[Worker] Error stack:', e.stack);
      console.error('[Worker] Target URL:', targetUrl);
      console.error('[Worker] Timestamp:', new Date().toISOString());
      return new Response(
        JSON.stringify({ 
          error: 'Invalid URL',
          details: e.message,
          targetUrl: targetUrl,
          stack: e.stack
        }, null, 2),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    try {
      console.log(`[Worker] ===== STARTING FETCH =====`);
      console.log(`[Worker] Target URL: ${targetUrl}`);
      const fetchStartTime = Date.now();
      
      // Fetch the target URL with browser-like headers to avoid blocking
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
        redirect: 'follow',
      });

      const fetchDuration = Date.now() - fetchStartTime;
      console.log(`[Worker] ===== FETCH RESPONSE RECEIVED =====`);
      console.log(`[Worker] Status: ${response.status} ${response.statusText}`);
      console.log(`[Worker] Duration: ${fetchDuration}ms`);
      console.log(`[Worker] Headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

      if (!response.ok) {
        // Get the error response body for logging
        let errorBody = '';
        let contentType = response.headers.get('Content-Type') || 'unknown';
        try {
          errorBody = await response.text();
          console.error(`[Worker] ===== NON-OK RESPONSE =====`);
          console.error(`[Worker] Status: ${response.status} ${response.statusText}`);
          console.error(`[Worker] Target URL: ${targetUrl}`);
          console.error(`[Worker] Content-Type: ${contentType}`);
          console.error(`[Worker] Response body length: ${errorBody.length} bytes`);
          if (errorBody.length > 0) {
            const preview = errorBody.substring(0, 1000);
            console.error(`[Worker] Error response body preview:`, preview);
            if (errorBody.length > 1000) {
              console.error(`[Worker] ... (truncated, full length: ${errorBody.length} bytes)`);
            }
          } else {
            console.error(`[Worker] Error response body is empty`);
          }
        } catch (e) {
          console.error(`[Worker] Failed to read error response body:`, e.message);
          console.error(`[Worker] Error reading body:`, e);
        }
        
        // Return JSON error instead of HTML error page
        const errorDetails = {
          error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
          details: `The target website returned a ${response.status} status code. This may indicate the site is blocking automated requests, has bot protection (like Cloudflare), or requires authentication.`,
          targetUrl: targetUrl,
          status: response.status,
          statusText: response.statusText,
          contentType: contentType,
          timestamp: new Date().toISOString()
        };
        
        console.error(`[Worker] Returning JSON error response to client`);
        console.error(`[Worker] Error details:`, JSON.stringify(errorDetails, null, 2));
        return new Response(
          JSON.stringify(errorDetails, null, 2),
          {
            status: response.status,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
            },
          }
        );
      }

      // Get the response text for successful responses
      const html = await response.text();
      console.log(`[Worker] Response body size: ${html.length} bytes`);
      console.log(`[Worker] ===== FETCH SUCCESS =====`);

      // Return the HTML with CORS headers
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/html',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch (error) {
      const errorDetails = {
        error: error.message || 'Failed to fetch URL',
        targetUrl: targetUrl,
        name: error.name,
        stack: error.stack,
        cause: error.cause,
        timestamp: new Date().toISOString()
      };
      
      // Log full error for debugging in wrangler console (terminal)
      console.error('[Worker] ===== FETCH ERROR =====');
      console.error('[Worker] Error name:', error.name);
      console.error('[Worker] Error message:', error.message);
      console.error('[Worker] Error stack:', error.stack);
      if (error.cause) {
        console.error('[Worker] Error cause:', JSON.stringify(error.cause, null, 2));
      }
      console.error('[Worker] Target URL:', targetUrl);
      console.error('[Worker] Full error object:', JSON.stringify(errorDetails, null, 2));
      console.error('[Worker] Timestamp:', new Date().toISOString());
      
      return new Response(
        JSON.stringify(errorDetails, null, 2),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};

