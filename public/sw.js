// Wasla service worker — handles push notifications.
// Self-hosted (VAPID) — no third-party script imported here anymore.

/* Offline fallback.
   Without one the browser draws its own offline screen: the app icon in a
   frame, and "You're offline" in the browser's language rather than the app's.
   Caching one page lets us answer with our own — same logo, no box, and in
   Arabic for somebody who reads Arabic.

   The version in the name is how a changed offline.html reaches anybody who
   already has one. install only runs when this file itself changes, and
   activate keeps the cache whose name still matches — so editing the page
   alone leaves every returning visitor on the copy they cached. Bumped to v3
   because the mark drawn inside that page changed. Bump it whenever
   offline.html does. */
const OFFLINE_CACHE = "wasla-offline-v3";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" }))).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))),
      ),
    ]),
  );
});

/* Only page loads are intercepted, and only to answer one that has already
   failed — everything else goes to the network untouched, so nothing here can
   serve a stale asset. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(async () => {
      const hit = await caches.match(OFFLINE_URL);
      return hit || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
    }),
  );
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
  // Unique tag per notification so a new one never silently replaces a previous
  // one (previous bug: same/undefined tag caused "only the first shows").
  const uniqueTag = `wasla-${payload.id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const options = {
    body: payload.body || "",
    data: { url: payload.url || payload.data?.url || "/dashboard" },
    tag: uniqueTag,
    renotify: true,
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
