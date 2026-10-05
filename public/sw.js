/* Offline support for Rapid Bus Live.

   The data splits cleanly in two:

   - Timetables, route geometry and stop lists change about once a day, so they
     are worth keeping. Served from cache immediately and refreshed in the
     background.
   - Vehicle positions are meaningless a minute later. They are never served
     from cache as if they were current — a cached /map response is handed back
     when the network is gone, but stamped with when it was stored so the UI can
     say so and stop pretending the buses are live.

   Nothing here invents freshness it does not have.
*/

const VERSION = "rapidbus-v16";
const SHELL_CACHE = `${VERSION}-shell`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/search-core.js",
  "/styles.css",
  "/native-bridge.js",
  "/platform-overrides.js",
  "/manifest.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/icon-maskable-512.png",
  "/assets/bus.svg",
  "/vendor/leaflet.js",
  "/vendor/leaflet.css",
  "/vendor/images/marker-icon.png",
  "/vendor/images/marker-icon-2x.png",
  "/vendor/images/marker-shadow.png",
  "/vendor/images/layers.png",
  "/vendor/images/layers-2x.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One missing asset must not fail the whole install.
      await Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: "reload" }))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});



/* The shell is served from cache instantly and revalidated in the background.

   History: this was cache-first (fast, but deploys reached nobody until their
   second load, with no way to tell), then network-first (deploys land on the
   first load, but every open pays the full network round trip for every shell
   file before anything renders — and the server turned out to be ~200ms away,
   not "tens of milliseconds", so that was over a second of blank screen per
   visit). This is the third take: cache answers immediately, the fresh copy is
   fetched behind it, and when a background fetch brings back DIFFERENT bytes
   the page is told so it can show a "new version — refresh" chip. Speed of
   cache-first, visibility of network-first. */

/* Core files where a change means "the app updated" — worth telling the page.
   Fonts and marker images also flow through here but update silently. */
const NOTIFY_PATHS = new Set(["/", "/index.html", "/app.js", "/search-core.js", "/styles.css", "/platform-overrides.js", "/native-bridge.js"]);

function shellFileChanged(cached, fresh) {
  const a = cached.headers.get("etag");
  const b = fresh.headers.get("etag");
  if (a && b) {
    return a !== b;
  }
  const la = cached.headers.get("content-length");
  const lb = fresh.headers.get("content-length");
  return Boolean(la && lb && la !== lb);
}

async function notifyShellUpdated() {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "shell-updated" });
  }
}

async function shellStaleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });

  const refresh = (async () => {
    const response = await fetch(request);
    if (response.ok) {
      const url = new URL(request.url);
      if (cached && NOTIFY_PATHS.has(url.pathname) && shellFileChanged(cached, response)) {
        void notifyShellUpdated();
      }
      await cache.put(request, response.clone());
    }
    return response;
  })();

  if (cached) {
    refresh.catch(() => {
      /* offline or flaky — the cached copy already answered */
    });
    return cached;
  }

  try {
    return await refresh;
  } catch {
    throw new Error("offline and shell not cached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Map tiles: never worth persisting in bulk, and Leaflet handles gaps.
  if (url.hostname.endsWith("basemaps.cartocdn.com")) {
    return;
  }

  // Google Fonts are fine to keep once fetched.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(shellStaleWhileRevalidate(request));
    return;
  }

  /* API traffic is deliberately NOT handled here.

     In the Capacitor Android shell the worker's origin is the synthetic
     https://localhost served by Capacitor's asset loader, and requests made
     from the worker are routed through that loader — which cannot reach an
     external host. fetch() inside the worker fails with "Failed to fetch" even
     though the identical call from the page succeeds, so intercepting API
     requests here breaks the app outright in the shell.

     The page caches API responses itself (see getJson in app.js), which works
     in both the browser and the shell. The worker keeps to the app shell, which
     is same-origin in both. */
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(shellStaleWhileRevalidate(request));
  }
});

/* ------------------------------------------------------------------------- */
/* Web Push — show server notifications, and focus the app when one is tapped */
/* ------------------------------------------------------------------------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Public Transport Live", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Public Transport Live", {
      body: data.body || "",
      icon: "/assets/icon-192.png",
      badge: "/assets/badge.png",
      // Sound + buzz: Android plays the channel's default alert tone when the
      // notification isn't silent and asks to vibrate. A tag+renotify means a
      // fresh alert re-notifies instead of silently replacing the last one.
      silent: false,
      vibrate: [200, 100, 200],
      renotify: true,
      requireInteraction: true,
      tag: "ptlive-alert",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
