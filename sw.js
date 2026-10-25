// RPL release 9.1.81 — schede chiuse e mercati set semplificati
const CACHE_NAME = "rpl-v9.1.82";
const APP_SHELL = ["./", "./index.html", "./apple-touch-icon.png", "./favicon-32x32.png", "./manifest.webmanifest", "./rpl-header-bg.webp", "./rpl-vote-alert.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener("message", event => { if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil((async()=>{ const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))); await self.clients.claim(); })());
});
self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin && (event.request.mode==='navigate' || /\/index\.html$/.test(url.pathname))){
    event.respondWith(fetch(new Request(event.request,{cache:'no-store'})).then(async response=>{
      if(!response||!response.ok)return response;
      let html=await response.clone().text();
      if(!html.includes('rpl-vote-alert.js'))html=html.replace(/<\/body\s*>/i,'<script src="./rpl-vote-alert.js?v=9.1.82"></script></body>');
      const headers=new Headers(response.headers);
      headers.delete('content-length');headers.delete('content-encoding');
      headers.set('content-type','text/html; charset=utf-8');
      const transformed=new Response(html,{status:response.status,statusText:response.statusText,headers});
      caches.open(CACHE_NAME).then(c=>c.put(event.request,transformed.clone())).catch(()=>{});
      return transformed;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
self.addEventListener("push", event => {
  let data={}; try{data=event.data?event.data.json():{};}catch(e){data={body:event.data?event.data.text():""};}
  const title=data.title||"Royal Padel League";
  const options={body:data.body||"Hai una nuova comunicazione RPL.",icon:data.icon||"apple-touch-icon.png",badge:data.badge||"favicon-32x32.png",tag:data.tag||"rpl-notification",renotify:true,data:{url:data.url||"./index.html#player"}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async()=>{const target=event.notification?.data?.url||"./index.html#player";const absolute=new URL(target,self.registration.scope).href;const list=await self.clients.matchAll({type:"window",includeUncontrolled:true});for(const client of list){if("navigate" in client){try{await client.navigate(absolute);await client.focus();return;}catch(e){}}}await self.clients.openWindow(absolute);})());
});
