// ══════════════════════════════════════════════════════════
//  SERVICE WORKER — handles background push notifications
// ══════════════════════════════════════════════════════════

self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};
  const title   = data.title   || "Journal";
  const options = {
    body:    data.body    || "",
    icon:    data.icon    || "/icon-192.png",
    badge:   data.badge   || "/icon-192.png",
    tag:     data.tag     || "journal-notif",
    renotify: true,
    vibrate: [200, 100, 200],
    data:    { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.openWindow(url));
});
