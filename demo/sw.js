// Service worker: shows motion alerts pushed by the server and opens the viewer when one is tapped.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); } catch (err) { d = { title: 'Garage camera', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Garage camera', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'badge-96.png',                 // transparent PNG: Android only uses its alpha channel
    tag: d.tag || 'garage',
    renotify: true,
    requireInteraction: true,              // stays in the shade until tapped or swiped away
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: d.url || './viewer.html' }
  }));
});

self.addEventListener('fetch', function () {});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './viewer.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf('viewer.html') >= 0 && 'focus' in list[i]) { return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
