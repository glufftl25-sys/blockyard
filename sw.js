/* Blockyard Arcade app: always fetch the newest game first, and keep a copy for playing offline. */
var CACHE = 'blockyard-app-1';
var CORE = ['game.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function keep(key, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(key, copy); });
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === location.origin) {
    /* the game itself: newest from the internet first, the saved copy when offline */
    e.respondWith(fetch(url.href, { cache: 'no-store' }).then(function (res) { return keep(url.href, res); }).catch(function () {
      return caches.match(url.href, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('game.html'); });
    }));
    return;
  }
  /* fonts and the email-account code never change at the same address, so the saved copy is used first */
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0)) {
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { return keep(req, res); }); }));
  }
});
