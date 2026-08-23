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

const VERSION = "rapidbus-v12";
const SHELL_CACHE = `${VERSION}-shell`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
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



/* The shell is served from cache for speed and offline, but ALWAYS revalidated
   behind that. A plain cache-first shell pins users to whatever JS was cached
   on their first visit, so a deploy never reaches them — the app would keep
   running old code indefinitely. */
/* The shell is fetched fresh when the network allows, falling back to cache.

   It used to be cache-first with background revalidation, which is faster but
   means a deploy does not reach anyone until their SECOND load. That repeatedly
   left people running old CSS and old JS with no way to tell. The shell is
   ~150 KB against a VPS tens of milliseconds away, so paying that per load is
   worth never shipping a stale interface. Offline is unaffected — the cache
   answers the moment the network does not.
*/
async function shellWithRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
    // A non-OK status is still the server's real answer; prefer cache if we have it.
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached ?? response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }
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
    event.respondWith(shellWithRevalidate(request));
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
    event.respondWith(shellWithRevalidate(request));
  }
});
