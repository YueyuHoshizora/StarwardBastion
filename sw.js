// Service Worker：預先快取全部遊戲檔案，支援離線遊玩（PWA）。
// 更新任何遊戲檔案後須提高 VERSION；tests/pwa.test.mjs 會檢查 PRECACHE 涵蓋所有執行期檔案。
const VERSION = 'sb-v5';
const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'favicon.ico',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'src/main.js',
  'src/pwa.js',
  'src/ui/app.js',
  'src/ui/sharecard.js',
  'src/audio/audio.js',
  'src/render/scene.js',
  'src/render/sprites.js',
  'src/core/game.js',
  'src/core/mapgeom.js',
  'src/core/waves.js',
  'src/data/difficulty.js',
  'src/data/enemies.js',
  'src/data/maps.js',
  'src/data/music.js',
  'src/data/towers.js',
  'src/data/waves.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 同源 GET：快取優先，背景更新（stale-while-revalidate）；導覽請求離線時回退到 index.html。
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('', { status: 504, statusText: 'Offline' });
    }),
  );
});
