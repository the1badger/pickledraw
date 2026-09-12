/* Pickle Draw — keeps a copy of the app on the device.
   Put this file in the same folder as pickle-draw.html on the web server.
   You never need to edit it: to publish a new version of the app, change
   only the app-version meta tag inside the HTML file. */
'use strict';

var APP_CACHE = 'pickle-draw-app';
var LIB_CACHE = 'pickle-draw-lib';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n !== APP_CACHE && n !== LIB_CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* The page tells us where it lives, so we can keep a copy of it. */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'cache-app' || !d.url) return;
  e.waitUntil(
    fetch(d.url + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return;
      return caches.open(APP_CACHE).then(function (c) { return c.put(d.url, r.clone()); });
    }).catch(function () {})
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* The text reader's engine. Keeping a copy means reading a screenshot
     works with no signal after the first time it is used. */
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open(LIB_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (r) {
            if (r && r.ok) c.put(req, r.clone());
            return r;
          });
        });
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* A version check, or the Reload button: always go to the web, and refresh
     the stored copy while we are there. Falls back to the copy if offline. */
  if (url.searchParams.has('v')) {
    var clean = url.origin + url.pathname;
    e.respondWith(
      fetch(req).then(function (r) {
        if (r && r.ok && req.mode === 'navigate') {
          var copy = r.clone();
          caches.open(APP_CACHE).then(function (c) { c.put(clean, copy); });
        }
        return r;
      }).catch(function () {
        return caches.match(clean).then(function (hit) {
          return hit || Response.error();
        });
      })
    );
    return;
  }

  /* Everything else: the stored copy first so it opens instantly and with no
     signal, while quietly fetching a fresh one for next time. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) {
        if (r && r.ok) {
          var copy = r.clone();
          caches.open(APP_CACHE).then(function (c) { c.put(req, copy); });
        }
        return r;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
