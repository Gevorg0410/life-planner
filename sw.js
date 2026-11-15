/* Increase VERSION whenever any application asset changes before publishing. */
const VERSION='life-v03-20261116-2';
const CACHE=VERSION+'-'+self.registration.scope;
const ASSETS=['./','./index.html','./app.js','./model.js','./sync.js','./cloud.css','./firebase-config.js','./manifest.webmanifest','./pwa.js','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable.png','./icons/apple-touch-icon.png','./vendor/firebase-app-compat.js','./vendor/firebase-auth-compat.js','./vendor/firebase-firestore-compat.js'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const asset of ASSETS){const request=new Request(new URL(asset,self.registration.scope),{cache:'reload'});const response=await fetch(request);if(!response.ok)throw Error('Asset unavailable: '+asset);await cache.put(request,response)}})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('life-v03-')&&k.endsWith('-'+self.registration.scope)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 // Firebase APIs and user records are never stored in this application cache.
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(event.request,{ignoreSearch:false});if(hit)return hit;if(event.request.mode==='navigate'){const shell=await cache.match(new URL('./index.html',self.registration.scope));if(shell)return shell}return fetch(event.request)})());
});
