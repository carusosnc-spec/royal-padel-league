const CACHE_NAME = "rpl-v6.5.115";
const APP_SHELL = ["./", "./index_6.5.115.html", "./apple-touch-icon.png", "./favicon-32x32.png"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL).catch(()=>{}))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => { if(event.request.method !== "GET") return; event.respondWith(fetch(event.request).catch(()=>caches.match(event.request))); });
self.addEventListener("notificationclick", event => { event.notification.close(); event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list => { const c=list.find(x=>x.url.includes(location.origin)); return c ? c.focus() : clients.openWindow("./index_6.5.115.html"); })); });
