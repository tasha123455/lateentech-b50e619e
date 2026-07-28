// Wasla service worker — handles push notifications.
// Self-hosted (VAPID) — no third-party script imported here anymore.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.stopImmediatePropagation();

  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Wasla", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Wasla";
  const options = {
    body: payload.body || "",
    data: { url: payload.url || payload.data?.url || "/dashboard" },
    tag: payload.id || undefined,
    renotify: false,
    image: payload.image || undefined,
    icon: payload.icon || "/wasla-notification-icon.png",
    badge: payload.badge || "/wasla-badge-monochrome.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
