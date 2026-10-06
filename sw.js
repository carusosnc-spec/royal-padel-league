const CACHE_NAME = "rpl-v7.4";
const APP_SHELL = ["./", "./index.html", "./apple-touch-icon.png", "./favicon-32x32.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || "Royal Padel League";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Hai una nuova comunicazione RPL.",
    icon: "apple-touch-icon.png",
    badge: "favicon-32x32.png",
    tag: data.tag || "rpl-notification",
    data: { url: data.url || "./index.html" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification?.data?.url || "./index.html";
  event.waitUntil((async () => {
    const list = await clients.matchAll({type:"window", includeUncontrolled:true});
    const target = new URL(url, self.location.origin).href;
    const same = list.find(c => c.url.startsWith(self.location.origin));
    if (same) { await same.navigate(target); await same.focus(); }
    else await clients.openWindow(target);
  })());
});
