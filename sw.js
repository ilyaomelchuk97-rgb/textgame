/* ------------------------------------------------------------------ *
 * Service worker: игра запускается без сети.
 *
 * Стратегия «сначала кэш»: оболочка (index.html, game.html, скрипты,
 * стили, обложки меню) лежит в кэше и отдаётся мгновенно, а запросы
 * к /api/* (мастер, картинки, озвучка) идут в сеть — их кэшировать
 * нельзя, иначе мастер «запомнит» старый ход.
 * ------------------------------------------------------------------ */
'use strict';

// Увеличиваем версию при изменении оболочки: PWA не должна оставаться на
// закэшированных HTML/CSS/JS и пропускать новые изображения интерфейса.
const VERSION = 'dt2-v45';
const SHELL_CACHE = VERSION + '-shell';
const COVER_IMAGES = [
  'menu-bg', 'sc-forest', 'sc-ocean', 'sc-space', 'sc-noir', 'sc-waste',
  'gw-azeroth', 'gw-nightcity', 'gw-runes', 'gw-custom'
];
const HOME_SCENE_IMAGES = [
  'home-01', 'home-02', 'home-03', 'home-04', 'home-05',
  'home-06', 'home-07', 'home-08', 'home-09', 'home-10'
];
const HOME_SCENE_LAYERS = HOME_SCENE_IMAGES.flatMap(name => [
  './assets/home-scenes/layers/' + name + '-sky.webp',
  './assets/home-scenes/layers/' + name + '-buildings.webp',
  './assets/home-scenes/layers/' + name + '-monster.webp'
]);
const CRITTER_IMAGES = [
  'knight', 'dragon', 'engineer', 'necro', 'cyber', 'orc', 'mage',
  'assassin', 'golem', 'wolf', 'drone', 'ghost', 'zombie', 'pirate'
];
const THEME_IMAGES = [
  'ice-tex', 'ice-ui-bg', 'ice-ui-button',
  'ink-tex', 'ink-ui-bg', 'ink-ui-button',
  'material-tex', 'material-ui-bg', 'material-ui-button',
  'neon-tex', 'neon-ui-bg', 'neon-ui-button',
  'night-tex', 'night-ui-bg', 'night-ui-button',
  'oled-ui-bg', 'oled-ui-button',
  'parchment-tex', 'parchment-ui-bg', 'parchment-ui-button',
  'sunset-tex', 'sunset-ui-bg', 'sunset-ui-button',
  'terminal-bg', 'terminal-tex', 'terminal-ui-button'
];
const SHELL = [
  './',
  './index.html',
  './game.html',
  './manifest.webmanifest',
  './sw.js',
  './src/styles.css',
  './src/skins.css',
  './src/engine.js',
  './src/backdrop.js',
  './src/critters.js',
  './src/api.js',
  './src/app.js',
  './src/online-adventure.js',
  './src/books.js',
  './src/stories.js',
  './src/daily.js',
  './src/metrics.js',
  ...COVER_IMAGES.map(name => './assets/' + name + '.jpg'),
  ...HOME_SCENE_IMAGES.map(name => './assets/home-scenes/' + name + '.jpg'),
  ...HOME_SCENE_LAYERS,
  './assets/dice-transition.png',
  ...CRITTER_IMAGES.map(name => './assets/critters/' + name + '-run.webp'),
  ...THEME_IMAGES.map(name => './assets/themes/' + name + '.webp'),
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
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
