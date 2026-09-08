// Adds cross-origin isolation headers (required for SharedArrayBuffer) to every response.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(url);
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    if (url.pathname.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm');
    return new Response(response.body, { status: response.status, headers });
  },
};
