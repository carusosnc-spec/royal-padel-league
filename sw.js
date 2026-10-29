// RPL release 9.1.97 — aggiornamento posizione Royal Pay operatore
const CACHE_NAME = "rpl-v9.1.97";
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

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    try { payload = { body: event.data ? event.data.text() : "" }; } catch (_) {}
  }

  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.trim()
    : "Royal Padel League";
  const body = typeof payload.body === "string" && payload.body.trim()
    ? payload.body.trim()
    : "Hai una nuova comunicazione RPL.";
  const tag = typeof payload.tag === "string" && payload.tag.trim()
    ? payload.tag.trim()
    : "rpl-notification";
  let targetUrl = new URL("./index.html#player", self.location.href).href;
  try {
    const candidate = new URL(typeof payload.url === "string" ? payload.url : targetUrl, self.location.href);
    if (candidate.origin === self.location.origin) targetUrl = candidate.href;
  } catch (_) {}

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: new URL("./apple-touch-icon.png", self.location.href).href,
    badge: new URL("./favicon-32x32.png", self.location.href).href,
    data: { url: targetUrl },
    renotify: true
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  let targetUrl = new URL("./index.html#player", self.location.href).href;
  try {
    const candidate = new URL(event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : targetUrl, self.location.href);
    if (candidate.origin === self.location.origin) targetUrl = candidate.href;
  } catch (_) {}

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "navigate" in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

async function injectRoyalPay(response, requestUrl) {
  if (!response || !response.ok) return response;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  const path = new URL(requestUrl).pathname;
  if (!(path.endsWith("/") || path.endsWith("/index.html"))) return response;
  let html = await response.text();
  if (!html.includes('src="./royal-pay.js') && !html.includes("src='./royal-pay.js")) {
    const script = '<script src="./royal-pay.js?v=9.1.97" defer></script>';
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
