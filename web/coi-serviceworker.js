/* Cross-origin isolation shim for static hosts (GitHub Pages) that cannot send
   COOP/COEP headers. The service worker re-serves same-origin document responses
   with the isolation headers so SharedArrayBuffer becomes available.
   Pattern: https://github.com/gzuidhof/coi-serviceworker (MIT). */
if (typeof window === 'undefined') {
  // Service worker context
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', (event) => {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

    const request = (r.mode === 'navigate' && r.method === 'GET')
      ? new Request(r.url, { redirect: 'follow' }) // strip history-state navigation body quirks
      : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.type !== 'basic' || !response.headers.get('content-type')?.includes('text/html')) {
            return response; // only rewrite same-origin documents
          }
          const headers = new Headers(response.headers);
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          headers.set('Cross-Origin-Resource-Policy', 'same-origin');
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  // Window context: register and reload once under control of the SW.
  (async () => {
    if (window.crossOriginIsolated !== false) return; // already isolated (or API missing)
    if (!window.isSecureContext) return; // SW needs secure context
    const sw = await navigator.serviceWorker.register(
      new URL('coi-serviceworker.js', document.currentScript?.src ?? location.href)
    );
    if (!sw.active && !navigator.serviceWorker.controller) {
      // First registration: the document must be reloaded through the SW.
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        sw.active?.postMessage({ type: 'claim' }, [channel.port2]);
        setTimeout(resolve, 250);
      });
      location.reload();
    }
  })().catch((e) => console.error('coi-serviceworker registration failed:', e));
}