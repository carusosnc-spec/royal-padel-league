// RPL release 9.1.86 — Royal Pay loader e cache aggiornata
const CACHE_NAME = "rpl-v9.1.86";
const APP_SHELL = ["./", "./index.html", "./apple-touch-icon.png", "./favicon-32x32.png", "./manifest.webmanifest", "./rpl-header-bg.webp", "./rpl-vote-alert.js", "./royal-pay.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("rpl-v") && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function injectRoyalPay(response, requestUrl) {
  if (!response || !response.ok) return response;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  const path = new URL(requestUrl).pathname;
  if (!(path.endsWith("/") || path.endsWith("/index.html"))) return response;
  let html = await response.text();
  if (!html.includes('src="./royal-pay.js"') && !html.includes("src='./royal-pay.js'")) {
    const script = '<script src="./royal-pay.js?v=9.1.86" defer></script>';
    if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, script + "</body>");
    else html += script;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(html, {status: response.status, statusText: response.statusText, headers});
}
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const network = await fetch(req);
      const response = await injectRoyalPay(network, req.url);
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
      }
      return response;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return injectRoyalPay(cached, req.url);
      const fallback = await caches.match("./index.html");
      return fallback ? injectRoyalPay(fallback, new URL("./index.html", self.location.href).href) : Response.error();
    }
  })());
});
