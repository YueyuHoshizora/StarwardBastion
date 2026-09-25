// Service Worker：預先快取全部遊戲檔案，支援離線遊玩（PWA）。
// VERSION 與 PRECACHE 由 npm run assets:hash 產生；JS/CSS 查詢參數不可忽略。
const VERSION = 'sb-f987ad19812d1ebe';
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.ico',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'styles.css?d4d406e6e08620a0',
  'src/audio/audio.js?8af86df7ebdca122',
  'src/boot.js?17bcade6968f5340',
  'src/core/game.js?eb0e2f6ac6977042',
  'src/core/mapgeom.js?d314a0e4ca3593db',
  'src/core/waves.js?d91de24bffb00a7a',
  'src/data/difficulty.js?0c3f404f3b8b9498',
  'src/data/enemies.js?7c995a74b462cbf0',
  'src/data/maps.js?8741a0d292d63389',
  'src/data/music.js?4f037bad87845156',
  'src/data/towers.js?9f11305978ef032f',
  'src/data/waves.js?cab60c4a7a6d3e19',
  'src/i18n/canvas.js?2262802da3b3c0d5',
  'src/i18n/data.js?1053a0ca29fcf141',
  'src/i18n/index.js?f1562a87643b9868',
  'src/i18n/ui.js?a896e84a8a56fe73',
  'src/main.js?b3194363b8efe880',
  'src/pwa.js?75ce8c987a912743',
  'src/render/scene.js?5943e080a7e2de49',
  'src/render/sprites.js?79442e4afc58ad74',
  'src/ui/app.js?fb6e36d6451bed68',
  'src/ui/sharecard.js?732c28e160a37f07',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sb-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 導覽優先取得最新 HTML；離線回退首頁。資源依完整 URL 快取，保留 ?hash 的版本隔離。
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.mode === 'navigate') {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) return res;
      } catch {}
      return await cache.match('index.html') || new Response('', { status: 504, statusText: 'Offline' });
    }
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
