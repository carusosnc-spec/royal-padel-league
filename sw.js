// RPL release v.10 — campi chiari modulo votazioni — ripristino frecce classifica basate sulle partite
const CACHE_NAME = "rpl-v26";
const APP_SHELL = ["./", "./index.html", "./apple-touch-icon.png", "./favicon-32x32.png", "./manifest.webmanifest", "./rpl-header-bg.webp", "./rpl-vote-alert.js", "./royal-pay.js", "./rpl-ranking-evolution.js", "./rpl-last-sets.js", "./rpl-ranking-movement.js", "./rpl-player-logos.js", "./rpl-db-timestamp.js", "./rpl-offline-cache.js", "./paolo-cavallaro.webp"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(async c => {
    // Cache each shell resource independently: one missing asset must not prevent index.html from being cached.
    await Promise.all(APP_SHELL.map(path => c.add(path).catch(() => null)));
    // Trasforma l'HTML una sola volta durante l'installazione, non ad ogni apertura.
    for (const path of ["./index.html", "./"]) {
      const cachedPage = await c.match(path);
      if (cachedPage) {
        const enhancedPage = await injectRoyalPay(cachedPage, new URL(path, self.location.href).href);
        if (enhancedPage && enhancedPage.ok) await c.put(path, enhancedPage);
      }
    }
  }));
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
  html = html.replace(/(\.\/royal-pay\.js\?v=)[^\"\s>]+/g, '$1' + '10.0.2');
  const injectedScripts = [
    ['rpl-ranking-evolution.js', '<script src="./rpl-ranking-evolution.js?v=1" defer></script>'],
    ['rpl-last-sets.js', '<script src="./rpl-last-sets.js?v=2" defer></script>'],
    ['rpl-ranking-movement.js', '<script src="./rpl-ranking-movement.js?v=9" defer></script>'],
    ['rpl-vote-alert.js', '<script src="./rpl-vote-alert.js?v=1" defer></script>'],
    ['rpl-player-logos.js', '<script src="./rpl-player-logos.js?v=1" defer></script>'],
    ['rpl-db-timestamp.js', '<script src="./rpl-db-timestamp.js?v=2" defer></script>']
  ];
  for (const [needle, script] of injectedScripts) {
    if (!html.includes('src="./' + needle) && !html.includes("src='./" + needle)) {
      if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, script + "</body>");
      else html += script;
    }
  }
  // Install the offline bootstrap before the main application script.
  // Match the real startup call even if formatting/whitespace changes in index.html.
  const bootPattern = /\(async\s*\(\)\s*=>\s*\{\s*await\s+loadPlayers\(\)\s*;\s*buildSets\(\)\s*;\s*await\s+loadRanking\(\)\s*\}\)\s*\(\)\s*;?/;
  const bootMatch = html.match(bootPattern);
  if (bootMatch) {
    const bootAt = bootMatch.index;
    const scriptAt = html.lastIndexOf("<script", bootAt);
    if (scriptAt >= 0) {
      const preloader = '<script src="./rpl-offline-cache.js?v=2" onerror="document.getElementById(\'status\').textContent=\'Cache locale non disponibile: impossibile caricare la classifica salvata.\'"></script>';
      if (!html.includes('src="./rpl-offline-cache.js')) html = html.slice(0, scriptAt) + preloader + html.slice(scriptAt);
    }
    const offlineBoot = 'window.RPLOfflineBoot ? window.RPLOfflineBoot({loadPlayers,loadRanking,buildSets,fill,render,getPlayers:()=>dbPlayers,getStats:()=>stats,setPlayers:v=>{dbPlayers=v;window.dbPlayers=dbPlayers},setStats:v=>{stats=v},setHasSnapshot:v=>{window.__rplHasOfflineSnapshot=v},hasSnapshot:()=>!!window.__rplHasOfflineSnapshot}) : (document.getElementById("status").textContent="Cache locale non attiva: avvio connessione a Supabase…", (async()=>{await loadPlayers();buildSets();await loadRanking()})())';
    html = html.replace(bootMatch[0], offlineBoot);
  } else {
    // Expose a clear diagnostic rather than silently pretending offline startup is active.
    const diagnostic = '<script>window.addEventListener("load",function(){if(!window.RPLOfflineBoot){var s=document.getElementById("status");if(s)s.textContent="Avvio offline non attivo: aggiorna la pagina con Internet."}});</script>';
    if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, diagnostic + "</body>");
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
    const isAppDocument = req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/");
    if (isAppDocument) {
      // Avvio immediato: se la pagina è già in cache, non scaricare nuovamente
      // l'intero HTML da ~8 MB ad ogni apertura. Gli aggiornamenti statici
      // vengono distribuiti tramite la versione del Service Worker.
      const cached = await caches.match(req) || await caches.match("./index.html") || await caches.match("./");
      if (cached) return cached;

      // Solo prima installazione o cache assente: recupera e prepara la pagina.
      try {
        const network = await fetch(req);
        const response = await injectRoyalPay(network, req.url);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, response.clone());
        }
        return response;
      } catch (_) {
        return Response.error();
      }
    }
    try {
      const network = await fetch(req);
      if (network && network.ok) {
        const copy = network.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return network;
    } catch (_) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
    }
  })());
});
