// CDN 리셀러 사업 기획 SW — index.html 은 항상 네트워크 우선, 정적 자원은 cache-first
const CACHE = 'cdn-plan-v10';
const ASSETS = ['./manifest.json', './icon-192.svg', './icon-512.svg', './style.css', './app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(async () => {
      try {
        const list = await self.clients.matchAll({ type: 'window' });
        list.forEach(c => { try { c.postMessage({ type: 'SW_FORCE_RELOAD' }); } catch(_){} });
      } catch(_){}
    })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Google API 등 패스

  const isHtml = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') || req.destination === 'document';
  if (isHtml) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => null))
  );
});
