// RPL release 9.1.84 — cache aggiornata per l'integrazione Royal Pay
const CACHE_NAME = "rpl-v9.1.84";
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
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
    }
    return res;
  }).catch(() => caches.match(req).then(cached => cached || caches.match("./index.html"))));
});
