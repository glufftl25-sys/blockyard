/* Blockyard Arcade app: always fetch the newest game first, and keep a copy for playing offline. */
var CACHE = 'blockyard-app-1';
var CORE = ['game.html', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'site/favicon.svg'];

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
    /* the game and the site: newest from the internet first, the saved copy when offline.
       One saved copy per file (the ?query is left out), so the cache does not grow. */
    var key = url.origin + url.pathname;
    e.respondWith(fetch(url.href, { cache: 'no-store' }).then(function (res) { return keep(key, res); }).catch(function () {
      return caches.match(key, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        /* only a page opens the saved game; a missing picture or file stays missing */
        if (req.mode === 'navigate') return caches.match(/\/$/.test(url.pathname) ? 'index.html' : 'game.html').then(function (p) { return p || caches.match('game.html'); });
        return Response.error();
      });
    }));
    return;
  }
  /* fonts and the email-account code never change at the same address, so the saved copy is used first */
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0)) {
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { return keep(req, res); }); }));
  }
});
