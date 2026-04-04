const CACHE = 'blackbox-v3';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(u.hostname.includes('googleapis.com')||u.hostname.includes('accounts.google.com')||u.hostname.includes('drive.google.com')){
    e.respondWith(fetch(e.request).catch(()=>new Response('{"error":"offline"}',{headers:{'Content-Type':'application/json'}})));
    return;
  }
  if(u.hostname.includes('fonts.')){
    e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(cached=>{
      const fresh=fetch(e.request).then(r=>{c.put(e.request,r.clone());return r;}).catch(()=>cached);
      return cached||fresh;
    })));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    if(cached) return cached;
    return fetch(e.request).then(r=>{ if(r.ok&&e.request.method==='GET') caches.open(CACHE).then(c=>c.put(e.request,r.clone())); return r; })
      .catch(()=>{ if(e.request.mode==='navigate') return caches.match('./index.html'); });
  }));
});
