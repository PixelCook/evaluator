/**
 * Cloudflare Worker to proxy website requests and avoid CORS issues
 * Deploy with: cd worker && npx wrangler deploy
 */

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    const targetUrlParam = requestUrl.searchParams.get('url');
    
    const requestId = crypto.randomUUID();
    const requestStartTime = Date.now();
    
    console.log(`[Worker] ===== INCOMING REQUEST [${requestId}] =====`);
    console.log(`[Worker] Request ID: ${requestId}`);
    console.log(`[Worker] Method: ${request.method}`);
    console.log(`[Worker] Path: ${requestUrl.pathname}`);
    console.log(`[Worker] Query: ${requestUrl.search}`);
    console.log(`[Worker] Target URL param: ${targetUrlParam || 'MISSING'}`);
    console.log(`[Worker] Full URL: ${request.url}`);
    console.log(`[Worker] Timestamp: ${new Date().toISOString()}`);
    console.log(`[Worker] Request Headers:`, JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2));
    console.log(`[Worker] Request Origin: ${request.headers.get('origin') || 'none'}`);
    console.log(`[Worker] Request Referer: ${request.headers.get('referer') || 'none'}`);
    
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
      const fetchHeaders = {
        'User-Agent': 'CloudinaryEvaluator/1.0 (compatible; +https://cloudinary.com/documentation) Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      };
      
      console.log(`[Worker] [${requestId}] Fetch headers being sent:`, JSON.stringify(fetchHeaders, null, 2));
      
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: fetchHeaders,
        redirect: 'follow',
      });

      const fetchDuration = Date.now() - fetchStartTime;
      const incomingResponseHeaders = Object.fromEntries(response.headers.entries());
      
      console.log(`[Worker] [${requestId}] ===== FETCH RESPONSE RECEIVED =====`);
      console.log(`[Worker] [${requestId}] Status: ${response.status} ${response.statusText}`);
      console.log(`[Worker] [${requestId}] Duration: ${fetchDuration}ms`);
      console.log(`[Worker] [${requestId}] Response URL: ${response.url}`);
      console.log(`[Worker] [${requestId}] Redirected: ${response.url !== targetUrl ? 'YES' : 'NO'}`);
      if (response.url !== targetUrl) {
        console.log(`[Worker] [${requestId}] Original URL: ${targetUrl}`);
        console.log(`[Worker] [${requestId}] Final URL: ${response.url}`);
      }
      console.log(`[Worker] [${requestId}] Response Headers:`, JSON.stringify(incomingResponseHeaders, null, 2));
      console.log(`[Worker] [${requestId}] Content-Type: ${incomingResponseHeaders['content-type'] || 'not specified'}`);
      console.log(`[Worker] [${requestId}] Content-Length: ${incomingResponseHeaders['content-length'] || 'not specified'}`);
      console.log(`[Worker] [${requestId}] Server: ${incomingResponseHeaders['server'] || 'not specified'}`);
      console.log(`[Worker] [${requestId}] Cache-Control: ${incomingResponseHeaders['cache-control'] || 'not specified'}`);

      if (!response.ok) {
        // Get the error response body for logging
        let errorBody = '';
        let contentType = response.headers.get('Content-Type') || 'unknown';
        try {
          errorBody = await response.text();
          console.error(`[Worker] [${requestId}] ===== NON-OK RESPONSE =====`);
          console.error(`[Worker] [${requestId}] Status: ${response.status} ${response.statusText}`);
          console.error(`[Worker] [${requestId}] Target URL: ${targetUrl}`);
          console.error(`[Worker] [${requestId}] Response URL: ${response.url}`);
          console.error(`[Worker] [${requestId}] Content-Type: ${contentType}`);
          console.error(`[Worker] [${requestId}] Response body length: ${errorBody.length} bytes`);
          console.error(`[Worker] [${requestId}] Fetch duration: ${fetchDuration}ms`);
          console.error(`[Worker] [${requestId}] Total request duration: ${Date.now() - requestStartTime}ms`);
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
        
        console.error(`[Worker] [${requestId}] Returning JSON error response to client`);
        console.error(`[Worker] [${requestId}] Error details:`, JSON.stringify(errorDetails, null, 2));
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
      const htmlStartTime = Date.now();
      const html = await response.text();
      const htmlReadDuration = Date.now() - htmlStartTime;
      const totalDuration = Date.now() - requestStartTime;
      
      // Analyze HTML content for audit purposes
      const htmlAnalysis = {
        totalSize: html.length,
        hasDoctype: /<!doctype/i.test(html),
        hasHtmlTag: /<html/i.test(html),
        hasHeadTag: /<head/i.test(html),
        hasBodyTag: /<body/i.test(html),
        imgTagCount: (html.match(/<img[^>]*>/gi) || []).length,
        scriptTagCount: (html.match(/<script[^>]*>/gi) || []).length,
        linkTagCount: (html.match(/<link[^>]*>/gi) || []).length,
        styleTagCount: (html.match(/<style[^>]*>/gi) || []).length,
        cloudinaryUrlCount: (html.match(/res\.cloudinary\.com|cloudinary\.com\/image|cloudinary\.com\/video|cloudinary\.com\/raw/gi) || []).length,
      };
      
      console.log(`[Worker] [${requestId}] ===== HTML CONTENT ANALYSIS =====`);
      console.log(`[Worker] [${requestId}] Response body size: ${html.length} bytes`);
      console.log(`[Worker] [${requestId}] HTML read duration: ${htmlReadDuration}ms`);
      console.log(`[Worker] [${requestId}] Total request duration: ${totalDuration}ms`);
      console.log(`[Worker] [${requestId}] HTML Analysis:`, JSON.stringify(htmlAnalysis, null, 2));
      console.log(`[Worker] [${requestId}] ===== FETCH SUCCESS =====`);

      // Return the HTML with CORS headers
      const outgoingResponseHeaders = {
        'Content-Type': response.headers.get('Content-Type') || 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=300',
        'X-Request-ID': requestId,
        'X-Fetch-Duration': `${fetchDuration}ms`,
        'X-Total-Duration': `${totalDuration}ms`,
      };
      
      console.log(`[Worker] [${requestId}] Returning response with headers:`, JSON.stringify(outgoingResponseHeaders, null, 2));
      console.log(`[Worker] [${requestId}] Response body size being returned: ${html.length} bytes`);
      
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: outgoingResponseHeaders,
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
      const totalDuration = Date.now() - requestStartTime;
      console.error(`[Worker] [${requestId}] ===== FETCH ERROR =====`);
      console.error(`[Worker] [${requestId}] Error name:`, error.name);
      console.error(`[Worker] [${requestId}] Error message:`, error.message);
      console.error(`[Worker] [${requestId}] Error stack:`, error.stack);
      if (error.cause) {
        console.error(`[Worker] [${requestId}] Error cause:`, JSON.stringify(error.cause, null, 2));
      }
      console.error(`[Worker] [${requestId}] Target URL:`, targetUrl);
      console.error(`[Worker] [${requestId}] Request duration before error: ${totalDuration}ms`);
      console.error(`[Worker] [${requestId}] Full error object:`, JSON.stringify(errorDetails, null, 2));
      console.error(`[Worker] [${requestId}] Timestamp:`, new Date().toISOString());
      
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

