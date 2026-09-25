/* ------------------------------------------------------------------ *
 * Service worker: игра запускается без сети.
 *
 * Стратегия «сначала кэш»: оболочка (index.html, game.html, скрипты,
 * стили, обложки меню) лежит в кэше и отдаётся мгновенно, а запросы
 * к /api/* (мастер, картинки, озвучка) идут в сеть — их кэшировать
 * нельзя, иначе мастер «запомнит» старый ход.
 * ------------------------------------------------------------------ */
'use strict';

const VERSION = 'dt2-v13';
const SHELL_CACHE = VERSION + '-shell';
const SHELL = [
  './',
  './index.html',
  './game.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/skins.css',
  './src/engine.js',
  './src/backdrop.js',
  './src/critters.js',
  './src/api.js',
  './src/app.js',
  './src/books.js',
  './src/stories.js',
  './src/daily.js',
  './src/metrics.js',
  './assets/menu-bg.jpg',
  './assets/icon-192.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // каждый файл отдельно: отсутствие одного не должно ломать установку
    await Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== SHELL_CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isApi(url) {
  return /\/api\//.test(url.pathname) || url.pathname.indexOf('/api/') === 0;
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // чужие генераторы не перехватываем
  if (isApi(url)) return;                            // мастер, картинки, озвучка — только сеть

  ev.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      // отдаём из кэша сразу, а свежее — тянем в фоне для следующего запуска
      ev.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        } catch (e) { /* офлайн — значит живём на кэше */ }
      })());
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      // совсем без сети: для навигации отдаём оболочку, если она есть
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html') || await cache.match('./game.html') || await cache.match('./');
        if (shell) return shell;
      }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});

self.addEventListener('message', ev => {
  if (ev.data === 'skip-waiting') self.skipWaiting();
});
