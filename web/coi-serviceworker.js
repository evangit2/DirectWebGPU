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

    event.respondWith(
      fetch(r)
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
  // Window context: register, wait for control, reload exactly once so the
  // document is served through the worker (which adds the isolation headers).
  (async () => {
    if (window.crossOriginIsolated !== false) return; // already isolated (or API missing)
    if (!window.isSecureContext) return; // SW needs secure context
    if (!('serviceWorker' in navigator)) return;
    const swUrl = new URL('coi-serviceworker.js', document.currentScript?.src ?? location.href).href;
    try {
      await navigator.serviceWorker.register(swUrl);
      if (navigator.serviceWorker.controller) return; // already controlled
      // Wait (bounded) until this page is controlled by the SW.
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
      // Reload once per tab so the document response carries COOP/COEP.
      if (!sessionStorage.getItem('coi-reloaded')) {
        sessionStorage.setItem('coi-reloaded', '1');
        location.reload();
      }
    } catch (e) {
      console.error('coi-serviceworker registration failed:', e);
    }
  })();
}