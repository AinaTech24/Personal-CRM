/**
 * Aina CRM service worker.
 *
 * Deliberately conservative: this is a live CRM, so nothing that can go stale is
 * cached. Only immutable build assets and the app icons are served cache-first.
 * Every page and API request goes to the network, with an offline notice as the
 * last resort for navigations.
 */

const CACHE = "aina-crm-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let the CDN etc. through untouched

  // Never cache data — the CRM must always show live records.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())));
  }
});

/* ------------------------------ push messages ----------------------------- */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A push with a non-JSON body still deserves a notification: iOS drops the
    // subscription if a push arrives and nothing is shown.
    data = { title: "Aina CRM", body: event.data ? event.data.text() : "New activity" };
  }

  const title = data.title || "Aina CRM";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Same tag = one chat replaces its own previous notification instead of
      // stacking a banner per message.
      tag: data.tag || "aina-message",
      renotify: true,
      data: { url: data.url || "/messages" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/messages";

  // Focus an existing window if the app is already open rather than spawning a
  // second one, then steer it to the conversation.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
