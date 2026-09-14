const state = {
  category: "rapid-bus-kl",
  activeRouteId: null,
  routeCasing: null,
  routeLayer: null,
  stopLayer: null,
  stopLayersById: new Map(),
  vehicleMarkers: new Map(),
  liveTimer: null,
  countdownTimer: null,
  nextRefreshAt: null,
  currentRoute: null,
  detailLoading: false,
  currentStats: {
    stops: 0,
    shapes: 0,
    vehicles: 0,
    avgSpeed: null
  },
  currentStops: [],
  currentVehicles: [],
  followVehicles: true,
  detailsTab: "stops",
  userLocation: null,
  modeFilter: "all",
  alertsByRoute: new Map(),
  stopAlerts: new Map(),
  alertTimer: null,
  region: "my",
  userMarker: null,
  accuracyCircle: null,
  shapePaths: [],
  markerTicker: null,
  selectedStopId: null,
  selectedVehicleId: null,
  routePassed: null,
  routeAhead: null,
  routeAheadCasing: null,
  arrowLayer: null,
  arrowRedraw: null,
  /* Which of the route's direction patterns is on screen, and what the API
     reported about the alternatives. */
  direction: 0,
  patterns: [],
  mode: "bus",
  live: true,
  liveFeedStatus: "live",
  liveFeedMessage: "",
  shapeSource: "feed",
  journey: {
    from: null,
    to: null,
    results: [],
    selected: -1,
    layers: [],
    alertStop: null,
    watchId: null,
    nativeWatchId: null,
    tracking: false,
    marker: null,
    reminders: false,
    reminderTimers: [],
    speedSamples: [],
    notified3min: false,
    mapStops: [],
    progressLines: [],
    alerted: false
  }
};

const LIVE_REFRESH_MS = 30000;           // active: buses moving on the route
const LIVE_REFRESH_IDLE_MS = 60000;      // quiet: no live vehicles right now
const MARKER_ANIMATION_MS = 1200;
const RECENT_KEY = "rapidbus.recentRoutes";
const REGION_KEY = "rapidbus.region";
const DATA_NOTICE_KEY = "rapidbus.dataNotice.v1";
const REGION_CENTERS = { my: [3.139, 101.6869], sg: [1.3521, 103.8198] };

/* First-use clarity: the app combines genuinely live positions with published
   schedules, so explain both before a passenger treats either as a promise. */
function initDataNotice() {
  const notice = document.getElementById("dataNotice");
  const accept = document.getElementById("dataNoticeAccept");
  if (!notice || !accept) return;

  let accepted = false;
  try {
    accepted = localStorage.getItem(DATA_NOTICE_KEY) === "1";
  } catch {
    /* Storage can be blocked; showing the notice again is the safe fallback. */
  }
  if (accepted) return;

  notice.hidden = false;
  document.body.classList.add("data-notice-open");
  accept.focus();
  accept.addEventListener("click", () => {
    try {
      localStorage.setItem(DATA_NOTICE_KEY, "1");
    } catch {
      /* The notice can still be dismissed for this page load. */
    }
    notice.hidden = true;
    document.body.classList.remove("data-notice-open");
  }, { once: true });
}

initDataNotice();

function isSgCategory(category) {
  return String(category || "").startsWith("sg-");
}

function inRegion(category) {
  return (state.region === "sg") === isSgCategory(category);
}

/* Switch country: filter the lists and (on a tap, not on boot) fly the map. */
function applyRegion(region, { fly = false } = {}) {
  state.region = region;
  try {
    localStorage.setItem(REGION_KEY, region);
  } catch {
    /* optional */
  }
  document.querySelectorAll(".region-btn").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.region === region);
  });
  searchRoutes();
  if (fly) {
    if (state.followVehicles) setFollow(false);
    map.flyTo(REGION_CENTERS[region], 11, { duration: 0.9 });
  }
}
const SAVED_KEY = "rapidbus.savedRoutes";

/* Which modes a route belongs to. Buses and KTM are whole feeds; within
   rapid-rail-kl the feed's own longNames say what each line is ("MRT Kajang
   Line", "LRT Ampang Line"), so classification reads that instead of keeping a
   hardcoded line list that goes stale when a line opens. Monorail and BRT
   match no chip and appear under All only. */
function routeMode(route) {
  if (
    route.category.startsWith("rapid-bus") ||
    route.category.startsWith("mybas-") ||
    route.category === "sg-bus"
  ) {
    return "bus";
  }
  if (route.category === "ktmb") return "ktm";
  if (route.category === "rapid-rail-kl" || route.category === "sg-rail") {
    if (/^MRT/i.test(route.longName)) return "mrt";
    if (/^LRT/i.test(route.longName)) return "lrt";
  }
  return null;
}

function loadSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* localStorage unavailable — saving is optional */
  }
}

function isSaved(routeId) {
  return loadSaved().some((item) => item.routeId === routeId);
}

function toggleSaved(routeId, category) {
  const list = loadSaved();
  const at = list.findIndex((item) => item.routeId === routeId);
  if (at >= 0) {
    list.splice(at, 1);
  } else {
    list.unshift({ routeId, category });
  }
  storeSaved(list);
  renderSuggestions();
  updateStarButton();
}

const THEME_KEY = "rapidbus.theme";

/* CARTO now watermarks its raster tiles ("API KEY REQUIRED") unless the
   request carries a free key. Get one in a minute at carto.com/basemaps/apikey
   (no account needed, 5M tiles/month free) and paste it below — that's the only
   change needed to clear the watermark. Empty = tiles still load, just stamped.
   It's a client-side map key, safe to ship in the page like every web map key. */
const CARTO_KEY = "cb1_2f6z_1_072bbffdecf1f74d0a9a44ee";

function cartoTiles(path) {
  const url = `https://{s}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}{r}.png`;
  return CARTO_KEY ? `${url}?key=${CARTO_KEY}` : url;
}

const BASEMAPS = {
  /* nolabels: text shares colours with water and roads, so remapping tiles
     that contain text mangles it — geometry is remapped, labels come from
     CARTO's own dark label layer drawn on top, already light-on-dark. */
  dark: cartoTiles("rastertiles/voyager_nolabels"),
  darkLabels: cartoTiles("dark_only_labels"),
  light: cartoTiles("light_all")
};

/* Dark map, take two. CARTO's dark tiles paint sea and major roads the
   IDENTICAL grey (#262626 — measured), so no CSS filter can ever tell them
   apart: boosting roads turned Singapore's strait into a bright blue sheet.
   Instead the dark theme reads CARTO voyager — whose water really is blue —
   and regrades every pixel on a canvas: sea to deep navy, land to near-black,
   streets and highways to two tiers of light blue, parks kept faintly green.
   Classification is by hue relationships, so antialiased edges land in the
   nearest family instead of breaking. */
const remapCache = new Map();

function remapPixel(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  const hit = remapCache.get(key);
  if (hit) return hit;

  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  let out;
  if (b > r + 8 && b > g + 2) {
    // water — deeper where the source was deeper
    out = [10 + 14 * luma, 24 + 20 * luma, 42 + 28 * luma];
  } else if (r - b > 55 && g - b > 35) {
    out = [126, 180, 255]; // highways: the brightest tier
  } else if (g - r > 8 && g - b > 8) {
    out = [13 + 12 * luma, 30 + 14 * luma, 22 + 10 * luma]; // parks
  } else if (luma > 0.945 && r - b <= 4) {
    out = [116, 172, 228]; // streets (and label halos, which read as glow)
  } else if (luma > 0.82) {
    out = [8, 14, 23]; // the land itself — matches --map-bg #080e17
  } else if (luma > 0.55) {
    out = [17, 26, 40]; // buildings and casings, one step above land
  } else {
    out = [176, 203, 233]; // dark label ink flips to light
  }
  remapCache.set(key, out);
  return out;
}

/* A tile layer that draws each tile through the remap. Falls back to the
   plain image if the canvas is tainted (CORS failure) — a normal voyager
   tile is worse than the navy look but infinitely better than a blank map. */
const RemappedTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement("canvas");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      tile.width = img.naturalWidth;
      tile.height = img.naturalHeight;
      const ctx = tile.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      try {
        const data = ctx.getImageData(0, 0, tile.width, tile.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const [r, g, b] = remapPixel(px[i], px[i + 1], px[i + 2]);
          px[i] = r;
          px[i + 1] = g;
          px[i + 2] = b;
        }
        ctx.putImageData(data, 0, 0);
      } catch {
        ctx.drawImage(img, 0, 0);
      }
      done(null, tile);
    };
    img.onerror = (event) => done(event, tile);
    img.src = this.getTileUrl(coords);
    return tile;
  }
});

function makeBaseLayer(forTheme) {
  const options = {
    maxZoom: 20,
    maxNativeZoom: 18,
    subdomains: "abcd",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  };
  if (forTheme !== "dark") {
    return L.tileLayer(BASEMAPS.light, options);
  }
  return L.layerGroup([
    new RemappedTileLayer(BASEMAPS.dark, { ...options, zIndex: 1 }),
    L.tileLayer(BASEMAPS.darkLabels, { ...options, zIndex: 2, className: "label-tiles" })
  ]);
}

function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    /* localStorage unavailable — fall through to the system preference */
  }
  // Light is the default for everyone; dark is a choice made with the toggle.
  return "light";
}

let theme = readTheme();
document.documentElement.dataset.theme = theme;

const map = L.map("map", {
  zoomControl: false,
  attributionControl: true
}).setView([3.139, 101.6869], 12);

window.setTimeout(() => map.invalidateSize(), 0);
window.addEventListener("resize", () => map.invalidateSize());

/* The map fills the viewport, but on a phone the bottom sheet covers its lower
   half. Leaflet knows nothing about the sheet, so flyTo centred points at 50%
   of the screen — a couple of percent BEHIND the sheet's top edge. Locating
   yourself put the dot exactly where it could not be seen. These wrappers aim
   at the middle of the strip the sheet leaves visible instead. Desktop is
   excluded: there the rail is a side column and true centring is correct. */
function sheetCoveredHeight() {
  if (window.matchMedia("(min-width: 1101px)").matches) {
    return 0;
  }
  const railTop = document.querySelector(".rail")?.getBoundingClientRect().top ?? 0;
  const covered = window.innerHeight - railTop;
  return covered > 0 && covered < window.innerHeight ? covered : 0;
}

function flyToVisible(latlng, zoom, options) {
  const covered = sheetCoveredHeight();
  if (!covered) {
    map.flyTo(latlng, zoom, options);
    return;
  }
  // Shift the centre down by half the covered height, so the point itself
  // rises to the middle of the visible strip.
  const target = map.project(latlng, zoom);
  target.y += covered / 2;
  map.flyTo(map.unproject(target, zoom), zoom, options);
}

function fitBoundsVisible(bounds, options = {}) {
  const covered = sheetCoveredHeight();
  map.fitBounds(bounds, covered ? { ...options, paddingBottomRight: L.point(0, covered) } : options);
}

let baseLayer = makeBaseLayer(theme).addTo(map);

/* The basemap changes with the palette so the map never fights the chrome. */
function applyTheme(next) {
  theme = next;
  document.documentElement.dataset.theme = next;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", next === "dark" ? "#050810" : "#f5f5f5");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#050505" : "#f5f5f5");
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* persistence is optional */
  }

  const replacement = makeBaseLayer(next).addTo(map);
  baseLayer.remove();
  baseLayer = replacement;

  if (state.currentRoute) {
    drawRouteStyles();
  }
}

const VEHICLE_POPUP_OPTS = { className: "app-popup", closeButton: false, offset: [0, -16], maxWidth: 280 };
const STOP_POPUP_OPTS = { className: "app-popup", closeButton: false, offset: [0, -4], maxWidth: 280 };

const routeSearch = document.getElementById("routeSearch");
const clearSearch = document.getElementById("clearSearch");
const suggestRow = document.getElementById("suggestRow");
const routeList = document.getElementById("routeList");
const routeCount = document.getElementById("routeCount");
const statusText = document.getElementById("statusText");
const routeDetails = document.getElementById("routeDetails");
const liveText = document.getElementById("liveText");
const followButton = document.getElementById("followButton");
const refreshButton = document.getElementById("refreshButton");
const locateButton = document.getElementById("locateButton");
const recentBlock = document.getElementById("recentBlock");
const savedBlock = document.getElementById("savedBlock");
const savedAdd = document.getElementById("savedAdd");
const recentRow = document.getElementById("recentRow");
const closeDetails = document.getElementById("closeDetails");
const themeToggle = document.getElementById("themeToggle");
const zoomIn = document.getElementById("zoomIn");
const zoomOut = document.getElementById("zoomOut");
const searchHint = document.getElementById("searchHint");
const legend = document.getElementById("legend");
const legendToggle = document.getElementById("legendToggle");
const rail = document.querySelector(".rail");
const sheetHandle = document.getElementById("sheetHandle");
const legendLive = document.getElementById("legendLive");
const legendStale = document.getElementById("legendStale");
const routesView = document.getElementById("routesView");
const journeyView = document.getElementById("journeyView");
const jpFrom = document.getElementById("jpFrom");
const jpTo = document.getElementById("jpTo");
const jpFromResults = document.getElementById("jpFromResults");
const jpToResults = document.getElementById("jpToResults");
const jpLocate = document.getElementById("jpLocate");
const jpPlan = document.getElementById("jpPlan");
const jpOutput = document.getElementById("jpOutput");
const jpSummary = document.getElementById("jpSummary");
const jpSummaryFrom = document.getElementById("jpSummaryFrom");
const jpSummaryTo = document.getElementById("jpSummaryTo");
const jpEdit = document.getElementById("jpEdit");

/* Filled from /categories so bus, rail and KTM feeds all describe themselves
   rather than being hardcoded here. */
const labels = {};
const shortLabels = {};
const feedInfo = {};

/* Every route across every working area, loaded once then filtered locally so
   suggestions appear instantly as you type. */
let routeIndex = [];
let indexReady = false;

let searchToken = 0;
let selectToken = 0;
let searchDebounce = null;

/* MRT feeder routes ship no shortName — their code ("T117") sits in longName.
   Normalize every area into one shape the UI can render and search. */
function normalizeRoute(route, category) {
  const rawShort = String(route.shortName || "").trim();
  const rawLong = String(route.longName || route.description || "").trim();
  const looksLikeCode = /^[A-Z]{0,3}\d{1,4}[A-Z]?$/i.test(rawLong);

  /* MyBus Ipoh and both Seremban concessions publish route_short_name IDENTICAL
     to route_long_name — no code at all — and a badge cannot hold "STESEN BAS
     MEDAN KIDD - BERCHAM VIA TAMAN IPOH". There the code lives in route_id
     (A101A, N50, N10A), so fall back to it.

     Only when the two names MATCH: feeds whose route_id is a meaningless serial
     (Alor Setar's 30411, Kota Bharu's 30427) do publish a real short name, and
     a length heuristic would wreck them — and wreck the rail line names
     ("PUTRAJAYA LINE") that badgeLabel already handles. */
  const shortDuplicatesLong =
    Boolean(rawShort) && rawShort.toLowerCase() === rawLong.toLowerCase();
  const usableShort = shortDuplicatesLong ? "" : rawShort;

  const shortName = usableShort || (looksLikeCode ? rawLong : route.routeId);
  const longName = usableShort || !looksLikeCode ? rawLong : `${labels[category]} route ${rawLong}`;

  return {
    routeId: route.routeId,
    category,
    shortName,
    longName,
    description: String(route.description || "").trim(),
    color: route.color || null,
    /* The feed label is in the haystack so a network can be found by name —
       "mybas", "melaka", "penang" — not only by a route number you would have
       to know already. "mybus" is included because three of these concessions
       brand themselves that way and passengers say it. */
    haystack: `${shortName} ${longName} ${route.description || ""} ${route.routeId} ${labels[category] || ""} ${category}${category.startsWith("mybas-") ? " mybus bas.my" : ""}`.toLowerCase()
  };
}

function applyRouteIndex(data) {
  for (const feed of data.feeds || []) {
    labels[feed.id] = feed.label;
    shortLabels[feed.id] = feed.short;
    feedInfo[feed.id] = feed;
  }
  routeIndex = (data.categories || []).flatMap((entry) =>
    (entry.routes || []).map((route) => normalizeRoute(route, entry.category))
  );
  indexReady = true;
}

async function buildRouteIndex() {
  /* Route lists change about once a day, so yesterday's copy is a perfectly
     good first paint. Render it the moment the app opens; the network refresh
     replaces it quietly. Against a ~200ms-away server this is the difference
     between routes appearing instantly and staring at skeletons for seconds. */
  const target = apiUrl("/api/route-index");
  if (!indexReady) {
    const cached = await readApiCache(target);
    if (cached?.data?.categories?.length) {
      applyRouteIndex(cached.data);
      searchRoutes();
      renderSuggestions();
      renderRecents();
    }
  }

  try {
    const data = await getJson("/api/route-index");
    if (!data?.categories?.length) {
      throw new Error("empty route index");
    }
    applyRouteIndex(data);
    return;
  } catch (error) {
    // A cached index is already on screen — a failed refresh is not a failure.
    if (indexReady) {
      return;
    }
    console.warn("route index endpoint unavailable, falling back:", error.message);
  }

  /* Old servers (or a mid-deploy mismatch) still speak the per-category
     protocol: categories first, then one request per feed. */
  const data = await getJson("/api/rapid-bus/categories");
  const results = await Promise.all(
    (data.categories || []).map(async (category) => {
      try {
        const payload = await getJson(`/api/rapid-bus/${category}/routes`);
        return { category, routes: payload.routes || [] };
      } catch (error) {
        // Kuantan currently 404s upstream; skip dead areas instead of failing.
        console.warn(`Skipping ${category}:`, error.message);
        return { category, routes: [] };
      }
    })
  );
  applyRouteIndex({ feeds: data.feeds, categories: results });
}

function scoreRoute(route, query) {
  const short = route.shortName.toLowerCase();
  if (short === query) return 0;
  if (short.startsWith(query)) return 1;
  if (short.includes(query)) return 2;
  if (route.longName.toLowerCase().startsWith(query)) return 3;
  if (route.haystack.includes(query)) return 4;
  return -1;
}

function searchRoutes() {
  const token = ++searchToken;
  const query = routeSearch.value.trim().toLowerCase();
  clearSearch.classList.toggle("hidden", !query);

  /* With a query on screen the results are the only thing that matters, so
     Nearby / Saved / Recent stand down and the list starts right under the
     search box instead of below three rows of chrome. */
  document.body.classList.toggle("searching", Boolean(query));
  sheetFollowSearch(Boolean(query));

  if (!indexReady) {
    renderRouteSkeletons();
    return;
  }
  if (token !== searchToken) {
    return;
  }

  const regional = routeIndex.filter((route) => inRegion(route.category));
  const pool = state.modeFilter === "all"
    ? regional
    : regional.filter((route) => routeMode(route) === state.modeFilter);

  let matches;
  if (!query) {
    matches = pool.slice(0, 40);
    routeCount.textContent = `${pool.length}`;
  } else {
    matches = pool
      .map((route) => ({ route, score: scoreRoute(route, query) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.route.shortName.localeCompare(b.route.shortName, undefined, { numeric: true }))
      .slice(0, 60)
      .map((entry) => entry.route);
    routeCount.textContent = `${matches.length}`;
  }

  renderRouteResults(matches, query);
  maybeOfferFlightSearch(query);
  maybeSearchStops(query, token);
  if (offline) {
    setStatus("Offline", "idle");
  } else if (state.activeRouteId) {
    setStatus(state.live ? "Live" : "Timetable", state.live ? "live" : "idle");
  } else {
    setStatus("Ready", "idle");
  }
}

/* A query shaped like a flight number ("SQ432", "AK 866") gets a find-flight
   row above the route results — any flight, anywhere, not just overhead. */
const FLIGHT_QUERY = /^[a-z]{2,3}\s?\d{1,4}[a-z]?$/i;

function maybeOfferFlightSearch(query) {
  if (!FLIGHT_QUERY.test(query.trim())) return;
  const callsign = query.trim().toUpperCase().replace(/\s+/g, "");

  const row = document.createElement("button");
  row.type = "button";
  row.className = "route-row flight-find";
  row.innerHTML = `
    <span class="badge" style="--badge:#1c2c44">\u2708</span>
    <span class="route-copy"><span class="route-name">Find flight ${escapeHtml(callsign)}</span>
    <small>Live position, route and ETA \u00b7 worldwide</small></span>`;
  row.addEventListener("click", async () => {
    row.querySelector("small").textContent = "Searching\u2026";
    try {
      const data = await getJson(`/api/flights/find?callsign=${encodeURIComponent(callsign)}`);
      const { route, aircraft } = data;
      const routeText = route?.from && route?.to
        ? `${route.flight || callsign}${route.airline ? " \u00b7 " + route.airline : ""} \u2014 ${route.from.iata} ${titleCase(route.from.city)} \u2192 ${route.to.iata} ${titleCase(route.to.city)}`
        : null;

      if (aircraft) {
        row.querySelector("small").textContent = routeText || "Airborne \u2014 route unpublished";
        setFlights(true);
        if (state.followVehicles) setFollow(false);
        flyToVisible([aircraft.lat, aircraft.lon], 8, { duration: 1.0 });
        // Once the flight layer has refreshed around the new centre, open its popup.
        window.setTimeout(async () => {
          await refreshFlights();
          const marker = flightState.markers.get(aircraft.hex);
          if (marker) {
            marker.setPopupContent("<div class='fl-pop'>Looking up flight\u2026</div>").openPopup();
            marker.setPopupContent(await flightPopupHtml(marker.plane));
          }
        }, 1200);
      } else if (routeText) {
        row.querySelector("small").textContent = `${routeText} \u2014 not currently airborne`;
      } else {
        row.querySelector("small").textContent = "No flight found under that number";
      }
    } catch {
      row.querySelector("small").textContent = "Flight lookup failed \u2014 try again";
    }
  });

  routeList.prepend(row);
}

/* The search box finds stops as well as routes. Matching stops appear as a
   section above the routes; tapping one opens its station board and flies
   the map there — the "search for a stop" path alongside tapping the map. */
async function maybeSearchStops(query, token) {
  const q = query.trim();
  document.getElementById("stopSearchBlock")?.remove();
  if (q.length < 2) return;
  let stops;
  try {
    const data = await getJson(`/api/stops/search?q=${encodeURIComponent(q)}`);
    stops = (data.stops || []).filter((st) => inRegion(String(st.key).split(":")[0])).slice(0, 6);
  } catch {
    return;
  }
  if (token !== searchToken || !stops.length) return;

  const block = document.createElement("div");
  block.id = "stopSearchBlock";
  block.className = "stop-results";
  block.innerHTML = `<div class="stop-results-cap">Stops</div>`;
  for (const st of stops) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "stop-result";
    row.innerHTML = `<span class="sr-pin"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg></span>
      <span class="sr-name">${escapeHtml(titleCase(stopDisplayName(st.name)))}</span>`;
    row.addEventListener("click", () => {
      flyToVisible([st.lat, st.lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
      openStopBoard({ key: st.key, stopId: st.stopId, name: st.name, lat: st.lat, lon: st.lon });
    });
    block.appendChild(row);
  }
  routeList.prepend(block);
}

function renderRouteResults(matches, query) {
  routeList.innerHTML = "";

  if (!matches.length) {
    routeList.innerHTML = `
      <div class="empty">
        <strong>No route matches &ldquo;${escapeHtml(query)}&rdquo;</strong>
        Try a number like 250 or T117, or a place such as Wangsa Maju.
      </div>
    `;
    return;
  }

  for (const route of matches) {
    const parts = routeTitleLines(route);
    const button = document.createElement("button");
    button.className = "route-row";
    button.type = "button";
    button.dataset.routeId = route.routeId;
    button.dataset.category = route.category;
    const advisory = state.alertsByRoute.get(`${route.category}:${route.routeId}`);
    button.innerHTML = `
      <span class="badge">${escapeHtml(badgeLabel(route.shortName))}</span>
      <span class="route-copy">
        <span class="route-origin clip">${advisory ? `<span class="warn-dot" title="Service advisory">\u26a0</span> ` : ""}${escapeHtml(parts.primary)}</span>
        ${parts.secondary ? `<span class="route-dest clip">${escapeHtml(parts.secondary)}</span>` : ""}
        <span class="route-meta clip">${escapeHtml(labels[route.category] || route.category)} · ${escapeHtml(route.routeId)}</span>
      </span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m6 3.5 4.3 4.5L6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    button.addEventListener("click", () => selectRoute(route.routeId, route.category).catch(showError));
    routeList.appendChild(button);
  }

  highlightRouteButton(state.activeRouteId);
}

/* GTFS long names arrive as "Origin ~ Destination"; the row shows them on two
   lines. Names without a separator (feeder routes carry none) keep one line. */
function splitRouteName(value) {
  const text = String(value || "").trim();
  // A spaced hyphen separates endpoints too; an unspaced one is part of a name
  // ("Sunway-Setia Jaya"), so it must not split.
  const parts = text.split(/\s*[~\u2013\u2014]\s*|\s+-\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { origin: parts[0], destination: parts.slice(1).join(" ~ ") };
  }
  return { origin: text, destination: "" };
}

/* "Seremban Line" is a name, not a code; badges only have room for the code. */
function badgeLabel(value) {
  return String(value || "").replace(/\s+Line$/i, "");
}

/* Rail names the line and its endpoints separately ("MRT Kajang Line" plus
   "Kwasa Damansara ~ Kajang"), so the line name leads and the endpoints sit
   underneath. Buses put the endpoints straight into the long name. */
function routeTitleLines(route) {
  const longName = String(route?.longName || "").trim();
  const description = String(route?.description || "").trim();

  if (description && description !== longName && /[~\u2013\u2014]/.test(description)) {
    const ends = splitRouteName(description);
    return {
      primary: longName || ends.origin,
      secondary: ends.destination ? `${ends.origin} \u2192 ${ends.destination}` : description
    };
  }

  const split = splitRouteName(longName || route?.routeId || "");
  return {
    primary: split.origin,
    secondary: split.destination ? `\u2192 ${split.destination}` : ""
  };
}

/* The saved row: routes the user starred. The "+" that explains how to save
   one lives in the mode row, so an empty Saved list costs no vertical space —
   on a half-open sheet every row here pushes the results off the bottom. */
function renderSuggestions() {
  suggestRow.innerHTML = "";
  let shown = 0;

  for (const item of loadSaved()) {
    const route = routeIndex.find((r) => r.routeId === item.routeId);
    if (!route) continue; // feed changed under us; skip rather than render a dead chip
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.dataset.routeId = route.routeId;
    chip.classList.toggle("on", route.routeId === state.activeRouteId);
    chip.innerHTML = `${escapeHtml(badgeLabel(route.shortName))} <small>${escapeHtml(shortLabels[route.category] || "")}</small>`;
    chip.addEventListener("click", () => selectRoute(route.routeId, route.category).catch(showError));
    suggestRow.appendChild(chip);
    shown += 1;
  }

  savedBlock.classList.toggle("hidden", shown === 0);
}

function renderRouteSkeletons(count = 6) {
  routeCount.textContent = "…";
  routeList.innerHTML = Array.from({ length: count })
    .map(
      () => `
        <div class="sk-row">
          <span class="sk sk-badge"></span>
          <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
        </div>
      `
    )
    .join("");
}

async function selectRoute(routeId, category, options = {}) {
  const token = ++selectToken;
  if (category) {
    state.category = category;
  }
  if (routeId !== state.activeRouteId && !options.keepDirection) {
    state.direction = 0;
  }
  if (routeId !== state.activeRouteId) {
    state.stopAlerts.clear();
  }
  state.activeRouteId = routeId;
  document.body.classList.add("has-route");
  allStops.layer?.clearLayers();
  allStops.loadedKey = "";
  updateStarButton();
  window.setTimeout(annotateCrowd, 800);
  revealSheet();
  window.setTimeout(() => map.invalidateSize(), 220);
  setStatus("Loading map", "loading");
  highlightRouteButton(routeId);
  stopLiveRefresh();

  // Show loading bones immediately — flashing "No route selected" at someone
  // who just selected a route reads as failure, especially on a cold feed.
  state.detailLoading = true;
  renderRouteDetails();

  let data;
  try {
    data = await getJson(mapUrl(routeId, state.direction));
  } finally {
    if (token === selectToken) {
      state.detailLoading = false;
    }
  }
  if (token !== selectToken) {
    return;
  }

  state.patterns = Array.isArray(data.patterns) ? data.patterns : [];
  state.direction = Number.isFinite(Number(data.direction)) ? Number(data.direction) : 0;
  state.mode = data.mode || "bus";
  state.live = data.live !== false;
  state.liveFeedStatus = data.liveFeedStatus || (state.live ? "live" : "not-configured");
  state.liveFeedMessage = data.liveFeedMessage || "";
  state.shapeSource = data.shapeSource || "feed";
  state.selectedStopId = null;
  applyMode();

  const features = data.geojson.features;
  const stops = features.filter((feature) => feature.properties.kind === "stop").length;
  const shapes = features.filter((feature) => feature.properties.kind === "route-shape").length;
  const vehicles = getVehicleFeatures(data);

  // Set before drawing: the line takes its colour from the active route.
  state.currentRoute = data.route;

  drawMap(data);
  state.currentVehicles = vehicles;
  state.currentStats = {
    stops,
    shapes,
    vehicles: vehicles.length,
    avgSpeed: averageSpeed(vehicles)
  };
  state.currentStops = getStopFeatures(data);

  const indexed = routeIndex.find(
    (item) => item.routeId === routeId && item.category === state.category
  );
  if (indexed) {
    state.currentRoute = { ...data.route, shortName: indexed.shortName, longName: indexed.longName };
  }

  saveRecent(state.currentRoute);
  renderRecents();
  syncUrl();
  renderRouteDetails();
  startLiveRefresh();
  setStatus(state.live ? "Live" : "Timetable", state.live ? "live" : "idle");
}

function drawMap(data) {
  map.invalidateSize();
  clearLayer("routeCasing");
  clearLayer("routeLayer");
  clearLayer("stopLayer");
  clearLayer("arrowLayer");
  clearVehicleMarkers();
  state.stopLayersById = new Map();

  const routeFeatures = [];
  const stopFeatures = [];

  for (const feature of data.geojson.features) {
    if (feature.properties.kind === "route-shape") routeFeatures.push(feature);
    if (feature.properties.kind === "stop") stopFeatures.push(feature);
  }

  const routeColor = routeLineColor();

  /* The line keeps one functional accent so it stays readable on the basemap;
     its casing is drawn from the page tone rather than a colour. */
  state.routeCasing = L.geoJSON(routeFeatures, {
    style: { color: cssVar("--casing"), opacity: 1, weight: 9 }
  }).addTo(map);

  state.routeLayer = L.geoJSON(routeFeatures, {
    style: { color: routeColor, opacity: 1, weight: 4 }
  }).addTo(map);

  state.shapePaths = buildShapePaths(routeFeatures);
  computeShapeOrientation(stopFeatures);
  document.documentElement.style.setProperty("--route-accent", routeColor);

  state.stopLayer = L.geoJSON(stopFeatures, {
    pointToLayer: (_feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 4.5,
        color: routeColor,
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2.5
      }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const g = feature.geometry?.coordinates;
      // Unified: a stop tap always opens the one bottom board card, whether
      // the stop came from the all-stops layer or a selected route.
      layer.on("click", () =>
        openStopBoard({
          key: `${state.category}:${props.stopId}`,
          stopId: String(props.stopId),
          name: props.name,
          lat: g ? g[1] : layer.getLatLng().lat,
          lon: g ? g[0] : layer.getLatLng().lng
        })
      );
      const sequence = Number(props.sequence);
      const tooltipText = Number.isFinite(sequence) && sequence > 0 ? `${sequence}. ${props.name}` : props.name;
      layer.bindTooltip(escapeHtml(tooltipText), {
        className: "app-tooltip",
        direction: "top",
        offset: [0, -8]
      });
      if (props.stopId !== undefined && props.stopId !== null) {
        state.stopLayersById.set(String(props.stopId), layer);
      }
    }
  }).addTo(map);

  const bounds = state.routeLayer.getBounds();
  if (bounds.isValid()) {
    map.invalidateSize();
    fitBoundsVisible(bounds.pad(0.08));
  }

  drawDirectionArrows();

  const vehicleFeatures = data.geojson.features.filter(
    (feature) => feature.properties.kind === "vehicle"
  );
  updateVehicleMarkers(vehicleFeatures, { fitToVehicles: false });
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* One functional accent: the route's own GTFS colour, or a neutral ink when the
   feed supplies none. Everything else on screen stays monochrome. */
function routeLineColor() {
  const hex = String(state.currentRoute?.color || "").replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }
  return theme === "dark" ? "#f5f5f5" : "#111111";
}

/* Re-tint the line and stop rings after a palette change. */
function drawRouteStyles() {
  const routeColor = routeLineColor();
  document.documentElement.style.setProperty("--route-accent", routeColor);
  state.routeCasing?.setStyle({ color: cssVar("--casing") });
  state.routeLayer?.setStyle({ color: routeColor, opacity: state.selectedVehicleId ? 0.1 : 1 });
  state.stopLayer?.eachLayer((layer) => layer.setStyle?.({ color: routeColor }));
  if (state.selectedVehicleId) {
    drawProgressSplit(state.selectedVehicleId);
  }
}

/* ------------------------------------------------------------------------ */
/* Route progress — shade the shape either side of a chosen bus             */
/* ------------------------------------------------------------------------ */

function clearProgressSplit() {
  clearLayer("routePassed");
  clearLayer("routeAheadCasing");
  clearLayer("routeAhead");
  state.routeLayer?.setStyle({ opacity: 1 });
}

/* Cuts the shape at the bus and draws the two halves differently: the track
   behind washes out, the road ahead is drawn in ink so it reads at a glance. */
function drawProgressSplit(vehicleId) {
  clearLayer("routePassed");
  clearLayer("routeAheadCasing");
  clearLayer("routeAhead");

  const record = state.vehicleMarkers.get(String(vehicleId));
  if (!record) {
    return;
  }

  const snapped = projectOnPaths(record.marker.getLatLng());
  if (!snapped) {
    state.routeLayer?.setStyle({ opacity: 1 });
    return;
  }

  const { path, segIndex, t } = snapped;
  const from = path.points[segIndex];
  const to = path.points[segIndex + 1];
  const cut = L.latLng(
    from.lat + (to.lat - from.lat) * t,
    from.lng + (to.lng - from.lng) * t
  );

  const head = path.points.slice(0, segIndex + 1).concat([cut]);
  const tail = [cut].concat(path.points.slice(segIndex + 1));

  // Which way along the shape is the bus facing? Same test the glide uses.
  const bearing = Number(record.feature?.properties?.bearing);
  const segBearing = bearingBetween(from, to);
  let forward = true;
  if (Number.isFinite(bearing) && bearing > 0) {
    forward = Math.abs(((segBearing - bearing + 540) % 360) - 180) < 90;
  }

  const passed = forward ? head : tail;
  const ahead = forward ? tail : head;

  state.routeLayer?.setStyle({ opacity: 0.1 });

  /* Travelled track is dashed and muted; the road ahead is solid amber over a
     casing. They differ by colour AND pattern, so neither reads as a road. */
  state.routePassed = L.polyline(passed, {
    color: cssVar("--progress-passed"),
    weight: 3.5,
    opacity: 1,
    dashArray: "2 8",
    lineCap: "round",
    interactive: false
  }).addTo(map);

  state.routeAheadCasing = L.polyline(ahead, {
    color: cssVar("--casing"),
    weight: 10,
    opacity: 0.9,
    lineCap: "round",
    lineJoin: "round",
    interactive: false
  }).addTo(map);

  state.routeAhead = L.polyline(ahead, {
    color: cssVar("--progress-ahead"),
    weight: 5.5,
    opacity: 1,
    lineCap: "round",
    lineJoin: "round",
    interactive: false
  }).addTo(map);

  state.routeAheadCasing.bringToFront();
  state.routeAhead.bringToFront();
  for (const entry of state.vehicleMarkers.values()) {
    entry.marker.setZIndexOffset(1000);
  }
}

/* ------------------------------------------------------------------------ */
/* Direction arrows along the route                                          */
/* ------------------------------------------------------------------------ */

/** Distance along one path of the point nearest latlng, or null. */
function distanceAlongPath(path, latlng) {
  let best = null;

  for (let i = 0; i < path.points.length - 1; i++) {
    const proj = projectOnSegment(latlng, path.points[i], path.points[i + 1]);
    if (!best || proj.dist < best.dist) {
      const segStart = path.cum[i];
      const segLength = path.cum[i + 1] - path.cum[i];
      best = { dist: proj.dist, along: segStart + proj.t * segLength };
    }
  }

  return best ? best.along : null;
}

/* GTFS stores shape points in travel order, but not every feed honours that,
   so orientation is measured against the pattern's own first and last stop
   rather than assumed. Arrows on a reversed shape are flipped 180°. */
function computeShapeOrientation(stopFeatures) {
  const first = stopFeatures[0];
  const last = stopFeatures[stopFeatures.length - 1];

  for (const path of state.shapePaths) {
    path.forward = true;
    if (!first || !last || first === last) {
      continue;
    }
    const a = distanceAlongPath(path, L.latLng(first.geometry.coordinates[1], first.geometry.coordinates[0]));
    const b = distanceAlongPath(path, L.latLng(last.geometry.coordinates[1], last.geometry.coordinates[0]));
    if (a !== null && b !== null && a > b) {
      path.forward = false;
    }
  }
}

function metersPerPixel() {
  const left = map.containerPointToLatLng([0, 0]);
  const right = map.containerPointToLatLng([100, 0]);
  return left.distanceTo(right) / 100;
}

/* Arrows are spaced by screen distance, not shape distance, so they stay
   evenly placed at every zoom, and only those in view are created. */
function drawDirectionArrows() {
  clearLayer("arrowLayer");
  if (!state.shapePaths.length) {
    return;
  }

  const spacing = Math.max(40, 110 * metersPerPixel());
  const bounds = map.getBounds().pad(0.15);
  const markers = [];

  for (const path of state.shapePaths) {
    const flip = path.forward === false;
    for (let along = spacing / 2; along < path.total; along += spacing) {
      const at = pointAlongPath(path, along);
      if (!bounds.contains(at.latlng)) {
        continue;
      }
      const heading = flip ? (at.heading + 180) % 360 : at.heading;
      markers.push(
        L.marker(at.latlng, {
          interactive: false,
          keyboard: false,
          zIndexOffset: 300,
          icon: L.divIcon({
            className: "",
            html: `<span class="route-arrow" style="rotate:${heading.toFixed(1)}deg">
                     <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 10 9 6 7.1 2 9Z"/></svg>
                   </span>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        })
      );
      if (markers.length >= 160) {
        break;
      }
    }
  }

  state.arrowLayer = L.layerGroup(markers).addTo(map);
}

function scheduleArrowRedraw() {
  window.clearTimeout(state.arrowRedraw);
  state.arrowRedraw = window.setTimeout(() => {
    if (state.activeRouteId) {
      drawDirectionArrows();
    }
  }, 140);
}

function selectVehicle(vehicleId) {
  const id = String(vehicleId);
  if (state.selectedVehicleId === id) {
    state.selectedVehicleId = null;
    clearProgressSplit();
    return;
  }
  state.selectedVehicleId = id;
  drawProgressSplit(id);
}

function clearLayer(key) {
  if (state[key]) {
    state[key].remove();
    state[key] = null;
  }
}

/* Adaptive polling: 30s while vehicles are actually running the route, 60s
   when none are live (early morning, off-hours, timetable-only feeds). Halves
   the network wake-ups on quiet routes for no visible cost, since there is
   nothing moving to update anyway. Self-scheduling so the cadence can change
   between ticks. */
function liveCadenceMs() {
  return state.live && (state.currentStats?.vehicles ?? 0) > 0 ? LIVE_REFRESH_MS : LIVE_REFRESH_IDLE_MS;
}

function scheduleLiveTick() {
  state.nextRefreshAt = Date.now() + liveCadenceMs();
  state.liveTimer = window.setTimeout(async () => {
    await refreshVehicles().catch(showError);
    if (state.activeRouteId) scheduleLiveTick();
  }, liveCadenceMs());
}

function startLiveRefresh() {
  refreshVehicles().catch(showError);
  scheduleLiveTick();
  state.countdownTimer = window.setInterval(renderLiveStatus, 1000);
  renderLiveStatus();
}

function stopLiveRefresh() {
  if (state.liveTimer) {
    window.clearTimeout(state.liveTimer);
    state.liveTimer = null;
  }
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
  state.nextRefreshAt = null;
  clearVehicleMarkers();
  setLiveText("Pick a route", false);
}

/* Per-stop alerts: tap a stop's bell, get a notification when a live vehicle
   is within a few minutes of it. Works while the app is open / on screen —
   the live feed already refreshes every 30s, so this just watches the ETA
   the server already computes for that stop. Keyed by route so alerts don't
   bleed across routes. */
async function toggleStopAlert(stopId) {
  const key = `${state.activeRouteId}:${stopId}`;
  if (state.stopAlerts.has(stopId)) {
    state.stopAlerts.delete(stopId);
    setStatus("Alert removed", "idle");
  } else {
    if (!(await ensureNotifyPermission())) {
      setStatus("Allow notifications first", "error");
      return;
    }
    state.stopAlerts.set(stopId, { routeKey: key, fired: {} });
    const stop = state.currentStops.find((f) => String(f.properties.stopId) === stopId);
    setStatus(`Reminder set — 10 & 5 min before ${stop ? titleCase(stop.properties.name) : "this stop"}`, "live");
    checkStopAlerts(); // in case a bus is already within 10 min
    updateStopPopups();
  }
  renderRouteDetails();
}

/* Minutes until the next vehicle reaches this stop: the live ETA if a bus is
   actually approaching, otherwise minutes to the next scheduled departure. */
function minutesToStop(props) {
  const eta = Number(props.etaMinutes);
  if (Number.isFinite(eta)) return eta;
  const times = Array.isArray(props.nextDepartures) ? props.nextDepartures : [];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const t of times) {
    const [h, m] = String(t).split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const diff = h * 60 + m - nowMin;
      if (diff >= 0) return diff;
    }
  }
  return Infinity;
}

/* Two-stage reminder: one at ~10 minutes out, another at ~5. Each stage fires
   once; after the 5-minute alert the reminder clears itself. */
function checkStopAlerts() {
  if (!state.stopAlerts.size) return;
  for (const feature of state.currentStops) {
    const stopId = String(feature.properties.stopId);
    const alert = state.stopAlerts.get(stopId);
    if (!alert) continue;
    alert.fired = alert.fired || {};
    const mins = minutesToStop(feature.properties);
    const name = titleCase(feature.properties.name);
    const noun = vehicleNoun();
    const Noun = noun.replace(/^./, (c) => c.toUpperCase());

    if (mins <= 5 && !alert.fired[5]) {
      alert.fired[5] = true;
      state.stopAlerts.delete(stopId); // 5-min is the last stage
      window.RapidBusNative?.notify(`${Noun} in ~5 minutes`, `Almost there — your ${noun} reaches ${name} in about 5 minutes. Head to the stop now.`);
      updateStopPopups();
      renderRouteDetails();
    } else if (mins <= 10 && !alert.fired[10]) {
      alert.fired[10] = true;
      window.RapidBusNative?.notify(`${Noun} in ~10 minutes`, `Heads up — your ${noun} reaches ${name} in about 10 minutes.`);
    }
  }
}

async function refreshVehicles() {
  if (!state.activeRouteId) {
    return;
  }

  const routeId = state.activeRouteId;
  const data = await getJson(mapUrl(routeId, state.direction));
  if (state.activeRouteId !== routeId) {
    return;
  }

  const features = getVehicleFeatures(data);
  state.liveFeedStatus = data.liveFeedStatus || (state.live ? "live" : "not-configured");
  state.liveFeedMessage = data.liveFeedMessage || "";
  if (Array.isArray(data.patterns)) {
    state.patterns = data.patterns;
  }
  state.currentStops = getStopFeatures(data);
  state.currentVehicles = features;
  state.currentStats.vehicles = features.length;
  state.currentStats.avgSpeed = averageSpeed(features);
  // nextRefreshAt is set by scheduleLiveTick, which knows the adaptive delay.
  updateVehicleMarkers(features, { fitToVehicles: state.followVehicles });
  updateStopPopups();
  checkStopAlerts();
  renderRouteDetails();
  renderLiveStatus();
}

/* Rail and bus share every screen, so the nouns follow the feed's mode. */
/* Keeps the legend and body class aligned with the active feed's mode. */
function applyMode() {
  document.body.classList.toggle("mode-rail", state.mode === "rail");
  document.body.classList.toggle("no-live-feed", !state.live);
  const noun = vehicleNoun().replace(/^./, (c) => c.toUpperCase());
  legendLive.textContent = `Live ${noun.toLowerCase()}`;
  legendStale.textContent = "No signal > 2 min";
}

function vehicleNoun(plural = false) {
  if (state.mode === "rail") {
    return plural ? "trains" : "train";
  }
  return plural ? "buses" : "bus";
}

function mapUrl(routeId, direction) {
  return `/api/rapid-bus/${state.category}/map?routeId=${encodeURIComponent(routeId)}&direction=${direction}`;
}

function getVehicleFeatures(data) {
  return data.geojson.features.filter((feature) => feature.properties.kind === "vehicle");
}

function getStopFeatures(data) {
  return data.geojson.features
    .filter((feature) => feature.properties.kind === "stop")
    .sort((a, b) => Number(a.properties.sequence || 0) - Number(b.properties.sequence || 0));
}

function averageSpeed(features) {
  const speeds = features
    .map((feature) => Number(feature.properties.speed || 0) * 3.6)
    .filter((value) => value > 0.5);
  if (!speeds.length) {
    return null;
  }
  return Math.round(speeds.reduce((sum, value) => sum + value, 0) / speeds.length);
}

function updateVehicleMarkers(features, options = {}) {
  const liveIds = new Set();
  const vehicleBounds = L.latLngBounds();

  for (const feature of features) {
    const id = String(feature.properties.id || feature.properties.tripId);
    const [lon, lat] = feature.geometry.coordinates;
    const reported = L.latLng(lat, lon);
    liveIds.add(id);
    vehicleBounds.extend(reported);

    // Snap the bus onto the route line and prepare a glide so it keeps
    // moving along the shape until the next realtime refresh.
    const speedMps = Math.max(0, Number(feature.properties.speed || 0));
    const bearing = Number(feature.properties.bearing || 0);
    const snapped = projectOnPaths(reported);
    const target = snapped ? snapped.point : reported;
    const glide = snapped && speedMps > 0.8 ? buildGlide(snapped, bearing, speedMps) : null;

    const existing = state.vehicleMarkers.get(id);
    if (existing) {
      existing.feature = feature;
      existing.marker.setZIndexOffset(1000);
      existing.marker.setIcon(createBusIcon(feature));
      existing.marker.setPopupContent(vehiclePopup(feature));
      existing.anim = {
        phase: "ease",
        from: existing.marker.getLatLng(),
        to: target,
        easeStart: performance.now(),
        glide
      };
      continue;
    }

    const marker = L.marker(target, {
      icon: createBusIcon(feature),
      zIndexOffset: 1000
    })
      .bindPopup(vehiclePopup(feature), VEHICLE_POPUP_OPTS)
      .addTo(map);

    marker.on("click", () => selectVehicle(id));

    state.vehicleMarkers.set(id, {
      marker,
      feature,
      anim: glide ? { phase: "glide", glideStart: performance.now(), glide } : null
    });
  }

  for (const [id, record] of state.vehicleMarkers) {
    if (!liveIds.has(id)) {
      record.marker.remove();
      state.vehicleMarkers.delete(id);
      if (state.selectedVehicleId === id) {
        state.selectedVehicleId = null;
        clearProgressSplit();
      }
    }
  }

  ensureMarkerTicker();

  // Redraw the split against the bus's new position.
  if (state.selectedVehicleId) {
    drawProgressSplit(state.selectedVehicleId);
  }

  if (options.fitToVehicles && vehicleBounds.isValid()) {
    const routeBounds = state.routeLayer?.getBounds();
    const bounds = routeBounds?.isValid() ? routeBounds.extend(vehicleBounds) : vehicleBounds;
    fitBoundsVisible(bounds.pad(0.08), {
      animate: true,
      duration: 0.6
    });
  }
}

function createBusIcon(feature) {
  const label = shortBusLabel(feature.properties.label || feature.properties.id || "BUS");
  const timestamp = feature.properties.timestamp ? new Date(feature.properties.timestamp).getTime() : 0;
  const stale = timestamp > 0 && Date.now() - timestamp > 120000;

  return L.divIcon({
    className: "",
    html: `
      <div class="bus-marker${stale ? " stale" : ""}">
        <span class="bus-puck">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 4h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-1.4 2.25v1.6a1.3 1.3 0 0 1-2.6 0v-1.1H7.5v1.1a1.3 1.3 0 0 1-2.6 0v-1.6A2.5 2.5 0 0 1 3.5 15.5v-9A2.5 2.5 0 0 1 6 4Z" fill="#090909"/>
            <rect x="5.6" y="6.4" width="12.8" height="4.9" rx="1" fill="#ffffff"/>
            <circle cx="7.9" cy="14.4" r="1.15" fill="#ffffff"/>
            <circle cx="16.1" cy="14.4" r="1.15" fill="#ffffff"/>
          </svg>
        </span>
        <span class="bus-tag">${escapeHtml(label)}</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

/* Vehicle ids arrive as "RAPID423" — strip the operator prefix so the marker
   reads "423" instead of a mangled tail slice like "D423". */
function shortBusLabel(value) {
  const text = String(value).trim();
  const stripped = text.replace(/^(RAPID|RKL|RPP|RKN)[\s_-]*/i, "");
  const candidate = stripped || text;
  return candidate.length <= 6 ? candidate : candidate.slice(-6);
}

function vehiclePopup(feature) {
  const speedKmh = Number(feature.properties.speed || 0) * 3.6;
  const updated = feature.properties.timestamp
    ? `${formatTimeMY(feature.properties.timestamp)} MYT`
    : "unknown";
  const bearing = feature.properties.bearing;

  return `
    <div class="popup-title">
      <strong>${escapeHtml(vehicleNoun().replace(/^./, (c) => c.toUpperCase()))} ${escapeHtml(shortBusLabel(feature.properties.label || feature.properties.id || "—"))}</strong>
    </div>
    <div class="popup-rows">
      <span class="strong">${Math.round(speedKmh)} km/h${bearing ? ` · heading ${Math.round(Number(bearing))}°` : ""}</span>
      <span>Updated ${escapeHtml(updated)}</span>
    </div>
  `;
}

function stopPopup(feature) {
  const props = feature.properties;
  const hasEta = Number.isFinite(Number(props.etaMinutes));
  const upcoming = Array.isArray(props.nextDepartures) ? props.nextDepartures : [];

  return `
    <div class="popup-title"><strong>${escapeHtml(props.name)}</strong></div>
    <div class="popup-rows">
      <span class="strong">${hasEta ? escapeHtml(formatEtaShort(props)) : "No live bus approaching"}</span>
      ${upcoming.length ? `<span>Timetable ${escapeHtml(upcoming.map(formatClock).join(" · "))} MYT</span>` : ""}
      ${props.accessible === true ? `<span>Step-free access</span>` : ""}
    </div>
    <button type="button" class="popup-remind${state.stopAlerts.has(String(props.stopId)) ? " on" : ""}" data-alert-stop="${escapeHtml(String(props.stopId))}">
      ${state.stopAlerts.has(String(props.stopId)) ? "\u2713 Reminder set" : "\ud83d\udd14 Remind me (10 & 5 min before)"}
    </button>
  `;
}

function updateStopPopups() {
  const stopById = new Map(
    state.currentStops.map((feature) => [String(feature.properties.stopId), feature])
  );

  state.stopLayer?.eachLayer((layer) => {
    const feature = layer.feature;
    if (!feature?.properties?.stopId) {
      return;
    }
    const updated = stopById.get(String(feature.properties.stopId));
    if (updated) {
      feature.properties = updated.properties;
    }
  });
}

/* ------------------------------------------------------------------------ */
/* Bus movement engine — snap to route shape, glide between refreshes        */
/* ------------------------------------------------------------------------ */

function buildShapePaths(routeFeatures) {
  const lines = [];
  for (const feature of routeFeatures) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "LineString") lines.push(geometry.coordinates);
    if (geometry.type === "MultiLineString") lines.push(...geometry.coordinates);
  }

  return lines
    .filter((coords) => Array.isArray(coords) && coords.length > 1)
    .map((coords) => {
      const points = coords.map(([lon, lat]) => L.latLng(lat, lon));
      const cum = [0];
      for (let i = 1; i < points.length; i++) {
        cum.push(cum[i - 1] + points[i - 1].distanceTo(points[i]));
      }
      return { points, cum, total: cum[cum.length - 1] };
    })
    .filter((path) => path.total > 0);
}

function projectOnSegment(p, a, b) {
  const metersPerDegLat = 111320;
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lng - a.lng) * metersPerDegLat * cosLat;
  const by = (b.lat - a.lat) * metersPerDegLat;
  const px = (p.lng - a.lng) * metersPerDegLat * cosLat;
  const py = (p.lat - a.lat) * metersPerDegLat;
  const len2 = bx * bx + by * by;
  let t = len2 ? (px * bx + py * by) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - bx * t;
  const dy = py - by * t;
  return {
    t,
    dist: Math.hypot(dx, dy),
    point: L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t)
  };
}

function projectOnPaths(latlng) {
  let best = null;

  for (const path of state.shapePaths) {
    for (let i = 0; i < path.points.length - 1; i++) {
      const proj = projectOnSegment(latlng, path.points[i], path.points[i + 1]);
      if (!best || proj.dist < best.dist) {
        best = { path, segIndex: i, t: proj.t, dist: proj.dist, point: proj.point };
      }
    }
  }

  return best && best.dist <= 150 ? best : null;
}

function bearingBetween(a, b) {
  const cosLat = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (b.lng - a.lng) * cosLat;
  const dy = b.lat - a.lat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

function buildGlide(snapped, bearingDeg, speedMps) {
  const { path, segIndex, t } = snapped;
  const startDist = path.cum[segIndex] + t * (path.cum[segIndex + 1] - path.cum[segIndex]);
  const segBearing = bearingBetween(path.points[segIndex], path.points[segIndex + 1]);

  let dir = 1;
  if (Number.isFinite(bearingDeg) && bearingDeg > 0) {
    const diff = Math.abs(((segBearing - bearingDeg + 540) % 360) - 180);
    dir = diff < 90 ? 1 : -1;
  }

  return { path, startDist, dir, speed: speedMps };
}

function pointAlongPath(path, dist) {
  const d = Math.max(0, Math.min(path.total, dist));
  let i = 0;
  while (i < path.cum.length - 2 && path.cum[i + 1] < d) i++;
  const segLen = path.cum[i + 1] - path.cum[i] || 1;
  const t = (d - path.cum[i]) / segLen;
  const a = path.points[i];
  const b = path.points[i + 1];
  return {
    latlng: L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t),
    heading: bearingBetween(a, b)
  };
}

function tickMarkers(now) {
  let active = false;

  for (const record of state.vehicleMarkers.values()) {
    const anim = record.anim;
    if (!anim) continue;

    if (anim.phase === "ease") {
      active = true;
      const progress = Math.min((now - anim.easeStart) / MARKER_ANIMATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const lat = anim.from.lat + (anim.to.lat - anim.from.lat) * eased;
      const lng = anim.from.lng + (anim.to.lng - anim.from.lng) * eased;
      record.marker.setLatLng([lat, lng]);
      if (progress >= 1) {
        if (anim.glide) {
          anim.phase = "glide";
          anim.glideStart = now;
        } else {
          record.anim = null;
        }
      }
      continue;
    }

    const elapsedMs = now - anim.glideStart;
    if (elapsedMs > LIVE_REFRESH_MS + 5000) {
      record.anim = null;
      continue;
    }

    active = true;
    const glide = anim.glide;
    const advance = Math.min(glide.speed * (elapsedMs / 1000), 600);
    const position = pointAlongPath(glide.path, glide.startDist + advance * glide.dir);
    record.marker.setLatLng(position.latlng);

  }

  state.markerTicker = active ? window.requestAnimationFrame(tickMarkers) : null;
}

function ensureMarkerTicker() {
  if (!state.markerTicker) {
    state.markerTicker = window.requestAnimationFrame(tickMarkers);
  }
}

function clearVehicleMarkers() {
  state.selectedVehicleId = null;
  clearLayer("routePassed");
  clearLayer("routeAheadCasing");
  clearLayer("routeAhead");
  if (state.markerTicker) {
    window.cancelAnimationFrame(state.markerTicker);
    state.markerTicker = null;
  }
  for (const record of state.vehicleMarkers.values()) {
    record.marker.remove();
  }
  state.vehicleMarkers.clear();
}

/* ------------------------------------------------------------------------ */
/* Details panel                                                             */
/* ------------------------------------------------------------------------ */

/* Platform crowding on SG rail stop rows — LTA's only real-time train data.
   Patched into the DOM after each render rather than threaded through it. */
const CROWD_LABEL = { l: "low", m: "busy", h: "crowded" };

async function annotateCrowd() {
  if (state.category !== "sg-rail" || !state.activeRouteId) return;
  try {
    const data = await getJson(`/api/rapid-bus/sg-rail/crowd?line=${encodeURIComponent(state.activeRouteId)}`);
    const byCode = new Map((data.stations || []).map((st) => [st.code, st.level]));
    routeDetails.querySelectorAll(".stop-row").forEach((row) => {
      const code = String(row.dataset.stopId || "").split(":")[1];
      const level = byCode.get(code);
      row.querySelector(".crowd-dot")?.remove();
      if (!level || level === "l") return; // quiet platforms stay quiet
      const dot = document.createElement("span");
      dot.className = `crowd-dot ${level}`;
      dot.textContent = CROWD_LABEL[level];
      dot.title = `Platform crowd: ${CROWD_LABEL[level]}`;
      row.querySelector(".stop-name")?.after(dot);
    });
  } catch {
    /* crowding is garnish */
  }
}

function activeRouteAdvisory() {
  if (!state.currentRoute) return null;
  return state.alertsByRoute.get(`${state.category}:${state.currentRoute.routeId}`) ?? null;
}

function renderRouteDetails() {
  const route = state.currentRoute;

  if (!route) {
    if (state.detailLoading) {
      routeDetails.innerHTML = `
        <div class="detail-fixed">
          <div class="detail-head">
            <span class="sk sk-line" style="width: 46%; height: 20px"></span>
            <span class="sk sk-line short" style="margin-top: 8px"></span>
          </div>
        </div>
        <div class="detail-scroll">
          ${Array.from({ length: 7 })
            .map(
              () => `
                <div class="sk-row">
                  <span class="sk sk-badge"></span>
                  <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
                </div>`
            )
            .join("")}
        </div>
      `;
      return;
    }
    routeDetails.innerHTML = `
      <div class="placeholder">
        <span class="placeholder-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
            <circle cx="12" cy="10" r="2.6" stroke="currentColor" stroke-width="1.7"/>
          </svg>
        </span>
        <strong>No route selected</strong>
        <span>Pick a route to see live buses, stops and arrival estimates.</span>
      </div>
    `;
    return;
  }

  const parts = splitRouteName(route.longName || route.routeId);
  const previous = routeDetails.querySelector(".detail-scroll");
  const scrollPos = previous ? previous.scrollTop : 0;
  const speed = state.currentStats.avgSpeed;

  routeDetails.innerHTML = `
    <div class="detail-fixed">
      <div class="detail-head">
        <span class="badge large">${escapeHtml(badgeLabel(route.shortName || route.routeId))}</span>
        <div class="detail-title">
          ${escapeHtml(parts.origin)}
          ${parts.destination ? `<span>&rarr; ${escapeHtml(parts.destination)}</span>` : ""}
        </div>
        <div class="detail-sub">${escapeHtml(labels[state.category] || state.category)} · ${escapeHtml(route.routeId)}</div>
      </div>

      ${activeRouteAdvisory() ? `<div class="route-advisory">\u26a0 ${escapeHtml(activeRouteAdvisory())}</div>` : ""}

      <div class="stats">
        <div class="stat"><span class="stat-value">${state.currentStats.stops}</span><span class="stat-label">Stops</span></div>
        <div class="stat${state.live && !offline && state.currentStats.vehicles ? "" : " dim"}"><span class="stat-value">${state.live && !offline ? state.currentStats.vehicles : "&ndash;"}</span><span class="stat-label">${offline ? "Offline" : state.live ? `${vehicleNoun(true).replace(/^./, (c) => c.toUpperCase())} live` : "No live feed"}</span></div>
        <div class="stat"><span class="stat-value">${state.patterns.length || state.currentStats.shapes}</span><span class="stat-label">Patterns</span></div>
        <div class="stat${speed == null ? " dim" : ""}"><span class="stat-value">${speed == null ? "–" : speed}</span><span class="stat-label">Avg km/h</span></div>
      </div>

      ${renderDirection()}
    </div>

    <!-- Tabs and the list title are DIRECT children of .detail-body on purpose.
         Inside .detail-fixed their sticky positioning was inert: a sticky box
         cannot outlive its containing block, so both scrolled away with the
         wrapper instead of pinning to the top of the pane. Out here their
         containing block is the scroller itself, so they hold. -->
    <div class="tabs" role="tablist">
      <button type="button" class="tab${state.detailsTab === "arrivals" ? " active" : ""}" data-tab="arrivals">Arrivals</button>
      <button type="button" class="tab${state.detailsTab === "stops" ? " active" : ""}" data-tab="stops">Stops <span class="tab-count">${state.currentStats.stops}</span></button>
    </div>

    ${renderFeedNotices()}

    <div class="list-title">
      <h3 class="cap">${state.detailsTab === "stops" ? "Route stops" : "Next arrivals"}</h3>
      <small>${state.detailsTab === "stops" ? (state.live ? "live · else scheduled" : "scheduled (MYT)") : `auto-refresh ${LIVE_REFRESH_MS / 1000}s`}</small>
    </div>

    <div class="detail-scroll scroll">
      ${state.detailsTab === "arrivals" ? renderEtaList() : renderStopTimeline()}
    </div>
  `;

  const scroller = routeDetails.querySelector(".detail-scroll");
  if (scroller) {
    scroller.scrollTop = scrollPos;
  }
}

/* Says plainly what this feed cannot do, rather than showing an empty live
   panel that looks like a fault. */
function renderFeedNotices() {
  const notices = [];

  if (state.liveFeedMessage) {
    notices.push(state.liveFeedMessage);
  } else if (!state.live) {
    notices.push(
      `Prasarana publishes no live ${vehicleNoun()} positions for this network — times below are today\u2019s timetable.`
    );
  }
  if (state.shapeSource === "stops") {
    notices.push("This feed ships no track geometry; the line is traced between stations.");
  }

  if (!notices.length) {
    return "";
  }

  return notices
    .map(
      (text) => `
        <div class="notice pinned">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 8.2v.2M12 11v4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          ${escapeHtml(text)}
        </div>
      `
    )
    .join("");
}

/* Route 250 runs two patterns; the API serves one at a time so the timeline and
   its ETAs belong to the same direction. */
function renderDirection() {
  if (state.patterns.length < 2) {
    return "";
  }

  const current = state.patterns[state.direction] || state.patterns[0];
  const headsign = directionLabel(current);

  return `
    <button type="button" class="direction" data-action="swap-direction">
      <span class="direction-copy">
        <span class="cap">Direction</span>
        <strong class="clip">${escapeHtml(headsign)}</strong>
      </span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 4v16m0 0-3.2-3.4M7 20l3.2-3.4M17 20V4m0 0-3.2 3.4M17 4l3.2 3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;
}

/* Rail headsigns read "From Kwasa Damansara to Kajang"; as a label under a
   "Direction" heading the prose is redundant, so it becomes "A \u2192 B". Feeds
   with no headsign at all fall back to the pattern's own endpoints. */
function directionLabel(pattern) {
  const headsign = String(pattern?.headsign || "").trim();

  if (headsign) {
    const arrowed = headsign.replace(/^from\s+/i, "").replace(/\s+to\s+/i, " \u2192 ");
    return titleCase(arrowed);
  }
  if (pattern?.from && pattern?.to) {
    return `${titleCase(pattern.from)} \u2192 ${titleCase(pattern.to)}`;
  }
  return `Direction ${pattern?.directionId ?? state.direction}`;
}

/* Feed headsigns arrive shouted ("LEBUH AMPANG"), but transit names are full of
   acronyms that must not be title-cased into "Lrt" or "Mrt". */
const KEEP_UPPER = new Set([
  "LRT", "MRT", "KTM", "BRT", "KL", "KLCC", "HKL", "UTAR", "TAR", "USJ", "PJ",
  "UM", "UIA", "UPM", "UKM", "IWK", "PPUM", "SK", "SMK", "SJK", "SPG", "OPP",
  "DUKE", "MRR2", "KLIA", "TBS", "HUKM", "IJN", "PWTC", "M1", "M2"
]);

function titleCase(value) {
  return String(value || "")
    .split(/(\s+|\/|-)/)
    .map((token) => {
      if (/^(\s+|\/|-)$/.test(token)) {
        return token;
      }
      const bare = token.replace(/[()]/g, "");
      if (KEEP_UPPER.has(bare.toUpperCase())) {
        return token.toUpperCase();
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join("");
}

async function swapDirection() {
  if (state.patterns.length < 2 || !state.activeRouteId) {
    return;
  }
  state.direction = (state.direction + 1) % state.patterns.length;
  state.detailsTab = state.detailsTab;
  await selectRoute(state.activeRouteId, state.category, { keepDirection: true });
}

function renderEtaList() {
  const rows = state.currentStops
    .filter((feature) => Number.isFinite(Number(feature.properties.etaMinutes)))
    .sort((a, b) => Number(a.properties.etaMinutes) - Number(b.properties.etaMinutes))
    .slice(0, 10);

  if (!rows.length) {
    return renderScheduledFallback();
  }

  return `
    <div class="arrivals">
      ${rows
        .map((feature) => {
          const props = feature.properties;
          const arriving = Number(props.etaMinutes) <= 1;
          const bus = props.etaVehicleId ? shortBusLabel(props.etaVehicleId) : "—";
          return `
            <button type="button" class="arrival-row" data-stop-id="${escapeHtml(String(props.stopId))}">
              <span class="bus-chip">${escapeHtml(bus)}</span>
              <span class="arrival-copy">
                <span class="arrival-stop clip">${escapeHtml(props.name)}</span>
                <span class="arrival-meta clip">${escapeHtml(etaMetaLine(props))}</span>
              </span>
              <span class="arrival-eta${arriving ? " now" : ""}${props.etaMethod === "live-estimate" ? " live" : ""}">${escapeHtml(formatEtaShort(props))}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

/* No live buses on this pattern — fall back to today's timetable. */
function renderScheduledFallback() {
  const scheduled = nextScheduledStops();

  if (!scheduled.length) {
    return `
      <div class="empty">
        <strong>No live ${escapeHtml(vehicleNoun(true))} right now</strong>
        No timetable available for this direction.
      </div>
    `;
  }

  return `
    <div class="notice">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
        <path d="M12 7v5.5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      No ${escapeHtml(vehicleNoun(true))} reporting live — showing today&rsquo;s timetable (MYT).
    </div>
    <div class="arrivals">
      ${scheduled
        .map(
          (entry) => `
            <button type="button" class="arrival-row" data-stop-id="${escapeHtml(String(entry.feature.properties.stopId))}">
              <span class="bus-chip">${escapeHtml(formatClock(entry.scheduled))}</span>
              <span class="arrival-copy">
                <span class="arrival-stop clip">${escapeHtml(entry.feature.properties.name)}</span>
                <span class="arrival-meta clip">${escapeHtml(formatWait(entry.waitMinutes))}${entry.following.length ? ` · then ${escapeHtml(entry.following.map(formatClock).join(", "))}` : ""}</span>
              </span>
              <span class="arrival-eta">${escapeHtml(formatWaitShort(entry.waitMinutes))}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStopTimeline() {
  if (!state.currentStops.length) {
    return `
      <div class="empty">
        <strong>No stop data</strong>
        This direction has no stops in the static GTFS feed.
      </div>
    `;
  }

  const nearMap = busesNearStops();
  const nearest = nearestStopToUser();
  const total = state.currentStops.length;

  const rows = state.currentStops
    .map((feature, index) => {
      const props = feature.properties;
      const stopId = String(props.stopId);
      const hasEta = Number.isFinite(Number(props.etaMinutes));
      const buses = nearMap.get(stopId) || [];
      const isNearest = nearest && nearest.stopId === stopId;
      const isTerminus = index === 0 || index === total - 1;
      const isActive = state.selectedStopId === stopId;
      const edge = index === 0 ? " first" : index === total - 1 ? " last" : "";

      return `
        <button type="button" class="stop-row${edge}${isTerminus ? " terminus" : ""}${isActive ? " active" : ""}" data-stop-id="${escapeHtml(stopId)}">
          <span class="stop-node"></span>
          <span class="stop-name clip">${escapeHtml(props.name)}</span>
          ${
            buses.length
              ? `<span class="stop-flag" title="Bus ${escapeHtml(buses.join(", "))} near this stop">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-1.5 2.6v1.9a1.5 1.5 0 0 1-3 0V19h-9v1.5a1.5 1.5 0 0 1-3 0v-1.9A3 3 0 0 1 3 16V6a3 3 0 0 1 3-3Zm-.5 4v5h13V7h-13Z"/></svg>
                  ${escapeHtml(buses.length > 1 ? `\u00d7${buses.length}` : buses[0])}
                </span>`
              : ""
          }
          ${isNearest ? `<span class="stop-flag">You · ${escapeHtml(formatDistance(nearest.distance))}</span>` : ""}
          ${stopTimeCell(props)}
          <span class="stop-bell${state.stopAlerts.has(stopId) ? " on" : ""}" data-alert-stop="${escapeHtml(stopId)}" title="Remind me when a ${vehicleNoun()} is approaching this stop" role="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.2l-1.6 3a1 1 0 0 0 .9 1.5h13.4a1 1 0 0 0 .9-1.5l-1.6-3V9a6 6 0 0 0-6-6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 19.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          </span>
        </button>
      `;
    })
    .join("");

  return `<div class="timeline">${rows}</div>`;
}

/* The right-hand column of the timeline: a live countdown when a vehicle is
   actually approaching, otherwise the next scheduled departure, otherwise
   nothing is known. */
/* Waits, in minutes, for the departures after the first one — so you can see
   the one after this at a glance and decide whether to run for it. */
function followingWaits(props, limit = 2) {
  const upcoming = Array.isArray(props.nextDepartures) ? props.nextDepartures : [];
  if (upcoming.length < 2) {
    return [];
  }

  const now = nowMinutesMY();
  return upcoming
    .slice(1, 1 + limit)
    .map((time) => {
      const minutes = gtfsTimeToMinutes(time);
      if (minutes == null) {
        return null;
      }
      return (((minutes % 1440) - now) % 1440 + 1440) % 1440;
    })
    .filter((wait) => wait != null && wait < 24 * 60);
}

function stopTimeCell(props) {
  const minutes = Number(props.etaMinutes);
  const following = followingWaits(props);
  /* Only the next few hours are worth listing: on a sparse feed the raw list
     ran to "then 635, 755 min", which is tomorrow and reads as a fault. */
  const soon = following.filter((wait) => wait < 180).slice(0, 2);
  const then = soon.length
    ? `<span class="stop-then">then ${soon
        .map((wait) => (wait <= 0 ? "due" : formatWaitShort(wait)))
        .join(", ")}</span>`
    : "";

  if (Number.isFinite(minutes)) {
    // etaMethod is "live-estimate" only when a real vehicle drove the number.
    const isLive = props.etaMethod === "live-estimate";
    return `<span class="stop-times">
        <span class="stop-eta${minutes <= 1 ? " now" : ""}${isLive ? " live" : ""}"
              title="${isLive ? "Live — from a vehicle reporting now" : "Estimated"}">${escapeHtml(formatEtaShort(props))}</span>
        ${then}
      </span>`;
  }

  const upcoming = Array.isArray(props.nextDepartures) ? props.nextDepartures : [];
  const scheduled = upcoming[0] || props.scheduledDeparture;
  if (scheduled) {
    const wait = Number(props.nextDepartureInMinutes);
    const label = Number.isFinite(wait) && wait <= 90 ? formatWaitShort(wait) : formatClock(scheduled);
    return `<span class="stop-times">
        <span class="stop-eta sched" title="Scheduled ${escapeHtml(formatClock(scheduled))} MYT">${escapeHtml(label)}</span>
        ${then}
      </span>`;
  }

  return `<span class="stop-eta none">—</span>`;
}

/* Assign each live bus to its closest stop so the timeline can show it. */
function busesNearStops() {
  const result = new Map();

  for (const vehicle of state.currentVehicles) {
    const [vlon, vlat] = vehicle.geometry.coordinates;
    let bestStop = null;
    let bestDistance = Infinity;

    for (const stop of state.currentStops) {
      const [slon, slat] = stop.geometry.coordinates;
      const distance = haversineMeters(vlat, vlon, slat, slon);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStop = stop;
      }
    }

    if (bestStop && bestDistance <= 900) {
      const key = String(bestStop.properties.stopId);
      const label = shortBusLabel(vehicle.properties.label || vehicle.properties.id || "BUS");
      if (!result.has(key)) {
        result.set(key, []);
      }
      result.get(key).push(label);
    }
  }

  return result;
}

function nearestStopToUser() {
  if (!state.userLocation || !state.currentStops.length) {
    return null;
  }

  let bestId = null;
  let bestDistance = Infinity;

  for (const stop of state.currentStops) {
    const [slon, slat] = stop.geometry.coordinates;
    const distance = haversineMeters(state.userLocation.lat, state.userLocation.lon, slat, slon);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = String(stop.properties.stopId);
    }
  }

  if (bestId == null || bestDistance > 3000) {
    return null;
  }
  return { stopId: bestId, distance: Math.round(bestDistance) };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(meters) {
  if (meters < 950) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function focusStop(stopId) {
  state.selectedStopId = String(stopId);
  document.querySelectorAll(".stop-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.stopId === String(stopId));
  });

  const layer = state.stopLayersById.get(String(stopId));
  if (!layer) {
    return;
  }
  if (state.followVehicles) {
    setFollow(false);
  }
  const latlng = layer.getLatLng();
  flyToVisible(latlng, Math.max(map.getZoom(), 16), { duration: 0.6 });
  const props = layer.feature?.properties || {};
  openStopBoard({
    key: `${state.category}:${props.stopId ?? stopId}`,
    stopId: String(props.stopId ?? stopId),
    name: props.name || "Stop",
    lat: latlng.lat,
    lon: latlng.lng
  });
}

/* ------------------------------------------------------------------------ */
/* Recents & URL state                                                       */
/* ------------------------------------------------------------------------ */

function loadRecents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(route) {
  try {
    const list = loadRecents().filter(
      (item) => !(item.routeId === route.routeId && item.category === state.category)
    );
    list.unshift({
      routeId: route.routeId,
      shortName: route.shortName || route.routeId,
      color: route.color || null,
      category: state.category
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* localStorage unavailable — recents are optional */
  }
}

function renderRecents() {
  const recents = loadRecents()
    .filter((item) => item.category === state.category)
    .slice(0, 6);

  if (!recents.length) {
    recentBlock.classList.add("hidden");
    recentRow.innerHTML = "";
    return;
  }

  recentBlock.classList.remove("hidden");
  recentRow.innerHTML = "";

  for (const item of recents) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.classList.toggle("on", item.routeId === state.activeRouteId);
    chip.textContent = item.shortName;
    chip.addEventListener("click", () => selectRoute(item.routeId).catch(showError));
    recentRow.appendChild(chip);
  }
}

function syncUrl() {
  const params = new URLSearchParams();
  params.set("area", state.category);
  if (state.activeRouteId) {
    params.set("route", state.activeRouteId);
  }
  if (state.direction > 0) {
    params.set("direction", String(state.direction));
  }
  history.replaceState(null, "", `?${params.toString()}`);
}

/* ------------------------------------------------------------------------ */
/* Live status, follow & locate                                              */
/* ------------------------------------------------------------------------ */

function renderLiveStatus() {
  if (offline) {
    setLiveText(offlineLiveText(), false);
    return;
  }

  // A journey is on the map, so the bar describes the journey. While tracking,
  // updateJourneyProgress owns this text.
  const journey = state.journey.results[state.journey.selected];
  if (state.journey.tracking) {
    return;
  }
  if (!state.activeRouteId && journey) {
    setLiveText(
      `${journey.departure} → ${journey.arrival} · ${journey.totalMinutes} min`,
      false
    );
    return;
  }

  if (!state.activeRouteId || !state.nextRefreshAt) {
    setLiveText("Pick a route", false);
    return;
  }

  if (!state.live) {
    setLiveText("Timetable only · no live feed", false);
    return;
  }

  if (state.liveFeedStatus === "connected-empty" || state.liveFeedStatus === "unavailable") {
    setLiveText("Live API unavailable · showing schedule", false);
    return;
  }

  const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  const count = state.currentStats.vehicles;
  setLiveText(`${count} ${count === 1 ? vehicleNoun() : vehicleNoun(true)} live · update in ${seconds}s`, count > 0);
}

function setLiveText(text, active) {
  liveText.textContent = text;
  document.querySelector(".live-dot")?.classList.toggle("active", active);
}

function setFollow(value) {
  state.followVehicles = value;
  followButton.textContent = value ? "Following" : "Free pan";
  followButton.classList.toggle("on", value);
  followButton.title = value ? "Following live buses" : "Map is free to pan";
}

function removeUserLocation() {
  state.userMarker?.remove();
  state.accuracyCircle?.remove();
  state.userMarker = null;
  state.accuracyCircle = null;
  state.userLocation = null;
}

/* Nearby: nearest stops with their next departures. Schedule-based from the
   server; Singapore bus stops are then upgraded in place with LTA's live
   predictions, which also know how full the bus is. */
const SG_LOAD_LABEL = { SEA: "seats", SDA: "standing", LSD: "crowded" };

async function renderNearby(lat, lon) {
  const block = document.getElementById("nearbyBlock");
  const list = document.getElementById("nearbyList");
  if (!block || !list) return;

  try {
    const data = await getJson(`/api/stops/nearby?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);
    const stops = data.stops || [];
    block.classList.toggle("hidden", !stops.length);
    list.innerHTML = "";

    for (const stop of stops) {
      const wrap = document.createElement("div");

      const head = document.createElement("button");
      head.type = "button";
      head.className = "nearby-stop-head";
      head.setAttribute("aria-expanded", "false");
      head.innerHTML = `${escapeHtml(titleCase(stopDisplayName(stop.name)))} <span class="nearby-dist">${formatDistance(stop.meters)}</span>`;

      /* Tapping the stop used to only pan the map, which answered nothing: the
         chips below it are the next four departures, not the routes that call
         here. Now it also opens the stop's full board — every route and
         direction, soonest first — and each row selects that route so its line
         and its live buses land on the map. */
      const board = document.createElement("div");
      board.className = "stop-board hidden";
      wrap.appendChild(head);
      wrap.appendChild(board);

      head.addEventListener("click", () => {
        flyToVisible([stop.lat, stop.lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
        const opening = board.classList.contains("hidden");
        head.setAttribute("aria-expanded", String(opening));
        board.classList.toggle("hidden", !opening);
        if (opening && !board.dataset.loaded) {
          renderStopBoard(stop, board);
        }
      });

      const deps = document.createElement("div");
      deps.className = "nearby-deps";
      for (const dep of stop.departures.slice(0, 4)) {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.type = "button";
        chip.dataset.service = dep.route;
        chip.innerHTML = `${escapeHtml(badgeLabel(dep.route))} <small>${dep.minutes}m</small>`;
        chip.title = dep.headsign ? `towards ${titleCase(dep.headsign)}` : "";
        chip.addEventListener("click", () => selectRoute(dep.routeId, dep.feed).catch(showError));
        deps.appendChild(chip);
      }
      wrap.appendChild(deps);
      list.appendChild(wrap);

      // Singapore bus stops: swap the timetable guess for the live answer.
      if (stop.feed === "sg-bus") {
        upgradeSgDepartures(stop.stopId, deps);
      }
    }
  } catch {
    block.classList.add("hidden");
  }
}

/* One row per route AND direction: "towards Gombak" and "towards Putra
   Heights" are the same route but not the same thing to stand and wait for.
   A route with nothing left today still gets a row — "no more today" is an
   answer the commuter needs as much as "4 min". */
async function renderStopBoard(stop, container) {
  container.dataset.loaded = "1";
  container.innerHTML = '<div class="stop-board-note">Loading routes…</div>';

  try {
    const data = await getJson(`/api/stops/board?key=${encodeURIComponent(stop.key)}`);
    const routes = data.routes || [];
    if (!routes.length) {
      container.innerHTML = '<div class="stop-board-note">No routes call here today.</div>';
      return;
    }

    /* KL Sentral returns 16 rows, 8 of them finished for the day. Keeping every
       dead one is honest but buries the three you can actually catch, so a few
       stand as evidence that the route exists and the rest become a count. */
    const live = routes.filter((entry) => entry.times.length);
    const done = routes.filter((entry) => !entry.times.length);
    const shown = [...live, ...done.slice(0, 3)];
    const hidden = done.length - Math.min(done.length, 3);

    container.innerHTML = "";
    for (const entry of shown) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "stop-board-row";
      const when = entry.times.length
        ? entry.times.map((m) => (m === 0 ? "due" : `${m} min`)).join(" · ")
        : "no more today";
      row.innerHTML = `
        <span class="badge small">${escapeHtml(badgeLabel(entry.route))}</span>
        <span class="stop-board-copy">
          <span class="stop-board-to">&rarr; ${escapeHtml(titleCase(stopDisplayName(entry.towards || entry.route)))}</span>
          <span class="stop-board-when${entry.times.length ? "" : " dim"}">${escapeHtml(when)}</span>
        </span>`;
      row.addEventListener("click", () => selectRoute(entry.routeId, entry.feed).catch(showError));
      container.appendChild(row);
    }

    if (hidden > 0) {
      const note = document.createElement("div");
      note.className = "stop-board-note";
      note.textContent = `+${hidden} more finished for today`;
      container.appendChild(note);
    }
  } catch (error) {
    console.warn("stop board failed", error);
    container.innerHTML = '<div class="stop-board-note">Could not load routes for this stop.</div>';
    delete container.dataset.loaded; // let the next tap try again
  }
}

async function upgradeSgDepartures(stopCode, container) {
  try {
    const data = await getJson(`/api/rapid-bus/sg-bus/arrivals?stop=${stopCode}`);
    const byService = new Map((data.services || []).map((s) => [s.service, s]));
    container.querySelectorAll(".chip").forEach((chip) => {
      const live = byService.get(chip.dataset.service);
      const eta = live?.etas?.[0];
      if (!eta) return;
      const small = chip.querySelector("small");
      if (!small) return;
      small.textContent = `${eta.minutes}m${SG_LOAD_LABEL[eta.load] ? " \u00b7 " + SG_LOAD_LABEL[eta.load] : ""}`;
      small.classList.toggle("live", eta.monitored);
    });
  } catch {
    /* the schedule numbers stand */
  }
}

/* Flights — a nice-to-have layer, off by default. Positions from adsb.lol,
   route (from → to) resolved per callsign on tap, ETA estimated from the
   straight-line distance to the destination against ground speed. Community
   data with no SLA: when it fails, the layer just goes quiet. */
const flightsButton = document.getElementById("flightsButton");
const flightState = { on: false, timer: null, markers: new Map() };

/* An airliner seen from above — fuselage, swept wings, tailplane — drawn
   nose-up so rotating by the transmitted track points it where it is going. */
const PLANE_PATH =
  "M12 1.8c.6 0 1.1.9 1.1 2v5.1l8.6 5.1c.2.1.3.3.3.5v1.6c0 .3-.3.5-.6.4l-8.3-2.6v4.6l2.1 1.7c.1.1.2.3.2.4v1.3c0 .3-.3.5-.6.4L12 22.8l-2.8.5c-.3.1-.6-.1-.6-.4v-1.3c0-.1.1-.3.2-.4l2.1-1.7v-4.6l-8.3 2.6c-.3.1-.6-.1-.6-.4v-1.6c0-.2.1-.4.3-.5l8.6-5.1V3.8c0-1.1.5-2 1.1-2Z";

function planeIcon(track, selected) {
  return L.divIcon({
    className: "",
    html: `<div class="plane-marker${selected ? " sel" : ""}" style="transform: rotate(${track ?? 0}deg)">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="${PLANE_PATH}" fill="currentColor" stroke="rgba(20,16,0,0.75)" stroke-width="0.9" stroke-linejoin="round" />
      </svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

/* The FR24 signature: select a plane and its route draws — solid for the
   flown part, dashed on to the destination. */
function drawFlightPath(plane, route) {
  clearFlightPath();
  if (!route?.from || !route?.to) return;
  const flown = L.polyline(
    [[route.from.lat, route.from.lon], [plane.lat, plane.lon]],
    { color: "#f5c518", weight: 2.5, opacity: 0.85, interactive: false }
  ).addTo(map);
  const ahead = L.polyline(
    [[plane.lat, plane.lon], [route.to.lat, route.to.lon]],
    { color: "#f5c518", weight: 2.5, opacity: 0.85, dashArray: "6 8", interactive: false }
  ).addTo(map);
  flightState.path = [flown, ahead];
}

function clearFlightPath() {
  for (const line of flightState.path ?? []) line.remove();
  flightState.path = [];
  if (flightState.selected) {
    const previous = flightState.markers.get(flightState.selected);
    previous?.setIcon(planeIcon(previous.plane?.track, false));
    flightState.selected = null;
  }
}

async function flightPopupHtml(plane) {
  const rows = [];
  const title = plane.callsign || "Unknown flight";
  let sub = [plane.type, plane.alt ? `${Math.round(plane.alt).toLocaleString()} ft` : null, plane.gs ? `${Math.round(plane.gs * 1.852)} km/h` : null]
    .filter(Boolean)
    .join(" \u00b7 ");
  let routeLine = "";
  if (plane.callsign) {
    try {
      const data = await getJson(`/api/flights/route?callsign=${encodeURIComponent(plane.callsign)}`);
      const route = data.route;
      if (route?.from && route?.to) {
        const flight = route.flight || plane.callsign;
        routeLine = `<div class="fl-route"><b>${escapeHtml(route.from.iata)}</b> ${escapeHtml(titleCase(route.from.city))} \u2192 <b>${escapeHtml(route.to.iata)}</b> ${escapeHtml(titleCase(route.to.city))}</div>`;
        rows.push(`<div class="fl-airline">${escapeHtml(flight)}${route.airline ? " \u00b7 " + escapeHtml(route.airline) : ""}</div>`);
        if (plane.gs && plane.gs > 60) {
          const km = haversineMeters(plane.lat, plane.lon, route.to.lat, route.to.lon) / 1000;
          const minutes = Math.round((km / (plane.gs * 1.852)) * 60);
          rows.push(`<div class="fl-eta">~${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`} to ${escapeHtml(route.to.iata)} <small>estimated</small></div>`);
        }
      }
    } catch {
      /* route stays unknown */
    }
  }
  return `<div class="fl-pop"><div class="fl-title">${escapeHtml(title)}</div>${rows[0] ?? ""}${routeLine}${rows[1] ?? ""}<div class="fl-sub">${escapeHtml(sub)}</div></div>`;
}

/* The upstream point query tops out at 250 nm, so one call can never fill a
   zoomed-out map. Wide views are tiled instead: up to a 3×3 grid of query
   centres across the viewport, merged and de-duplicated. Continent views
   fill with traffic; a whole-world view is still sampled, not complete —
   no free feed offers a full global snapshot. */
function flightQueryPoints() {
  const bounds = map.getBounds();
  const center = map.getCenter();
  const diagNm = haversineMeters(center.lat, center.lng, bounds.getNorthEast().lat, bounds.getNorthEast().lng) / 1852;
  if (diagNm <= 250) {
    return [{ lat: center.lat, lon: center.lng, r: Math.max(40, Math.ceil(diagNm)) }];
  }

  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const CELL_DEG = 7; // ~420 nm across: one 250 nm query covers most of a cell
  const rows = Math.min(3, Math.max(1, Math.ceil((north - south) / CELL_DEG)));
  const cols = Math.min(3, Math.max(1, Math.ceil((east - west) / CELL_DEG)));

  const points = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      points.push({
        lat: south + ((i + 0.5) * (north - south)) / rows,
        lon: west + ((j + 0.5) * (east - west)) / cols,
        r: 250
      });
    }
  }
  return points;
}

let flightsRefreshing = false;

async function refreshFlights() {
  if (!flightState.on || flightsRefreshing) return;
  flightsRefreshing = true;
  try {
    const batches = await Promise.all(
      flightQueryPoints().map((point) =>
        getJson(`/api/flights?lat=${point.lat.toFixed(3)}&lon=${point.lon.toFixed(3)}&r=${point.r}`).catch(() => ({ aircraft: [] }))
      )
    );
    const merged = new Map();
    for (const batch of batches) {
      for (const plane of batch.aircraft || []) {
        if (plane.hex && !merged.has(plane.hex)) merged.set(plane.hex, plane);
      }
    }
    // A phone does not need a thousand DOM markers; prefer the fastest movers
    // (airliners), which are also the ones people recognise.
    const aircraft = [...merged.values()]
      .sort((a, b) => (b.gs ?? 0) - (a.gs ?? 0))
      .slice(0, 400);

    const seen = new Set();
    for (const plane of aircraft) {
      seen.add(plane.hex);
      const existing = flightState.markers.get(plane.hex);
      if (existing) {
        existing.setLatLng([plane.lat, plane.lon]);
        existing.setIcon(planeIcon(plane.track, flightState.selected === plane.hex));
        existing.plane = plane;
      } else {
        const marker = L.marker([plane.lat, plane.lon], { icon: planeIcon(plane.track), zIndexOffset: 1400 });
        marker.plane = plane;
        marker.bindPopup("", { className: "fl-popup", maxWidth: 260 });
        marker.on("click", async () => {
          clearFlightPath();
          flightState.selected = plane.hex;
          marker.setIcon(planeIcon(marker.plane?.track, true));
          marker.setPopupContent("<div class='fl-pop'>Looking up flight\u2026</div>").openPopup();
          marker.setPopupContent(await flightPopupHtml(marker.plane));
          if (marker.plane?.callsign) {
            try {
              const data = await getJson(`/api/flights/route?callsign=${encodeURIComponent(marker.plane.callsign)}`);
              if (flightState.selected === plane.hex) drawFlightPath(marker.plane, data.route);
            } catch {
              /* no path */
            }
          }
        });
        marker.on("popupclose", () => {
          if (flightState.selected === plane.hex) clearFlightPath();
        });
        marker.addTo(map);
        flightState.markers.set(plane.hex, marker);
      }
    }
    for (const [hex, marker] of flightState.markers) {
      if (!seen.has(hex)) {
        marker.remove();
        flightState.markers.delete(hex);
      }
    }
  } catch {
    /* quiet layer */
  } finally {
    flightsRefreshing = false;
  }
}

function setFlights(on) {
  flightState.on = on;
  flightsButton.classList.toggle("on", on);
  flightsButton.setAttribute("aria-pressed", String(on));
  window.clearInterval(flightState.timer);
  flightState.timer = null;
  if (on) {
    refreshFlights();
    flightState.timer = window.setInterval(refreshFlights, 15000);
  } else {
    clearFlightPath();
    for (const marker of flightState.markers.values()) marker.remove();
    flightState.markers.clear();
  }
}

/* First-run discovery: pulse until the layer has been tried once. */
const FLIGHTS_SEEN_KEY = "rapidbus.flightsSeen";
try {
  if (!localStorage.getItem(FLIGHTS_SEEN_KEY)) {
    flightsButton.classList.add("discover");
  }
} catch {
  /* no storage, no pulse */
}

/* ------------------------------------------------------------------------ */
/* All-network stops layer — every bus stop / station on the map. Loaded by  */
/* viewport (zoom >= 14) so it never tries to draw tens of thousands at once. */
/* Tap one for its live/scheduled board, green when a vehicle is inbound.     */
/* ------------------------------------------------------------------------ */
/* Auto: stops appear when zoomed into street level and no route is selected
   (a selected route shows its own stops instead, so they never double up). */
const allStops = { layer: null, debounce: null, loadedKey: "" };
const STOPS_MIN_ZOOM = 12;

/* Bus stops vs rail stations read as different SHAPES, like a real transit
   map: bus stops are small canvas dots (there are hundreds — canvas keeps
   them smooth); rail/MRT stations are a bolder rounded-square marker so they
   stand out (few of them, so a DOM divIcon is fine). */
const stopsCanvas = L.canvas({ padding: 0.3 });
function addStopDot(stop) {
  const m = stop.mode === "rail"
    ? L.marker([stop.lat, stop.lon], {
        icon: L.divIcon({ className: "", html: '<span class="net-rail"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        keyboard: false
      })
    : L.circleMarker([stop.lat, stop.lon], {
        renderer: stopsCanvas,
        radius: 4,
        color: "#5b6b7d",
        weight: 1.5,
        fillColor: "#ffffff",
        fillOpacity: 1
      });
  m.on("click", () => openStopBoard(stop));
  return m;
}

function stopsShouldShow() {
  return !state.activeRouteId &&
    !document.body.classList.contains("has-journey") &&
    map.getZoom() >= STOPS_MIN_ZOOM;
}

async function loadStopsInView() {
  if (!stopsShouldShow()) {
    allStops.layer?.clearLayers();
    allStops.loadedKey = "";
    // Nudge the user toward the zoom where stops appear, while browsing.
    if (!state.activeRouteId && !document.body.classList.contains("has-journey") &&
        map.getZoom() < STOPS_MIN_ZOOM && !offline) {
      setLiveText("Zoom in to see stops", false);
    }
    return;
  }
  const b = map.getBounds();
  const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(2)).join(",");
  if (key === allStops.loadedKey) return;
  allStops.loadedKey = key;
  try {
    const data = await getJson(`/api/stops/in-bounds?minLat=${b.getSouth().toFixed(4)}&minLon=${b.getWest().toFixed(4)}&maxLat=${b.getNorth().toFixed(4)}&maxLon=${b.getEast().toFixed(4)}`);
    if (!stopsShouldShow()) return; // a route may have opened during the fetch
    allStops.layer ??= L.layerGroup().addTo(map);
    allStops.layer.clearLayers();
    for (const stop of data.stops || []) allStops.layer.addLayer(addStopDot(stop));
  } catch {
    /* leave what's there */
  }
}

let stopCardEl = null;
function hideStopCard() {
  if (stopCardEl) { stopCardEl.classList.remove("show"); }
  document.body.classList.remove("stop-open");
}

async function openStopBoard(stop) {
  if (!stopCardEl) {
    stopCardEl = document.createElement("div");
    stopCardEl.className = "stop-card";
    document.body.appendChild(stopCardEl);
  }
  const code = String(stop.stopId).split(":").pop();
  stopCardEl.innerHTML = `<div class="sc-head">
      <span class="sc-code">${escapeHtml(code)}</span>
      <span class="sc-name">${escapeHtml(titleCase(stop.name))}</span>
      <button class="sc-x" type="button" aria-label="Close">\u00d7</button>
    </div><div class="sc-body">Loading\u2026</div>`;
  stopCardEl.querySelector(".sc-x").addEventListener("click", hideStopCard);
  stopCardEl.classList.add("show");
  document.body.classList.add("stop-open"); // panel steps aside while the card is up

  try {
    const data = await getJson(`/api/stops/board?key=${encodeURIComponent(stop.key)}`);
    // Live-first: an approaching vehicle is the thing you act on, so it leads;
    // then soonest scheduled; ours groups the whole board this way.
    const routes = (data.routes || []).slice().sort((a, b) =>
      Number(b.live) - Number(a.live) ||
      (a.times[0] ?? Infinity) - (b.times[0] ?? Infinity)
    );
    const liveCount = routes.filter((r) => r.live).length;
    const chips = routes.map((r) => {
      const t = r.times[0];
      const when = t === undefined ? "\u2014" : (t <= 0 ? "now" : t + " min");
      const col = r.routeColor ? `#${r.routeColor}` : (r.mode === "rail" ? "#2563eb" : "var(--invert-bg)");
      const fg = r.routeColor || r.mode === "rail" ? "#fff" : "var(--invert-ink)";
      return `<button class="sc-chip${r.live ? " live" : ""}" data-route="${escapeHtml(r.routeId)}" data-feed="${escapeHtml(r.feed)}">
        <span class="sc-rt" style="background:${col};color:${fg}">${escapeHtml(badgeLabel(r.route))}</span>
        <span class="sc-col"><span class="sc-tw">${escapeHtml(titleCase(r.towards || ""))}</span><span class="sc-when">${when}</span></span>
        ${r.live ? '<span class="sc-dot" title="Live"></span>' : ""}
      </button>`;
    }).join("");
    stopCardEl.querySelector(".sc-body").innerHTML = `
      <div class="sc-meta">${routes.length} route${routes.length === 1 ? "" : "s"}${liveCount ? ` · <span class="sc-livetag">LIVE</span> ${liveCount} approaching` : ""}</div>
      <div class="sc-grid">${chips || "<span class='sc-empty'>No departures right now</span>"}</div>
      <button type="button" class="sc-plan" data-plan>Plan a journey from here \u2192</button>`;
    stopCardEl.querySelectorAll(".sc-chip").forEach((c) =>
      c.addEventListener("click", () => {
        hideStopCard();
        selectRoute(c.dataset.route, c.dataset.feed).catch(showError);
      })
    );
    stopCardEl.querySelector("[data-plan]").addEventListener("click", () => {
      hideStopCard();
      state.journey.from = { lat: stop.lat, lon: stop.lon, name: stop.name };
      jpFrom.value = titleCase(stop.name);
      setView("journey");
      updatePlanButton();
      jpTo?.focus();
    });
  } catch {
    stopCardEl.querySelector(".sc-body").innerHTML = "<div class='sc-empty'>Couldn\u2019t load this stop</div>";
  }
}

map.on("moveend", () => {
  window.clearTimeout(allStops.debounce);
  allStops.debounce = window.setTimeout(loadStopsInView, 350);
});
map.on("zoomend", loadStopsInView);
// First paint + whenever a route is opened/closed the layer re-evaluates.
window.setTimeout(loadStopsInView, 1500);

flightsButton.addEventListener("click", () => {
  flightsButton.classList.remove("discover");
  try {
    localStorage.setItem(FLIGHTS_SEEN_KEY, "1");
  } catch {
    /* optional */
  }
  setFlights(!flightState.on);
});
let flightsMoveDebounce = null;
map.on("moveend", () => {
  if (!flightState.on) return;
  // A pan is many moveend events; refetch once the map settles, not per twitch.
  window.clearTimeout(flightsMoveDebounce);
  flightsMoveDebounce = window.setTimeout(refreshFlights, 700);
});

function toggleLocate() {
  if (state.userMarker) {
    removeUserLocation();
    locateButton.classList.remove("on");
    renderRouteDetails();
    return;
  }

  if (!navigator.geolocation) {
    setStatus("No geolocation", "error");
    return;
  }

  locateButton.classList.add("loading");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      locateButton.classList.remove("loading");
      locateButton.classList.add("on");

      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      state.userLocation = { lat, lon };

      state.userMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "",
          html: '<div class="user-dot"><span></span></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        }),
        zIndexOffset: 1200
      }).addTo(map);

      state.accuracyCircle = L.circle([lat, lon], {
        radius: position.coords.accuracy,
        color: "#3b82f6",
        weight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.12
      }).addTo(map);

      if (state.followVehicles) {
        setFollow(false);
      }
      flyToVisible([lat, lon], Math.max(map.getZoom(), 15), { duration: 0.7 });
      renderNearby(lat, lon);
      renderRouteDetails();
    },
    () => {
      locateButton.classList.remove("loading");
      setStatus("Location denied", "error");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ------------------------------------------------------------------------ */
/* Formatting & helpers                                                      */
/* ------------------------------------------------------------------------ */

function formatEta(properties) {
  if (!Number.isFinite(Number(properties.etaMinutes))) {
    return "ETA unavailable";
  }
  return `ETA ${formatEtaShort(properties)} · estimated`;
}

function formatEtaShort(properties) {
  const minutes = Number(properties.etaMinutes);
  if (minutes <= 1) {
    return "Arriving";
  }
  /* Sparse networks — MyBus Ipoh runs a handful of trips a day — legitimately
     produce waits of ten hours, and "635 min" is not something anyone can act
     on. formatWaitShort already says "10h 35m"; it just was not used here. */
  return formatWaitShort(minutes);
}

/* "Bus 423 · 2.5 km away · live" — uses etaDistanceMeters/etaMethod, which the
   API returns but the UI previously discarded. */
function etaMetaLine(properties) {
  const parts = [];
  const vehicle = properties.etaVehicleId;
  if (vehicle) {
    parts.push(`Bus ${shortBusLabel(vehicle)}`);
  }
  const distance = Number(properties.etaDistanceMeters);
  if (Number.isFinite(distance) && distance > 0) {
    parts.push(`${formatDistance(Math.round(distance))} away`);
  }
  parts.push(properties.etaMethod === "live-estimate" ? "live" : properties.etaMethod || "estimate");
  return parts.join(" · ");
}

/* GTFS static times are already Malaysia local wall-clock ("05:53:00", and
   past-midnight values like "25:10:00"). Realtime timestamps are UTC instants,
   so those must be converted into Asia/Kuala_Lumpur explicitly rather than
   rendered in whatever timezone the viewer's browser happens to be in. */
const MY_TZ = "Asia/Kuala_Lumpur";

function formatClock(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return text;
  }
  const hours = Number(match[1]) % 24;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function formatTimeMY(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return date.toLocaleTimeString("en-GB", {
    timeZone: MY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function gtfsTimeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function nowMinutesMY() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

/* Fallback for when the realtime feed has no buses on this route: surface the
   next scheduled departures from the static timetable instead of a dead end.
   The server resolves these against today's service calendar in Malaysia time,
   so nextDepartures[0] is the genuine next bus — not one arbitrary trip's time. */
function nextScheduledStops(limit = 6) {
  const now = nowMinutesMY();

  return state.currentStops
    .map((feature) => {
      const props = feature.properties;
      const upcoming = Array.isArray(props.nextDepartures) ? props.nextDepartures : [];
      const scheduled = upcoming[0] || props.scheduledDeparture || props.scheduledArrival;
      const minutes = gtfsTimeToMinutes(scheduled);
      if (minutes == null) {
        return null;
      }

      // Prefer the server's wait; fall back to a local 24-hour-ring calculation.
      let waitMinutes = Number(props.nextDepartureInMinutes);
      if (!Number.isFinite(waitMinutes)) {
        waitMinutes = (((minutes % 1440) - now) % 1440 + 1440) % 1440;
      }

      return { feature, scheduled, waitMinutes, following: upcoming.slice(1, 3) };
    })
    .filter(Boolean)
    .sort((a, b) => a.waitMinutes - b.waitMinutes)
    .slice(0, limit);
}

function formatWaitShort(minutes) {
  if (minutes <= 0) return "Due";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatWait(minutes) {
  if (minutes <= 0) return "due";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

function updateStarButton() {
  const starButton = document.getElementById("starRoute");
  if (!starButton) return;
  const on = Boolean(state.activeRouteId) && isSaved(state.activeRouteId);
  starButton.classList.toggle("on", on);
  starButton.setAttribute("aria-pressed", String(on));
  starButton.setAttribute("aria-label", on ? "Remove from saved routes" : "Save this route");
}

function highlightRouteButton(routeId) {
  document.querySelectorAll(".route-row").forEach((button) => {
    button.classList.toggle("active", button.dataset.routeId === routeId);
  });
  document.querySelectorAll("#suggestRow .chip").forEach((chip) => {
    chip.classList.toggle("on", chip.dataset.routeId === routeId);
  });
}

/* In the browser the API is same-origin. Inside the Android shell the page is
   served from the app bundle, so it needs an absolute base — set at build time
   via window.RAPIDBUS_API_BASE. */
const API_BASE = (window.RAPIDBUS_API_BASE || "").replace(/\/$/, "");

/* navigator.onLine lies — it reports true on a network with no route to the
   internet — so reachability is judged by whether requests actually succeed.

   API responses are cached HERE rather than in the service worker. The worker
   cannot fetch at all inside the Capacitor Android shell (its origin is the
   synthetic https://localhost served by Capacitor's asset loader), so caching
   from the page is the only approach that works in both the browser and the
   app. Cache.put from a page context works in both. */
const API_CACHE = "rapidbus-api-v1";
const STAMP_HEADER = "x-rapidbus-cached-at";

let lastCacheStamp = null;

async function cacheApiResponse(url, response) {
  if (!("caches" in window)) {
    return;
  }
  try {
    const cache = await caches.open(API_CACHE);
    const body = await response.blob();
    const headers = new Headers({
      "content-type": response.headers.get("content-type") ?? "application/json",
      [STAMP_HEADER]: new Date().toISOString()
    });
    await cache.put(url, new Response(body, { status: 200, headers }));
  } catch (error) {
    // Caching is best effort; a full quota must not break the request.
    console.warn("api cache write failed", error?.message);
  }
}

async function readApiCache(url) {
  if (!("caches" in window)) {
    return null;
  }
  try {
    const cache = await caches.open(API_CACHE);
    const hit = await cache.match(url);
    if (!hit) {
      return null;
    }
    return { data: await hit.json(), stamp: hit.headers.get(STAMP_HEADER) };
  } catch {
    return null;
  }
}

function apiUrl(path) {
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}

async function getJson(url) {
  const target = apiUrl(url);

  try {
    const response = await fetch(target, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    const data = await response.clone().json();
    void cacheApiResponse(target, response);
    lastCacheStamp = null;
    markOffline(false);
    return data;
  } catch (error) {
    // Fall back to whatever was stored last time, and say how old it is.
    const cached = await readApiCache(target);
    if (cached) {
      lastCacheStamp = cached.stamp;
      markOffline(true);
      return cached.data;
    }
    markOffline(true);
    throw error;
  }
}

function setStatus(text, tone = "idle") {
  statusText.textContent = text;
  statusText.dataset.tone = tone;
}


function showError(error) {
  console.error(error);
  setStatus("Error", "error");
  const message = error instanceof Error ? error.message : "Something went wrong";

  // Keep a loaded route on screen — only replace the panel when it is empty.
  if (state.currentRoute) {
    return;
  }
  routeDetails.innerHTML = `<div class="error-box">Couldn&rsquo;t load data. ${escapeHtml(message)}</div>`;

  // With no routes at all the list is the only place the user is looking.
  if (!indexReady) {
    routeList.innerHTML = `
      <div class="empty">
        <strong>No connection</strong>
        Couldn&rsquo;t reach the service. Retrying automatically.
        <button type="button" class="chip" data-action="retry-index" style="margin-top:10px">Retry now</button>
      </div>
    `;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

/* ------------------------------------------------------------------------ */
/* Events                                                                    */
/* ------------------------------------------------------------------------ */


routeSearch.addEventListener("input", () => {
  searchHint.classList.toggle("hidden", routeSearch.value.length > 0);
  window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(searchRoutes, 120);
});

routeSearch.addEventListener("focus", () => sheetFollowSearch(true));

routeSearch.addEventListener("blur", () => {
  if (!routeSearch.value.trim()) {
    sheetFollowSearch(false);
  }
});

routeSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    window.clearTimeout(searchDebounce);
    searchRoutes();
  }
  if (event.key === "Escape") {
    routeSearch.value = "";
    searchRoutes();
  }
});

savedAdd.addEventListener("click", () => routeSearch.focus());

document.getElementById("starRoute").addEventListener("click", () => {
  if (!state.activeRouteId) return;
  toggleSaved(state.activeRouteId, state.category);
});

document.querySelectorAll(".region-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.region !== btn.dataset.region) {
      applyRegion(btn.dataset.region, { fly: true });
    }
  });
});

document.querySelectorAll("#modeRow .chip[data-mode]").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.modeFilter = chip.dataset.mode;
    document.querySelectorAll("#modeRow .chip[data-mode]").forEach((c) => c.classList.toggle("on", c === chip));
    searchRoutes();
  });
});

routeList.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="retry-index"]')) {
    indexAttempt = 0;
    renderRouteSkeletons();
    ensureRouteIndex();
  }
});

clearSearch.addEventListener("click", () => {
  routeSearch.value = "";
  searchHint.classList.remove("hidden");
  routeSearch.focus();
  searchRoutes();
});

closeDetails.addEventListener("click", () => {
  // In journey mode the same ✕ closes the planned route: clear the timeline,
  // its map layers and any tracking, and return to the From/To inputs.
  if (document.body.classList.contains("has-journey")) {
    if (state.journey.tracking) stopJourneyTracking();
    clearJourneyReminders();
    clearJourneyLayers();
    state.journey.results = [];
    state.journey.selected = 0;
    document.body.classList.remove("has-journey");
    setPlannerCollapsed(false);
    setStatus("Ready", "idle");
    window.setTimeout(() => map.invalidateSize(), 220);
    return;
  }

  state.activeRouteId = null;
  state.currentRoute = null;
  state.currentStops = [];
  state.currentVehicles = [];
  stopLiveRefresh();
  clearLayer("routeCasing");
  clearLayer("routeLayer");
  clearLayer("stopLayer");
  clearLayer("arrowLayer");
  state.stopLayersById = new Map();
  state.shapePaths = [];
  state.patterns = [];
  state.direction = 0;
  state.selectedStopId = null;
  state.selectedVehicleId = null;
  document.body.classList.remove("has-route");
  window.setTimeout(() => map.invalidateSize(), 220);
  highlightRouteButton(null);
  setStatus("Ready", "idle");
  syncUrl();
  window.setTimeout(loadStopsInView, 300);
});

followButton.addEventListener("click", () => {
  setFollow(!state.followVehicles);
});

refreshButton.addEventListener("click", () => {
  if (!state.activeRouteId) {
    return;
  }
  refreshButton.classList.add("spin");
  refreshVehicles()
    .catch(showError)
    .finally(() => {
      window.setTimeout(() => refreshButton.classList.remove("spin"), 650);
    });
});

locateButton.addEventListener("click", toggleLocate);

themeToggle.addEventListener("click", () => {
  applyTheme(theme === "dark" ? "light" : "dark");
});

zoomIn.addEventListener("click", () => map.zoomIn());
zoomOut.addEventListener("click", () => map.zoomOut());

const LEGEND_KEY = "rapidbus.legendCollapsed";

function setLegendCollapsed(collapsed) {
  legend.classList.toggle("collapsed", collapsed);
  legendToggle.setAttribute("aria-expanded", String(!collapsed));
  legendToggle.setAttribute("aria-label", collapsed ? "Expand legend" : "Collapse legend");
  try {
    localStorage.setItem(LEGEND_KEY, collapsed ? "1" : "0");
  } catch {
    /* persistence is optional */
  }
}

legendToggle.addEventListener("click", () => {
  setLegendCollapsed(!legend.classList.contains("collapsed"));
});

try {
  if (localStorage.getItem(LEGEND_KEY) === "1") {
    setLegendCollapsed(true);
  }
} catch {
  /* persistence is optional */
}

/* The rail, status bar and legend are fixed overlays Leaflet knows nothing
   about, so a popup anchored beneath one opens hidden. Nudge the view by the
   smallest move that clears whichever overlay it collides with. */
map.on("popupopen", (event) => {
  const element = event.popup.getElement();
  if (!element) {
    return;
  }

  const box = element.getBoundingClientRect();
  const gap = 12;
  let shiftX = 0;
  let shiftY = 0;

  for (const selector of [".rail", ".status-bar", ".legend", ".map-controls"]) {
    const overlay = document.querySelector(selector);
    if (!overlay || overlay.offsetParent === null) {
      continue;
    }

    const rect = overlay.getBoundingClientRect();
    const overlapX = Math.min(box.right, rect.right) - Math.max(box.left, rect.left);
    const overlapY = Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top);
    if (overlapX <= 0 || overlapY <= 0) {
      continue;
    }

    // Candidate moves: clear sideways, or clear vertically. Take the cheaper.
    const pushRight = rect.right - box.left + gap;
    const pushLeft = box.right - rect.left + gap;
    const pushDown = rect.bottom - box.top + gap;
    const pushUp = box.bottom - rect.top + gap;

    const horizontal = pushRight <= pushLeft ? pushRight : -pushLeft;
    const vertical = pushDown <= pushUp ? pushDown : -pushUp;

    if (Math.abs(horizontal) <= Math.abs(vertical)) {
      if (Math.abs(horizontal) > Math.abs(shiftX)) shiftX = horizontal;
    } else if (Math.abs(vertical) > Math.abs(shiftY)) {
      shiftY = vertical;
    }
  }

  if (shiftX || shiftY) {
    map.panBy([-shiftX, -shiftY], { animate: true, duration: 0.25 });
  }
});

map.on("zoomend", scheduleArrowRedraw);
map.on("moveend", scheduleArrowRedraw);

map.on("dragstart", () => {
  if (state.followVehicles) {
    setFollow(false);
  }
});

document.addEventListener("click", (event) => {
  const remind = event.target.closest(".popup-remind[data-alert-stop]");
  if (remind) {
    event.stopPropagation();
    toggleStopAlert(remind.dataset.alertStop);
  }
});

routeDetails.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="track"]')) {
    toggleJourneyTracking();
    return;
  }

  if (event.target.closest('[data-action="share"]')) {
    shareJourney();
    return;
  }

  if (event.target.closest('[data-action="remind"]')) {
    toggleReminders();
    return;
  }

  const tab = event.target.closest(".tab");
  if (tab) {
    state.detailsTab = tab.dataset.tab;
    renderRouteDetails();
    return;
  }

  if (event.target.closest('[data-action="swap-direction"]')) {
    setStatus("Loading", "loading");
    swapDirection().catch(showError);
    return;
  }

  const bell = event.target.closest("[data-alert-stop]");
  if (bell) {
    event.stopPropagation();
    toggleStopAlert(bell.dataset.alertStop);
    return;
  }

  const stopRow = event.target.closest("[data-stop-id]");
  if (stopRow) {
    focusStop(stopRow.dataset.stopId);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "/") {
    return;
  }
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    return;
  }
  event.preventDefault();
  routeSearch.focus();
  routeSearch.select();
});



/* ------------------------------------------------------------------------ */
/* Journey planner                                                           */
/* ------------------------------------------------------------------------ */

const WALK_ICON = `<svg class="walk-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="13" cy="4.2" r="1.9" fill="currentColor"/>
  <path d="M12 8.2 9.6 13l2.6 1.4.6 5.4M12.2 14.4l3.4 1 1.4 4.4M9.6 13 7 11.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* Collapsed: the trip reads as one line and the timeline gets the room.
   Expanded: the fields are back, still holding what was typed. */
function setPlannerCollapsed(collapsed) {
  journeyView.classList.toggle("collapsed", collapsed);
  if (!collapsed) {
    return;
  }
  jpSummaryFrom.textContent = titleCase(state.journey.from?.name || "Origin");
  jpSummaryTo.textContent = titleCase(state.journey.to?.name || "Destination");
}

function setView(view) {
  const journey = view === "journey";
  if (!journey) {
    document.body.classList.remove("has-journey");
    setPlannerCollapsed(false);
    clearJourneyLayers();
    if (state.journey.tracking) {
      stopJourneyTracking();
    }
  }
  journeyView.classList.toggle("hidden", !journey);
  routesView.classList.toggle("hidden", journey);
  // The planner has its own From/To fields; the route search bar is dead
  // weight there and stole a full row of a phone sheet.
  document.body.classList.toggle("view-journey", journey);
  document.querySelectorAll(".view-tabs .tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  if (journey && !state.journey.from) {
    jpFrom.focus();
  }
}

/* Both fields search the same stop index; "From" can also be the device's own
   position, which is what the locate button sets. */
function renderStopResults(container, stops, onPick) {
  container.innerHTML = "";
  for (const stop of stops) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "jp-result";
    button.innerHTML = `${escapeHtml(titleCase(stop.name))}<small>${escapeHtml(labels[stop.feed] || stop.feed)}</small>`;
    button.addEventListener("click", () => onPick(stop));
    container.appendChild(button);
  }
}

async function searchStopsFor(query, container, onPick) {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    container.innerHTML = "";
    return;
  }
  try {
    const data = await getJson(`/api/stops/search?q=${encodeURIComponent(trimmed)}`);
    const stops = (data.stops || []).filter((stop) => inRegion(String(stop.key).split(":")[0]));
    renderStopResults(container, stops, onPick);
  } catch (error) {
    console.warn("stop search failed", error);
    container.innerHTML = "";
  }
}

function updatePlanButton() {
  jpPlan.disabled = !(state.journey.from && state.journey.to);
}

function useMyLocationForJourney() {
  if (!navigator.geolocation) {
    jpFrom.value = "Geolocation unavailable";
    return;
  }
  jpLocate.classList.add("loading");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      jpLocate.classList.remove("loading");
      jpLocate.classList.add("on");
      state.journey.from = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        name: "Your location"
      };
      jpFrom.value = "Your location";
      jpFromResults.innerHTML = "";
      updatePlanButton();
    },
    () => {
      jpLocate.classList.remove("loading");
      jpFrom.value = "";
      jpFrom.placeholder = "Location denied — search a place instead";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* A journey as a URL, so a trip can be handed to someone else. The link
   carries origin coordinates, destination stop key, names for the summary,
   and the departure time when one was chosen. */
function journeyShareUrl() {
  const { from, to } = state.journey;
  if (!from || !to) return null;
  const params = new URLSearchParams({
    jf: `${from.lat.toFixed(5)},${from.lon.toFixed(5)}`,
    jfn: from.name || "Origin",
    jt: to.key,
    jtn: to.name || "Destination"
  });
  const departAfter = departAfterMinutes();
  if (departAfter !== null) params.set("jd", String(departAfter));
  return `${location.origin}/?${params.toString()}`;
}

async function shareJourney() {
  const url = journeyShareUrl();
  if (!url) return;
  const { from, to } = state.journey;
  const title = `${titleCase(from.name)} \u2192 ${titleCase(to.name)} \u00b7 Public Transport Live`;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      /* cancelled — fall through to the clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus("Link copied", "live");
  } catch {
    setStatus("Copy failed", "error");
  }
}

/* Recent trips, cached locally so a daily commute is one tap even offline. */
const RECENT_JOURNEYS_KEY = "rapidbus.recentJourneys";

function loadRecentJourneys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_JOURNEYS_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushRecentJourney(from, to) {
  const list = loadRecentJourneys().filter(
    (item) => !(item.to.key === to.key && item.from.name === from.name)
  );
  list.unshift({ from, to });
  try {
    localStorage.setItem(RECENT_JOURNEYS_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* optional */
  }
  renderRecentJourneys();
}

function applyJourneyPick(item) {
  state.journey.from = item.from;
  state.journey.to = item.to;
  jpFrom.value = titleCase(item.from.name);
  jpTo.value = titleCase(item.to.name);
  jpFromResults.innerHTML = "";
  jpToResults.innerHTML = "";
  updatePlanButton();
  runJourneyPlan();
}

function renderRecentJourneys() {
  const block = document.getElementById("jpRecentBlock");
  const row = document.getElementById("jpRecentRow");
  if (!block || !row) return;
  const list = loadRecentJourneys();
  block.classList.toggle("hidden", !list.length);
  row.innerHTML = "";
  for (const item of list) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = `${titleCase(item.from.name)} \u2192 ${titleCase(item.to.name)}`;
    chip.addEventListener("click", () => applyJourneyPick(item));
    row.appendChild(chip);
  }
}

/* Departure time: "Now" is the default; picking a time plans for later today.
   The API takes departAfter as minutes after midnight (service day, MYT). */
const jpNow = document.getElementById("jpNow");
const jpTime = document.getElementById("jpTime");

jpNow.addEventListener("click", () => {
  jpTime.value = "";
  jpNow.classList.add("on");
});

jpTime.addEventListener("input", () => {
  jpNow.classList.toggle("on", !jpTime.value);
});

function departAfterMinutes() {
  if (jpNow.classList.contains("on") || !jpTime.value) {
    return null; // the server defaults to its own clock
  }
  const [h, m] = jpTime.value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

async function runJourneyPlan() {
  const { from, to } = state.journey;
  if (!from || !to) {
    return;
  }

  jpOutput.innerHTML = `<div class="empty">Planning…</div>`;
  const params = new URLSearchParams({
    fromLat: String(from.lat),
    fromLon: String(from.lon),
    fromName: from.name || "Origin",
    toStop: to.key
  });
  const departAfter = departAfterMinutes();
  if (departAfter !== null) {
    params.set("departAfter", String(departAfter));
  }

  try {
    const data = await getJson(`/api/journey?${params.toString()}`);
    state.journey.results = data.journeys || [];
    renderJourneyResults(data);
    if (state.journey.results.length) {
      selectJourney(0);
      setPlannerCollapsed(true);
      pushRecentJourney(from, to);
    }
  } catch (error) {
    jpOutput.innerHTML = `<div class="empty"><strong>Couldn&rsquo;t plan that trip</strong>${escapeHtml(error.message || "")}</div>`;
  }
}

function renderJourneyResults(data) {
  const journeys = state.journey.results;

  if (!journeys.length) {
    jpOutput.innerHTML = `
      <div class="empty">
        <strong>No route found</strong>
        Nothing connects these points on today&rsquo;s timetable. Try a nearby station.
      </div>
    `;
    return;
  }

  jpOutput.innerHTML = journeys
    .map((journey, index) => {
      // A compact chooser: the full itinerary lives in the timeline beside it.
      const lines = journey.legs
        .filter((leg) => leg.kind === "ride")
        .map(
          (leg) =>
            `<span class="badge inline" style="background:${legColor(leg)};color:#fff">${escapeHtml(badgeLabel(leg.routeName))}</span>`
        )
        .join('<span class="itin-arrow">&rarr;</span>');

      return `
        <button type="button" class="itin${index === state.journey.selected ? " active" : ""}" data-journey="${index}">
          <div class="itin-head">
            <span class="itin-time">${escapeHtml(journey.departure)} → ${escapeHtml(journey.arrival)}</span>
            <span class="itin-dur">${journey.totalMinutes} min</span>
          </div>
          <div class="itin-lines">${lines}</div>
          <div class="itin-meta">${journey.transfers} transfer${journey.transfers === 1 ? "" : "s"} · ${journey.walkMeters} m walking</div>
        </button>
      `;
    })
    .join("");

}

/** The stop the traveller must get off at — the end of the last ride. */
function alightStopOf(journey) {
  if (!journey) {
    return null;
  }
  const rides = journey.legs.filter((leg) => leg.kind === "ride");
  return rides.length ? rides[rides.length - 1].to : null;
}

function selectJourney(index) {
  state.journey.selected = index;
  document.querySelectorAll(".itin").forEach((element) => {
    element.classList.toggle("active", Number(element.dataset.journey) === index);
  });
  const journey = state.journey.results[index];
  drawJourney(journey);
  renderJourneySteps(journey);
  renderLiveStatus();
}

/* ------------------------------------------------------------------------ */
/* Step-by-step journey directions                                           */
/* ------------------------------------------------------------------------ */

/* Renders the itinerary the way a transit map does: one continuous line down
   the page, times in a left gutter, every station on it. Stops are shown, not
   folded away — mid-journey you want to count them down, and "3 stops on the
   way" does not tell you which. */


/* Platform and entrance information, where the feed actually carries it.

   Rail publishes none — rapid-rail-kl's stops.txt has no platform_code or
   parent_station, and no station name mentions a platform — so nothing is
   invented for LRT/MRT/KTM. What rail does give is the station CODE (KJ14,
   KG16), which is exactly what the signage shows, and the line plus direction,
   which is how you pick the platform in practice at a two-platform station.

   Bus interchanges do carry it, inside the stop name:
     "KL110 PASAR SENI (PLATFORM F1 - F2)" -> platform "F1 - F2"
     "MRT SEMANTAN PINTU B"                -> entrance "Pintu B" */
function stopPlatform(name) {
  const text = String(name || "");

  const platform = text.match(/\(\s*PLATFORM\s+([^)]+)\)/i);
  if (platform) {
    return { label: `Platform ${platform[1].trim().replace(/\s*-\s*/, "–")}`, kind: "platform" };
  }

  const pintu = text.match(/\bPINTU\s+([A-Z0-9]+)\b/i);
  if (pintu) {
    return { label: `Pintu ${pintu[1].toUpperCase()}`, kind: "entrance" };
  }

  return null;
}

/** The station name without the platform text that is shown separately. */
function stopDisplayName(name) {
  return String(name || "")
    .replace(/\(\s*PLATFORM\s+[^)]+\)/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* Rail station codes match the signage; bus stop ids are internal numbers and
   mean nothing to a passenger, so only the readable ones are shown. */
function stationCode(stopId) {
  const code = String(stopId || "").trim().toUpperCase();
  return /^[A-Z]{2,3}\d{1,3}$/.test(code) ? code : "";
}


/* Platform numbers are NOT published in any Prasarana or KTMB feed — no
   platform_code, no parent_station, nothing in the station names. So they are
   never guessed here.

   Two things fill the gap honestly:

   1. KL rail platforms are signed by DESTINATION, not by number ("Ke Putra
      Heights"), so the destination is shown as the platform indicator. That is
      what you actually read on the platform sign.
   2. Real numbers can be added below as they are confirmed on the ground, keyed
      by "feed:stopId:directionId". Anything listed here overrides the
      destination hint and is shown as a plain platform number.

   Example, once verified in person:
     "rapid-rail-kl:KJ14:0": "Platform 1",
     "rapid-rail-kl:KJ14:1": "Platform 2",
*/
const PLATFORM_OVERRIDES = window.RAPIDBUS_PLATFORMS || {};

function platformFor(leg, stopId) {
  const direction = leg.directionId ?? "";
  // Route-specific first: two lines can share a station and a direction.
  const known =
    PLATFORM_OVERRIDES[`${leg.feed}:${stopId}:${leg.routeId}:${direction}`] ||
    PLATFORM_OVERRIDES[`${leg.feed}:${stopId}:${direction}`];
  if (known) {
    return { label: /^\d+$/.test(known) ? `Platform ${known}` : known, exact: true };
  }

  // Fall back to the destination the platform is signed by.
  const towards = leg.headsign
    ? titleCase(String(leg.headsign).replace(/^from\s+.*?\s+to\s+/i, ""))
    : "";
  if (towards) {
    return { label: `Platform to ${towards}`, exact: false };
  }
  return null;
}

function legColor(leg) {
  return /^[0-9a-fA-F]{6}$/.test(String(leg.routeColor || "")) ? `#${leg.routeColor}` : cssVar("--ink");
}

const WALK_RAIL = "repeating-linear-gradient(to bottom, var(--ink-3) 0 3px, transparent 3px 7px)";

function buildTimelineRows(journey) {
  const rows = [];
  let pendingStation = null;
  let carry = null;

  journey.legs.forEach((leg, index) => {
    if (leg.kind === "ride") {
      const color = legColor(leg);
      const board = leg.path[0];
      const alight = leg.path[leg.path.length - 1];
      const towards = leg.headsign
        ? titleCase(String(leg.headsign).replace(/^from\s+.*?\s+to\s+/i, ""))
        : "";

      rows.push({
        type: "station",
        time: board.time,
        name: board.name,
        stopId: board.stopId,
        lat: board.lat,
        lon: board.lon,
        // Only rail is signed by platform; a bus bay comes from its stop name.
        platform: leg.mode === "rail" ? platformFor(leg, board.stopId) : null,
        top: carry,
        bottom: color
      });
      rows.push({
        type: "segment",
        color,
        badge: badgeLabel(leg.routeName),
        towards,
        meta: `${leg.stopCount} stop${leg.stopCount === 1 ? "" : "s"} · ${leg.minutes} min`,
        top: color,
        bottom: color
      });

      for (const stop of leg.path.slice(1, -1)) {
        rows.push({ type: "minor", time: stop.time, name: stop.name, stopId: stop.stopId, lat: stop.lat, lon: stop.lon, top: color, bottom: color });
      }

      const station = { type: "station", time: alight.time, name: alight.name, stopId: alight.stopId, lat: alight.lat, lon: alight.lon, top: color, bottom: null };
      rows.push(station);
      pendingStation = station;
      carry = null;
      return;
    }

    // Walking: either off the top from the origin, an interchange, or the last hop.
    if (pendingStation) {
      pendingStation.bottom = WALK_RAIL;
    } else {
      rows.push({ type: "station", time: null, name: leg.from.name, lat: leg.from.lat, lon: leg.from.lon, top: null, bottom: WALK_RAIL });
    }

    rows.push({
      type: "segment",
      walk: true,
      meta: `Walk ${leg.minutes} min · ${leg.meters} m`,
      top: WALK_RAIL,
      bottom: WALK_RAIL
    });

    pendingStation = null;
    carry = WALK_RAIL;

    if (index === journey.legs.length - 1) {
      rows.push({ type: "station", time: null, name: leg.to.name, lat: leg.to.lat, lon: leg.to.lon, top: WALK_RAIL, bottom: null, last: true });
      carry = null;
    }
  });

  if (rows.length) {
    rows[rows.length - 1].last = true;
  }
  rows.forEach((row, index) => {
    row.index = index;
  });
  return rows;
}

function renderTimelineRow(row) {
  const rail = `style="--top:${row.top || "transparent"};--bottom:${row.bottom || "transparent"}"`;

  if (row.type === "segment") {
    return `
      <li class="tl-row tl-seg">
        <span class="tl-time"></span>
        <span class="tl-rail" ${rail}></span>
        <span class="tl-body">
          ${
            row.walk
              ? `<span class="tl-walk">${WALK_ICON}${escapeHtml(row.meta)}</span>`
              : `<span class="tl-ride">
                   <span class="badge inline" style="background:${row.color};color:#fff">${escapeHtml(row.badge)}</span>
                   ${row.towards ? `<span class="tl-towards">towards ${escapeHtml(row.towards)}</span>` : ""}
                 </span>
                 <span class="tl-meta">${escapeHtml(row.meta)}</span>`
          }
        </span>
      </li>
    `;
  }

  const minor = row.type === "minor";
  const code = minor ? "" : stationCode(row.stopId);
  // A platform named in the stop itself is exact; a rail platform is inferred
  // from the direction it is signed by, and is marked as such.
  const named = minor ? null : stopPlatform(row.name);
  const platform = named ?? (minor ? null : row.platform);

  return `
    <li class="tl-row${minor ? " tl-minor" : " tl-station"}"
        data-idx="${row.index}"
        ${row.lat !== undefined ? `data-lat="${row.lat}" data-lon="${row.lon}"` : ""}>
      <span class="tl-time">${row.time ? escapeHtml(row.time) : ""}</span>
      <span class="tl-rail" ${rail}><span class="tl-node" style="--node:${row.top || row.bottom || "var(--ink)"}"></span></span>
      <span class="tl-body">
        <span class="tl-stop">${escapeHtml(titleCase(stopDisplayName(row.name)))}</span>
        <span class="tl-left" hidden></span>
        ${code || platform ? `<span class="tl-tags">
            ${code ? `<span class="tl-code">${escapeHtml(code)}</span>` : ""}
            ${platform ? `<span class="tl-platform${platform.exact === false ? " inferred" : ""}">${escapeHtml(platform.label)}</span>` : ""}
          </span>` : ""}
      </span>
    </li>
  `;
}

function renderJourneySteps(journey) {
  if (!journey) {
    document.body.classList.remove("has-journey");
    return;
  }

  document.body.classList.add("has-journey");
  revealSheet();
  const rows = buildTimelineRows(journey);
  const alightStop = alightStopOf(journey);
  const rides = journey.legs.filter((leg) => leg.kind === "ride").length;

  routeDetails.innerHTML = `
    <div class="detail-fixed">
      <div class="detail-head">
        <div class="detail-title">${escapeHtml(journey.departure)} &rarr; ${escapeHtml(journey.arrival)}</div>
        <div class="detail-sub">${journey.totalMinutes} min · ${rides} ride${rides === 1 ? "" : "s"} · ${journey.transfers} transfer${journey.transfers === 1 ? "" : "s"} · ${journey.walkMeters} m walking</div>
      </div>
    </div>
    <div class="detail-scroll scroll">
      <ol class="tl">${rows.map(renderTimelineRow).join("")}</ol>
    </div>
    <div class="jp-actions">
      <button type="button" class="jp-bell${state.journey.reminders ? " on" : ""}" data-action="remind"
              title="Remind me 10 and 5 minutes before departure" aria-pressed="${state.journey.reminders}">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0-6 6v3.2l-1.6 3a1 1 0 0 0 .9 1.5h13.4a1 1 0 0 0 .9-1.5l-1.6-3V9a6 6 0 0 0-6-6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M10 19.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
      </button>
      <button type="button" class="jp-go jp-start${state.journey.tracking ? " on" : ""}" data-action="track"
              ${alightStop ? `title="Alerts before ${escapeHtml(titleCase(alightStop.name))}"` : ""}>
        ${state.journey.tracking ? "Stop" : "Start"}
      </button>
      <button type="button" class="jp-go jp-share" data-action="share">Share</button>
    </div>
  `;
}



function clearJourneyLayers() {
  for (const layer of state.journey.layers) {
    layer.remove();
  }
  state.journey.layers = [];
  state.journey.mapStops = [];
  state.journey.progressLines = [];
  state.journey.marker?.remove();
  state.journey.marker = null;
}

/* Ride legs follow their own stop sequence in the line's colour; walking legs
   are dashed. */
function drawJourney(journey) {
  clearJourneyLayers();
  state.journey.mapStops = [];
  state.journey.progressLines = [];
  if (!journey) {
    return;
  }

  const bounds = L.latLngBounds();

  for (const leg of journey.legs) {
    if (leg.kind === "ride") {
      const points = (leg.path || []).map((stop) => L.latLng(stop.lat, stop.lon));
      if (points.length < 2) {
        continue;
      }
      const color = legColor(leg);

      const casing = L.polyline(points, {
        color: cssVar("--casing"),
        weight: 9,
        opacity: 0.9,
        interactive: false
      }).addTo(map);
      const line = L.polyline(points, { color, weight: 5, opacity: 1, interactive: false }).addTo(map);
      state.journey.layers.push(casing, line);
      points.forEach((point) => bounds.extend(point));

      /* Progress bookkeeping: the stops of this leg in ride order, and an
         initially-empty overlay that gets extended over the coloured line as
         the rider passes each stop — the Google Maps "behind you" grey. */
      const overlay = L.polyline([], {
        color: cssVar("--progress-passed"),
        weight: 5,
        opacity: 1,
        interactive: false
      }).addTo(map);
      state.journey.layers.push(overlay);
      state.journey.progressLines.push({ overlay, points });

      /* Every stop the ride passes, not just where you get on and off — the
         timeline names them, so the map should show where they are. Small
         dots in the leg's colour; tap one for its name and time. */
      (leg.path || []).forEach((stop, at) => {
        let dot = null;
        if (at > 0 && at < leg.path.length - 1) {
          dot = L.circleMarker([stop.lat, stop.lon], {
            radius: 4,
            color: cssVar("--casing"),
            weight: 2,
            fillColor: color,
            fillOpacity: 1
          }).bindTooltip(`${stop.name} \u00b7 ${stop.time}`, { direction: "top", offset: [0, -6] });
          dot.addTo(map);
          state.journey.layers.push(dot);
        }
        state.journey.mapStops.push({ lat: stop.lat, lon: stop.lon, dot, color });
      });

      for (const point of [points[0], points[points.length - 1]]) {
        state.journey.layers.push(
          L.marker(point, {
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<span class="jp-pin terminal"></span>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })
          }).addTo(map)
        );
      }
      continue;
    }

    const from = L.latLng(leg.from.lat, leg.from.lon);
    const to = L.latLng(leg.to.lat, leg.to.lon);
    state.journey.layers.push(
      L.polyline([from, to], {
        color: cssVar("--ink-3"),
        weight: 3,
        dashArray: "2 7",
        interactive: false
      }).addTo(map)
    );
    bounds.extend(from).extend(to);
  }

  if (bounds.isValid()) {
    if (state.followVehicles) {
      setFollow(false);
    }
    fitBoundsVisible(bounds.pad(0.15));
  }
}

/* ------------------------------------------------------------------------ */
/* Journey tracking — follow the trip and call the stop                      */
/* ------------------------------------------------------------------------ */

/* While tracking, the phone watches its own position and answers the two
   questions you actually have on board: which step am I on, and how far to the
   next one. The get-off alert falls out of the same watch, so there is one
   mechanism rather than two.

   Foreground only in a browser and in the Capacitor shell alike — see
   mobile/README.md. Nothing here pretends to work with the screen locked. */

const ALERT_RADIUS_M = 700;
const ARRIVED_RADIUS_M = 120;

function trackingButtonLabel() {
  return state.journey.tracking ? "Stop" : "Start";
}

/* The map's half of tracking: a blue you-dot that follows the fix, passed
   stops greyed out, and the grey overlay creeping along each ride line. */
function updateMapProgress(lat, lon) {
  const stops = state.journey.mapStops;
  if (!stops.length) {
    return;
  }

  if (!state.journey.marker) {
    state.journey.marker = L.marker([lat, lon], {
      interactive: false,
      zIndexOffset: 1300,
      icon: L.divIcon({
        className: "",
        html: '<div class="user-dot"><span></span></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      })
    }).addTo(map);
  } else {
    state.journey.marker.setLatLng([lat, lon]);
  }

  // Same nearest-stop logic the timeline uses, run over the ride sequence.
  let nearest = 0;
  let nearestDist = Infinity;
  stops.forEach((stop, index) => {
    const d = haversineMeters(lat, lon, stop.lat, stop.lon);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = index;
    }
  });
  const passedCount = nearestDist <= ARRIVED_RADIUS_M ? nearest + 1 : nearest;

  const passedColor = cssVar("--progress-passed");
  stops.forEach((stop, index) => {
    stop.dot?.setStyle({ fillColor: index < passedCount ? passedColor : stop.color });
  });

  // Extend each leg's grey overlay across the points already behind the rider.
  let offset = 0;
  for (const legLine of state.journey.progressLines) {
    const inLeg = Math.max(0, Math.min(passedCount - offset, legLine.points.length));
    legLine.overlay.setLatLngs(inLeg >= 2 ? legLine.points.slice(0, inLeg) : []);
    offset += legLine.points.length;
  }

  // Keep the rider on screen, Google Maps style, until they pan away.
  if (state.followVehicles) {
    map.panTo([lat, lon], { animate: true, duration: 0.5 });
  }
}

/* Journey reminders — strictly opt-in via the bell. Two before departure
   ("your bus is on the way") and one near the stop, from live movement. */
const REMINDER_IDS = [9101, 9102];

function clearJourneyReminders() {
  for (const timer of state.journey.reminderTimers ?? []) window.clearTimeout(timer);
  state.journey.reminderTimers = [];
  window.RapidBusNative?.cancelScheduled?.(REMINDER_IDS);
}

async function ensureNotifyPermission() {
  const native = window.RapidBusNative;
  if (native?.isNative) return true; // the bridge asks on first schedule
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

function firstRide(journey) {
  return journey?.legs.find((leg) => leg.kind === "ride") ?? null;
}

async function scheduleJourneyReminders(journey) {
  clearJourneyReminders();
  const ride = firstRide(journey);
  if (!ride) return false;
  if (!(await ensureNotifyPermission())) return false;

  const [h, m] = ride.departure.split(":").map(Number);
  const departure = new Date();
  departure.setHours(h, m, 0, 0);
  if (departure.getTime() < Date.now() - 60000) return false; // already left

  const mode = ride.mode === "rail" ? "train" : "bus";
  const plans = [
    [10, REMINDER_IDS[0], `Your ${mode} is on the way`, `${ride.routeName} leaves ${titleCase(ride.from.name)} at ${ride.departure} — 10 minutes`],
    [5, REMINDER_IDS[1], `5 minutes — time to go`, `${ride.routeName} leaves at ${ride.departure} from ${titleCase(ride.from.name)}`]
  ];

  const native = window.RapidBusNative;
  let scheduled = 0;
  for (const [minsBefore, id, title, body] of plans) {
    const at = new Date(departure.getTime() - minsBefore * 60000);
    if (at.getTime() <= Date.now()) continue;
    if (native?.isNative && native.notifyAt) {
      if (await native.notifyAt(id, title, body, at)) scheduled++;
    } else {
      state.journey.reminderTimers.push(
        window.setTimeout(() => window.RapidBusNative?.notify(title, body), at.getTime() - Date.now())
      );
      scheduled++;
    }
  }
  return scheduled > 0;
}

async function toggleReminders() {
  const journey = state.journey.results[state.journey.selected];
  if (!journey) return;
  if (state.journey.reminders) {
    state.journey.reminders = false;
    clearJourneyReminders();
    setStatus("Reminders off", "idle");
  } else {
    const ok = await scheduleJourneyReminders(journey);
    state.journey.reminders = ok;
    setStatus(ok ? "Will remind you before departure" : "Reminders unavailable", ok ? "live" : "error");
    // Granting notifications is also the moment to offer disruption push.
    if (ok) {
      try {
        localStorage.setItem("rapidbus.pushOptIn", "1");
      } catch {
        /* optional */
      }
      registerPushIfAllowed();
      subscribeWebPushIfAllowed();
    }
  }
  renderJourneySteps(journey);
}

function startJourneyTracking() {
  const journey = state.journey.results[state.journey.selected];
  if (!journey || !navigator.geolocation) {
    return;
  }

  state.journey.tracking = true;
  state.journey.alerted = false;
  state.journey.notified3min = false;
  state.journey.speedSamples = [];
  state.journey.lastFix = null;

  /* In the Android app the native watcher runs a foreground service, so
     tracking keeps working with the screen off. In a browser the standard
     watch is all there is — foreground only. */
  const native = window.RapidBusNative;
  if (native?.isNative && native.startTripWatch) {
    native
      .startTripWatch((lat, lon) => updateJourneyProgress(lat, lon))
      .then((id) => {
        if (!state.journey.tracking) {
          native.stopTripWatch(id);
          return;
        }
        state.journey.nativeWatchId = id;
      })
      .catch(() => stopJourneyTracking());
  } else {
    state.journey.watchId = navigator.geolocation.watchPosition(
      (position) => updateJourneyProgress(position.coords.latitude, position.coords.longitude),
      () => stopJourneyTracking(),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
    );
  }

  setFollow(true);
  document.body.classList.add("tracking");
  renderJourneySteps(journey);
}

function stopJourneyTracking() {
  if (state.journey.watchId !== null) {
    navigator.geolocation.clearWatch(state.journey.watchId);
    state.journey.watchId = null;
  }
  if (state.journey.nativeWatchId) {
    window.RapidBusNative?.stopTripWatch?.(state.journey.nativeWatchId);
    state.journey.nativeWatchId = null;
  }
  state.journey.tracking = false;
  state.journey.alertStop = null;
  state.journey.marker?.remove();
  state.journey.marker = null;
  // Map progress stays as it was — being behind you doesn't stop being true —
  // but the you-dot goes, since nothing is watching the position any more.
  document.body.classList.remove("tracking");
  routeDetails.querySelectorAll(".tl-row").forEach((row) => {
    row.classList.remove("done", "current");
    const left = row.querySelector(".tl-left");
    if (left) left.hidden = true;
  });
  renderLiveStatus();
}

function toggleJourneyTracking() {
  if (state.journey.tracking) {
    stopJourneyTracking();
    renderJourneySteps(state.journey.results[state.journey.selected]);
    return;
  }
  startJourneyTracking();
}

/* Marks everything behind you as done, the nearest thing ahead as current, and
   counts the metres down to it.

   Positions are compared within the list of rows that HAVE coordinates. The
   timeline also holds segment rows (the ride and walk descriptions) which have
   none, so stepping by raw row index skips past the next station and leaves
   nothing marked current. */
function updateJourneyProgress(lat, lon) {
  const rows = [...routeDetails.querySelectorAll(".tl-row[data-lat]")];
  if (!rows.length) {
    return;
  }

  const distances = rows.map((row) =>
    haversineMeters(lat, lon, Number(row.dataset.lat), Number(row.dataset.lon))
  );

  let nearest = 0;
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] < distances[nearest]) {
      nearest = i;
    }
  }

  // Standing at a stop means that stop is behind you and the next one is next.
  const reached = distances[nearest] <= ARRIVED_RADIUS_M;
  const current = reached ? nearest + 1 : nearest;
  const arrived = current >= rows.length;

  rows.forEach((row, index) => {
    row.classList.toggle("done", index < current);
    row.classList.toggle("current", index === current);
    const left = row.querySelector(".tl-left");
    if (!left) {
      return;
    }
    if (index === current) {
      left.textContent = `${formatDistance(Math.round(distances[index]))} left`;
      left.hidden = false;
    } else {
      left.hidden = true;
    }
  });

  const targetIndex = arrived ? rows.length - 1 : current;
  const name = rows[targetIndex].querySelector(".tl-stop")?.textContent ?? "";
  setLiveText(
    arrived
      ? `Arrived at ${name}`
      : `${formatDistance(Math.round(distances[targetIndex]))} to ${name}`,
    true
  );

  updateMapProgress(lat, lon);

  /* "Your stop is in ~3 minutes": speed from the last few fixes gives an
     honest short-horizon ETA — better than a fixed radius, which fires late
     on a highway and early in a jam. */
  const previous = state.journey.lastFix;
  state.journey.lastFix = { lat, lon, at: Date.now() };
  if (previous) {
    const dt = (Date.now() - previous.at) / 1000;
    if (dt > 2) {
      const speed = haversineMeters(previous.lat, previous.lon, lat, lon) / dt; // m/s
      state.journey.speedSamples.push(speed);
      if (state.journey.speedSamples.length > 5) state.journey.speedSamples.shift();
    }
  }
  const journeyNow = state.journey.results[state.journey.selected];
  const alight = alightStopOf(journeyNow);
  if (alight && !state.journey.notified3min && state.journey.speedSamples.length >= 3) {
    const avgSpeed = state.journey.speedSamples.reduce((a, b) => a + b, 0) / state.journey.speedSamples.length;
    if (avgSpeed > 2) { // actually moving, not standing at a platform
      const metersLeft = haversineMeters(lat, lon, alight.lat, alight.lon);
      const etaMin = metersLeft / avgSpeed / 60;
      if (etaMin <= 3) {
        state.journey.notified3min = true;
        window.RapidBusNative?.notify(
          `Your stop is in about 3 minutes`,
          `${titleCase(alight.name)} coming up — get ready.`
        );
        setStatus("Stop in ~3 min", "live");
      }
    }
  }

  // The alight stop is the end of the last ride; alert once when it is close.
  const journey = state.journey.results[state.journey.selected];
  const stop = alightStopOf(journey);
  if (stop && !state.journey.alerted) {
    const toAlight = haversineMeters(lat, lon, stop.lat, stop.lon);
    if (toAlight <= ALERT_RADIUS_M) {
      state.journey.alerted = true;
      const body = `${formatDistance(Math.round(toAlight))} away — get ready to alight.`;
      window.RapidBusNative?.notify(`Approaching ${titleCase(stop.name)}`, body);
      setStatus("Approaching stop", "live");
    }
  }
}


/* ------------------------------------------------------------------------ */
/* Bottom sheet — drag to resize, tap to cycle                              */
/* ------------------------------------------------------------------------ */

/* Three snap points as a fraction of viewport height, measured from the top:
   minimised leaves the identity row, half keeps the map usable, full is for
   reading a long list. Half is the default because hiding the map entirely
   defeats the point of a transit app. */
const SHEET_SNAPS = { min: 0.76, half: 0.48, full: 0.1 };

/* Every load starts at half. Remembering the last position sounded helpful but
   meant the app could open fully covering the map with no obvious reason why —
   the position is a transient gesture, not a preference. */
let sheetState = "half";

function applySheetState(next) {
  sheetState = next;
  document.body.classList.remove("sheet-min", "sheet-half", "sheet-full");
  document.body.classList.add(`sheet-${next}`);
  rail.style.removeProperty("top");
  sheetHandle.setAttribute("aria-expanded", String(next === "full"));
  sheetHandle.setAttribute(
    "aria-label",
    next === "full" ? "Minimise panel" : next === "min" ? "Expand panel" : "Resize panel"
  );

  // Leaflet needs to know its box changed, or the map renders at the old size.
  window.setTimeout(() => map.invalidateSize(), 260);
}

/* Searching on a phone needs the whole sheet. At half, brand + tabs + search
   + filter row consume it all and the results render into a sliver behind the
   footer — you type "ktm" and see nothing. Growing to full is only automatic
   while the search is actually in use; a manual drag takes the wheel back. */
let sheetAutoFull = false;

function sheetFollowSearch(active) {
  if (!sheetHandle || !rail || window.innerWidth > 1100) {
    return;
  }
  if (active) {
    if (sheetState !== "full") {
      sheetAutoFull = true;
      applySheetState("full");
    }
    return;
  }
  if (sheetAutoFull) {
    sheetAutoFull = false;
    if (sheetState === "full") {
      applySheetState("half");
    }
  }
}

function nearestSnap(fraction) {
  let best = "half";
  let bestGap = Infinity;
  for (const [name, value] of Object.entries(SHEET_SNAPS)) {
    const gap = Math.abs(value - fraction);
    if (gap < bestGap) {
      bestGap = gap;
      best = name;
    }
  }
  return best;
}

/* Only meaningful on a phone; the desktop rail is a fixed column. */
function initSheet() {
  if (!sheetHandle || !rail) {
    return;
  }

  // Clear any position saved by an earlier build so it cannot reopen expanded.
  try {
    localStorage.removeItem("rapidbus.sheet");
  } catch {
    /* ignore */
  }

  applySheetState("half");

  let dragging = false;
  let startY = 0;
  let startTop = 0;
  let moved = 0;

  const onDown = (event) => {
    dragging = true;
    moved = 0;
    startY = event.clientY;
    startTop = rail.getBoundingClientRect().top;
    document.body.classList.add("sheet-dragging");
    sheetHandle.setPointerCapture?.(event.pointerId);
  };

  const onMove = (event) => {
    if (!dragging) {
      return;
    }
    const delta = event.clientY - startY;
    moved = Math.max(moved, Math.abs(delta));
    const limitTop = window.innerHeight * SHEET_SNAPS.full;
    const limitBottom = window.innerHeight * SHEET_SNAPS.min;
    const top = Math.min(Math.max(startTop + delta, limitTop), limitBottom);
    rail.style.top = `${top}px`;
  };

  const onUp = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    sheetAutoFull = false; // user took over; stop steering the sheet for them
    document.body.classList.remove("sheet-dragging");

    // A tap (barely moved) cycles instead of snapping to where it already is.
    if (moved < 8) {
      const order = ["min", "half", "full"];
      const next = order[(order.indexOf(sheetState) + 1) % order.length];
      applySheetState(next);
      return;
    }

    applySheetState(nearestSnap(rail.getBoundingClientRect().top / window.innerHeight));
  };

  sheetHandle.addEventListener("pointerdown", onDown);
  sheetHandle.addEventListener("pointermove", onMove);
  sheetHandle.addEventListener("pointerup", onUp);
  sheetHandle.addEventListener("pointercancel", onUp);

  // Keyboard: the handle is a button, so make it behave like one.
  sheetHandle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      applySheetState(sheetState === "min" ? "half" : "full");
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      applySheetState(sheetState === "full" ? "half" : "min");
    }
  });
}

/* Opening a route or a journey is a request to see it, so lift a minimised
   sheet to half rather than leaving the content hidden. */
function revealSheet() {
  if (sheetState === "min") {
    applySheetState("half");
  }
}

/* ------------------------------------------------------------------------ */
/* Journey planner events                                                    */
/* ------------------------------------------------------------------------ */

document.querySelectorAll(".view-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

/* The From/To fields have exactly the squeeze the route search had: on a half
   sheet the summary, Recent trips, both fields, Leave and the Plan button use
   up the height, so the stop suggestions render below the fold and picking a
   place looks broken. Same answer — the sheet opens while a suggestion list is
   live, and Recent trips steps aside so the results sit under the field. */
function syncJourneySearchState() {
  const active = jpFromResults.childElementCount > 0 || jpToResults.childElementCount > 0;
  document.body.classList.toggle("jp-searching", active);
  sheetFollowSearch(active);
}

/* Blur fires before the tap on a result lands, so an open list is never a
   reason to collapse — only an empty one is. */
function releaseJourneySheet() {
  if (jpFromResults.childElementCount === 0 && jpToResults.childElementCount === 0) {
    document.body.classList.remove("jp-searching");
    sheetFollowSearch(false);
  }
}

let jpFromDebounce = null;
jpFrom.addEventListener("input", () => {
  state.journey.from = null;
  jpLocate.classList.remove("on");
  updatePlanButton();
  window.clearTimeout(jpFromDebounce);
  jpFromDebounce = window.setTimeout(async () => {
    await searchStopsFor(jpFrom.value, jpFromResults, (stop) => {
      state.journey.from = { lat: stop.lat, lon: stop.lon, name: stop.name };
      jpFrom.value = titleCase(stop.name);
      jpFromResults.innerHTML = "";
      updatePlanButton();
      syncJourneySearchState();
    });
    syncJourneySearchState();
  }, 200);
});

let jpToDebounce = null;
jpTo.addEventListener("input", () => {
  state.journey.to = null;
  updatePlanButton();
  window.clearTimeout(jpToDebounce);
  jpToDebounce = window.setTimeout(async () => {
    await searchStopsFor(jpTo.value, jpToResults, (stop) => {
      state.journey.to = stop;
      jpTo.value = titleCase(stop.name);
      jpToResults.innerHTML = "";
      updatePlanButton();
      syncJourneySearchState();
    });
    syncJourneySearchState();
  }, 200);
});

for (const field of [jpFrom, jpTo]) {
  field.addEventListener("focus", () => sheetFollowSearch(true));
  field.addEventListener("blur", releaseJourneySheet);
}

jpEdit.addEventListener("click", () => {
  setPlannerCollapsed(false);
  jpFrom.focus();
});

jpLocate.addEventListener("click", useMyLocationForJourney);
jpPlan.addEventListener("click", () => runJourneyPlan());

jpOutput.addEventListener("click", (event) => {
  const card = event.target.closest("[data-journey]");
  if (card) {
    selectJourney(Number(card.dataset.journey));
  }
});

/* ------------------------------------------------------------------------ */
/* Boot — restores ?area=…&route=… deep links                                */
/* ------------------------------------------------------------------------ */

/* Offline support. The worker keeps timetables and route geometry, so the app
   still opens and shows saved data with no connection. */
/* Read BEFORE the new worker can claim this page. Without it, the very first
   install fires controllerchange too and a first-time visitor gets told there
   is a new version of an app they just opened. */
const hadServiceWorker = "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller);

/* The shell is network-first, so a RELOAD always gets new code — but a page
   that is never reloaded has no reason to. An installed PWA or a webview left
   open can sit on an old build for days, which is how a bug that was fixed and
   deployed still shows up on screen. This is the missing half: notice the new
   build and offer one tap. (.update-prompt has been styled for this all along;
   nothing ever created it.) */
function offerReload() {
  if (document.querySelector(".update-prompt")) {
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "update-prompt";
  button.textContent = "New version \u00b7 tap to refresh";
  button.addEventListener("click", () => window.location.reload());
  document.body.appendChild(button);
}

function watchForUpdates(registration) {
  if (!registration) {
    return;
  }

  // Something was already waiting when we registered: an update landed earlier.
  if (registration.waiting && hadServiceWorker) {
    offerReload();
  }

  registration.addEventListener("updatefound", () => {
    const incoming = registration.installing;
    if (!incoming) {
      return;
    }
    incoming.addEventListener("statechange", () => {
      if (incoming.state === "installed" && hadServiceWorker) {
        offerReload();
      }
    });
  });

  /* sw.js calls skipWaiting(), so a new worker takes over without waiting for
     tabs to close. At that moment this page is running the OLD script under a
     NEW worker — precisely when it should say so. */
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadServiceWorker) {
      offerReload();
    }
  });

  /* Checking once at startup misses the long-lived session this exists for. */
  const check = () => registration.update().catch(() => {});
  window.setInterval(check, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      check();
    }
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(watchForUpdates)
      .catch((error) => {
        console.warn("service worker registration failed", error);
      });
  });

  /* The shell now serves from cache instantly and refreshes behind the scenes
     (see sw.js). When that background refresh actually brought new code, the
     worker says so and this chip offers the reload — so a deploy is still
     visible on the first load, it just no longer taxes every load. */
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "shell-updated") return;
    if (document.getElementById("updateBubble")) return;
    const bubble = document.createElement("div");
    bubble.id = "updateBubble";
    bubble.className = "update-bubble";
    bubble.innerHTML = `
      <span><b>App updated</b> — reload for the latest version</span>
      <button type="button" class="update-btn">Reload</button>
      <button type="button" class="update-x" aria-label="Later">×</button>`;
    bubble.querySelector(".update-btn").addEventListener("click", () => window.location.reload());
    bubble.querySelector(".update-x").addEventListener("click", () => bubble.remove());
    document.body.appendChild(bubble);
  });
}


let offline = false;

function markOffline(next) {
  if (offline === next) {
    return;
  }
  offline = next;
  document.body.classList.toggle("is-offline", next);

  if (next) {
    setStatus("Offline", "idle");
    setLiveText(offlineLiveText(), false);
    return;
  }

  if (state.activeRouteId) {
    setStatus(state.live ? "Live" : "Timetable", state.live ? "live" : "idle");
    refreshVehicles().catch(() => {});
  } else {
    setStatus("Ready", "idle");
  }

  // Connectivity returned; if the app never managed to load, try again now.
  if (!indexReady) {
    ensureRouteIndex();
  }
}

function offlineLiveText() {
  if (!lastCacheStamp) {
    return "Offline";
  }
  const saved = new Date(lastCacheStamp);
  if (Number.isNaN(saved.getTime())) {
    return "Offline · showing saved data";
  }
  return `Offline · saved ${formatTimeMY(lastCacheStamp)} MYT`;
}

window.addEventListener("online", () => markOffline(false));
window.addEventListener("offline", () => markOffline(true));
if (navigator.onLine === false) {
  markOffline(true);
}

const bootParams = new URLSearchParams(window.location.search);
const bootArea = bootParams.get('area');
const bootRoute = bootParams.get('route');
const bootDirection = Number(bootParams.get('direction'));

if (bootArea) {
  state.category = bootArea;
}
if (Number.isInteger(bootDirection) && bootDirection > 0) {
  state.direction = bootDirection;
}

/* Visitor tally beside the refresh button — compact, three characters of
   meaning: 999, 1.1k, 12k, 1.1M. One tick per browsing session. */
function compactCount(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

(async function tallyVisit() {
  const el = document.getElementById("visitCount");
  if (!el) return;
  try {
    const fresh = !sessionStorage.getItem("rapidbus.visited");
    const surface = window.Capacitor?.isNativePlatform?.()
      ? "apk"
      : window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
        ? "pwa"
        : "web";
    // First-ever open from an installed surface: count this device once.
    let device = "";
    try {
      if (surface !== "web" && !localStorage.getItem("rapidbus.deviceCounted")) {
        localStorage.setItem("rapidbus.deviceCounted", "1");
        device = "&device=1";
      }
    } catch {
      /* storage-less: never counted, never double-counted */
    }
    const ref = new URLSearchParams(location.search).get("ref") === "guide" ? "&ref=guide" : "";
    const data = await getJson(fresh ? `/api/visit?src=${surface}${device}${ref}` : "/api/stats");
    if (fresh) sessionStorage.setItem("rapidbus.visited", "1");
    if (Number.isFinite(data.visits) && data.visits > 0) {
      el.textContent = compactCount(data.visits);
      el.hidden = false;
    }
  } catch {
    /* a missing tally is no loss */
  }
})();

/* Session engagement: count only VISIBLE seconds (a background tab is not
   usage), report chunks whenever the page hides, and mark each engagement
   tier once as it is crossed. Aggregate seconds only — nothing identifies
   the session. */
(function trackEngagement() {
  let activeSec = 0;
  let unsentSec = 0;
  const tiers = [
    { at: 30, name: "30s", sent: false },
    { at: 180, name: "3m", sent: false },
    { at: 600, name: "10m", sent: false }
  ];

  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    activeSec += 5;
    unsentSec += 5;
    for (const tier of tiers) {
      if (!tier.sent && activeSec >= tier.at) {
        tier.sent = true;
        fetch(apiUrl(`/api/session?tier=${tier.name}`), { keepalive: true }).catch(() => {});
      }
    }
  }, 5000);

  const flush = () => {
    if (unsentSec < 5) return;
    fetch(apiUrl(`/api/session?sec=${unsentSec}`), { keepalive: true }).catch(() => {});
    unsentSec = 0;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
})();

/* ------------------------------------------------------------------------ */
/* Battery & data saver: when the app is backgrounded or the screen is off,   */
/* nothing on screen is being read — so stop all polling. Live vehicles,     */
/* the 1s countdown, flights and the alert poll all pause when hidden and     */
/* resume on return. Trip tracking is deliberately NOT paused: that is the    */
/* one thing the user explicitly asked to run in the background.              */
/* ------------------------------------------------------------------------ */
let alertPollTimer = null;

function pauseBackgroundWork() {
  if (state.liveTimer) { window.clearTimeout(state.liveTimer); state.liveTimer = null; }
  if (state.countdownTimer) { window.clearInterval(state.countdownTimer); state.countdownTimer = null; }
  if (flightState.timer) { window.clearInterval(flightState.timer); flightState.timer = null; }
  if (alertPollTimer) { window.clearInterval(alertPollTimer); alertPollTimer = null; }
}

function resumeBackgroundWork() {
  // Live vehicle polling resumes only if a route is open.
  if (state.activeRouteId && !state.liveTimer) {
    refreshVehicles().catch(() => {});
    scheduleLiveTick();
    state.countdownTimer = window.setInterval(renderLiveStatus, 1000);
  }
  // Flights resume only if the layer was on.
  if (flightState.on && !flightState.timer) {
    refreshFlights();
    flightState.timer = window.setInterval(refreshFlights, 15000);
  }
  // Alerts: refresh once on return, then keep the 3-min poll.
  refreshAlerts();
  if (!alertPollTimer) {
    alertPollTimer = window.setInterval(refreshAlerts, 3 * 60 * 1000);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    pauseBackgroundWork();
  } else {
    resumeBackgroundWork();
  }
});

/* Push registration (APK only): once the user has allowed notifications,
   register this device's FCM token so server disruption alerts reach it.
   Opt-in — piggybacks on the notification permission, never asks on its own. */
async function registerPushIfAllowed() {
  const native = window.RapidBusNative;
  if (!native?.isNative || !native.registerPush) return;
  try {
    // Native app: ask once on first launch (the OS shows its own dialog), the
    // normal pattern for a transit app that exists to alert you. Declining is
    // remembered so we never nag. registerPush() requests the permission.
    if (localStorage.getItem("rapidbus.pushDeclined")) return;
    const token = await native.registerPush();
    if (token) {
      localStorage.setItem("rapidbus.pushOptIn", "1");
      await fetch(apiUrl(`/api/push/register?token=${encodeURIComponent(token)}`), { keepalive: true }).catch(() => {});
    } else {
      localStorage.setItem("rapidbus.pushDeclined", "1");
    }
  } catch {
    /* push is optional */
  }
}
registerPushIfAllowed();

/* Tapping a disruption push opens the affected line. The payload carries a
   url like "/?area=…&route=…"; parse it and select that route in place. */
function openFromNotification(data) {
  try {
    const url = data?.url || "";
    const qs = url.includes("?") ? url.split("?")[1] : "";
    const params = new URLSearchParams(qs);
    const area = params.get("area");
    const route = params.get("route");
    if (area && route) {
      setView("routes");
      selectRoute(route, area).catch(() => {});
    }
  } catch {
    /* a bad payload just opens the app normally */
  }
}
window.RapidBusNative?.onNotificationTap?.(openFromNotification);

/* In-app update bubble for sideloaded APKs (we are not on Play Store, so
   there is no auto-update). The build's version is baked in at bundle time
   (APP_BUILD_VERSION); if the server advertises a newer one, offer the APK. */
async function checkAppUpdate() {
  if (!window.Capacitor?.isNativePlatform?.()) return; // web auto-updates via SW
  try {
    const mine = Number(window.APP_BUILD_VERSION || 0);
    const data = await getJson("/api/app-version");
    if (!(Number(data.version) > mine)) return;
    if (document.getElementById("updateBubble")) return;
    const bubble = document.createElement("div");
    bubble.id = "updateBubble";
    bubble.className = "update-bubble";
    bubble.innerHTML = `
      <span><b>Update available</b>${data.notes ? ` — ${escapeHtml(data.notes)}` : ""}</span>
      <a class="update-btn" href="${escapeHtml(data.url || "/download/ptlive.apk")}" download>Update</a>
      <button type="button" class="update-x" aria-label="Later">\u00d7</button>`;
    bubble.querySelector(".update-x").addEventListener("click", () => bubble.remove());
    document.body.appendChild(bubble);
  } catch {
    /* update check is best-effort */
  }
}
window.setTimeout(checkAppUpdate, 3000);

/* Always-available "Get the app" in the footer — shows the install options on
   demand, even if the auto-popup was dismissed. Picks the right mode per
   platform; on Android without a live prompt it offers the APK + manual add. */
document.getElementById("getAppLink")?.addEventListener("click", (event) => {
  event.preventDefault();
  document.getElementById("installCard")?.remove();
  const ua = navigator.userAgent;
  if (window.Capacitor?.isNativePlatform?.()) {
    setStatus("You are using the app", "live");
    return;
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    showInstallCard({ mode: "ios" });
  } else if (deferredInstall) {
    showInstallCard({
      mode: "android",
      onInstall: async () => {
        deferredInstall.prompt();
        const choice = await deferredInstall.userChoice.catch(() => null);
        deferredInstall = null;
        if (choice?.outcome !== "accepted") markInstallDismissed();
      }
    });
  } else if (/android/i.test(ua)) {
    showInstallCard({ mode: "android-fallback" });
  } else {
    // Desktop: just take them straight to the APK (or they can use the PWA).
    window.location.href = "/download/ptlive.apk";
  }
});

/* Web Push (browser / PWA, non-APK): subscribe through the service worker
   using the server's VAPID key. Opt-in — only runs once the user has enabled
   notifications, and is idempotent, so calling it again just re-confirms. */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function subscribeWebPushIfAllowed() {
  if (window.Capacitor?.isNativePlatform?.()) return; // APK uses FCM instead
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    if (!localStorage.getItem("rapidbus.pushOptIn")) return;
    if (Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await getJson("/api/push/vapid");
      if (!key) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key)
      });
      await fetch(apiUrl("/api/push/web-subscribe"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub)
      }).catch(() => {});
    }
  } catch {
    /* web push is optional */
  }
}
subscribeWebPushIfAllowed();

/* Disruption strip: checked on load and every three minutes. Only rendered
   when something is actually wrong — an empty banner is noise. */
async function refreshAlerts() {
  const strip = document.getElementById("alertStrip");
  if (!strip) return;
  try {
    const data = await getJson("/api/alerts");
    const alerts = data.alerts || [];

    // Per-route index, so affected lines carry their warning everywhere.
    state.alertsByRoute = new Map();
    for (const alert of alerts) {
      for (const route of alert.routes || []) {
        state.alertsByRoute.set(`${route.category}:${route.routeId}`, alert.message);
      }
    }

    /* The banner announces; the per-line markers persist. It shows for a
       few seconds per NEW advisory (tracked by content), then gets out of
       the way — dismissing early is remembered for the session. */
    const digest = alerts.map((a) => a.line + a.message).join("|");
    let seen = "";
    try {
      seen = sessionStorage.getItem("rapidbus.alertSeen") || "";
    } catch { /* no storage: show every time, better than never */ }

    if (!alerts.length || digest === seen) {
      strip.classList.add("hidden");
    } else {
      // Compact pill: one short line (line name + status), tap to expand for
      // the full advisory. Short label = the part before the first dash.
      const summary = alerts.length === 1
        ? `${alerts[0].line} · ${alerts[0].message.split("\u2014")[0].split(" - ")[0].trim()}`
        : `${alerts.length} service alerts`;
      const full = alerts.map((a) => `<b>${escapeHtml(a.line)}</b> ${escapeHtml(a.message)}`).join("<br>");
      strip.classList.remove("expanded");
      strip.innerHTML =
        `<span class="alert-warn">\u26a0</span>` +
        `<span class="alert-text">${escapeHtml(summary)}</span>` +
        `<button type="button" class="alert-close" aria-label="Dismiss">\u00d7</button>` +
        `<div class="alert-full" hidden>${full}</div>`;
      strip.classList.remove("hidden");
      const dismiss = () => {
        strip.classList.add("hidden");
        try {
          sessionStorage.setItem("rapidbus.alertSeen", digest);
        } catch { /* optional */ }
      };
      strip.querySelector(".alert-close").addEventListener("click", (e) => { e.stopPropagation(); dismiss(); });
      // Tap the pill to reveal/hide the full text.
      strip.querySelector(".alert-text").addEventListener("click", () => {
        const f = strip.querySelector(".alert-full");
        const showing = strip.classList.toggle("expanded");
        f.hidden = !showing;
        window.clearTimeout(state.alertTimer);
      });
      window.clearTimeout(state.alertTimer);
      state.alertTimer = window.setTimeout(dismiss, 12000);
    }
    // Re-render so markers appear without waiting for the next user action.
    if (indexReady) searchRoutes();
    if (state.currentRoute) renderRouteDetails();
  } catch {
    /* keep whatever is shown */
  }
}
refreshAlerts();
alertPollTimer = window.setInterval(refreshAlerts, 3 * 60 * 1000);

try {
  const savedRegion = localStorage.getItem(REGION_KEY);
  if (savedRegion === "my" || savedRegion === "sg") {
    applyRegion(savedRegion);
    // Recenter the map on the saved region too, so reopening in SG shows
    // Singapore — not the default KL view, which made it look like it reset.
    // Skip if a deep link (shared route/journey) is positioning the map.
    if (!bootRoute && !bootParams.get("jt")) {
      map.setView(REGION_CENTERS[savedRegion], 11);
    }
  }
} catch {
  /* default region stands */
}

renderRouteDetails();
renderRecents();
renderRecentJourneys();
renderRouteSkeletons();

/* A shared journey link plans itself on arrival. */
const bootFrom = bootParams.get("jf");
const bootTo = bootParams.get("jt");
if (bootFrom && bootTo) {
  const [bLat, bLon] = bootFrom.split(",").map(Number);
  if (Number.isFinite(bLat) && Number.isFinite(bLon)) {
    const bd = Number(bootParams.get("jd"));
    if (Number.isFinite(bd) && bd >= 0 && bd <= 1439) {
      jpTime.value = `${String(Math.floor(bd / 60)).padStart(2, "0")}:${String(bd % 60).padStart(2, "0")}`;
      jpNow.classList.remove("on");
    }
    applyJourneyPick({
      from: { lat: bLat, lon: bLon, name: bootParams.get("jfn") || "Origin" },
      to: { key: bootTo, name: bootParams.get("jtn") || "Destination" }
    });
    setView("journey");
  }
}

/* The first load can fail for ordinary reasons on a phone — no signal yet, a
   tunnel, Wi-Fi still associating. Latching an empty app until the user thinks
   to reload is not acceptable, so the index is retried with backoff and again
   whenever connectivity comes back. */
let indexAttempt = 0;

async function ensureRouteIndex(options = {}) {
  if (indexReady) {
    return;
  }

  try {
    await buildRouteIndex();
    indexAttempt = 0;
    searchRoutes();
    renderSuggestions();
    renderRecents();
    if (options.thenSelect) {
      await selectRoute(options.thenSelect, bootArea || undefined, { keepDirection: true });
    }
  } catch (error) {
    indexAttempt += 1;
    console.warn(`route index attempt ${indexAttempt} failed:`, error.message);
    if (indexAttempt === 1) {
      showError(error);
    }
    // 3s, 6s, 12s, 24s, then every 30s.
    const delay = Math.min(3000 * 2 ** (indexAttempt - 1), 30000);
    window.setTimeout(() => ensureRouteIndex(options), delay);
  }
}

initSheet();

ensureRouteIndex(bootRoute ? { thenSelect: bootRoute } : {});


/* ------------------------------------------------------------------------ */
/* In-app browsers (Threads, Facebook, Instagram, Messenger) wrap the page   */
/* in a WebView that hijacks scroll and clips features. Offer the real       */
/* browser; on Android an intent: URL usually jumps straight to it.          */
/* ------------------------------------------------------------------------ */

(function offerRealBrowser() {
  const ua = navigator.userAgent;
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|BarcelonaAndroid|Threads|Messenger|Line\//i.test(ua);
  if (!inApp) return;
  try {
    if (sessionStorage.getItem("rapidbus.iabDismissed")) return;
  } catch {
    /* keep going */
  }

  document.body.classList.add("iab");
  const banner = document.createElement("div");
  banner.className = "iab-banner";
  banner.innerHTML = `
    <span>Works better in your browser</span>
    <button type="button" class="iab-open">Open in browser</button>
    <button type="button" class="iab-dismiss" aria-label="Dismiss">\u00d7</button>
  `;
  banner.querySelector(".iab-open").addEventListener("click", () => {
    const here = location.href.replace(/^https?:\/\//, "");
    if (/android/i.test(ua)) {
      // Chrome intent: most Android in-app WebViews honour this and hand off.
      location.href = `intent://${here}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
    } else {
      // iOS: Safari scheme works from several in-app browsers; harmless if not.
      location.href = `x-safari-https://${here}`;
    }
  });
  banner.querySelector(".iab-dismiss").addEventListener("click", () => {
    banner.remove();
    document.body.classList.remove("iab");
    try {
      sessionStorage.setItem("rapidbus.iabDismissed", "1");
    } catch {
      /* optional */
    }
  });
  document.body.appendChild(banner);
})();

/* ------------------------------------------------------------------------ */
/* Rate & improve — asked only of people who demonstrably use the app.       */
/* Rules: 5+ sessions on this device, shown after 30 s of active use in the  */
/* session, never while a journey is being tracked. Submitting ends it       */
/* forever; dismissing waits 14 days AND 5 more sessions; three dismissals   */
/* and it never asks again.                                                  */
/* ------------------------------------------------------------------------ */

(function rateAndImprove() {
  const K = {
    sessions: "rapidbus.sessions",
    done: "rapidbus.rated",
    asks: "rapidbus.rateAsks",
    lastAsk: "rapidbus.rateLastAsk",
    sinceAsk: "rapidbus.sessionsSinceAsk"
  };
  let store;
  try {
    store = localStorage;
    // One tick per browsing session.
    if (!sessionStorage.getItem("rapidbus.sessionCounted")) {
      sessionStorage.setItem("rapidbus.sessionCounted", "1");
      store.setItem(K.sessions, String(Number(store.getItem(K.sessions) || 0) + 1));
      store.setItem(K.sinceAsk, String(Number(store.getItem(K.sinceAsk) || 0) + 1));
    }
  } catch {
    return; // no storage, no prompt — better silent than nagging every visit
  }

  const eligible = () =>
    !store.getItem(K.done) &&
    Number(store.getItem(K.sessions) || 0) >= 5 &&
    Number(store.getItem(K.asks) || 0) < 3 &&
    Number(store.getItem(K.sinceAsk) || 0) >= 5 &&
    Date.now() - Number(store.getItem(K.lastAsk) || 0) > 14 * 24 * 3600 * 1000 &&
    !state.journey.tracking;

  function show() {
    if (document.getElementById("rateCard")) return;
    const card = document.createElement("div");
    card.id = "rateCard";
    card.className = "install-card rate-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Rate the app");
    card.innerHTML = `
      <button type="button" class="install-close" aria-label="Not now">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div class="install-copy">
        <strong>Enjoying Public Transport Live?</strong>
        <span>A rating and one idea help improve the app</span>
      </div>
      <div class="rate-stars" role="radiogroup" aria-label="Stars">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="rate-star" data-n="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">\u2606</button>`).join("")}
      </div>
      <textarea class="rate-msg" maxlength="500" rows="2" placeholder="What should we improve? (optional)"></textarea>
      <button type="button" class="install-go rate-send" disabled>Send</button>
    `;

    let stars = 0;
    const paint = () => card.querySelectorAll(".rate-star").forEach((b, i) => {
      b.textContent = i < stars ? "\u2605" : "\u2606";
      b.classList.toggle("on", i < stars);
    });
    card.querySelectorAll(".rate-star").forEach((b) =>
      b.addEventListener("click", () => {
        stars = Number(b.dataset.n);
        paint();
        card.querySelector(".rate-send").disabled = false;
      })
    );

    const dismiss = () => {
      store.setItem(K.asks, String(Number(store.getItem(K.asks) || 0) + 1));
      store.setItem(K.lastAsk, String(Date.now()));
      store.setItem(K.sinceAsk, "0");
      card.classList.remove("show");
      window.setTimeout(() => card.remove(), 250);
    };
    card.querySelector(".install-close").addEventListener("click", dismiss);

    card.querySelector(".rate-send").addEventListener("click", async () => {
      const msg = card.querySelector(".rate-msg").value.trim();
      card.querySelector(".rate-send").disabled = true;
      try {
        await getJson(`/api/feedback?stars=${stars}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`).catch(() => {});
      } finally {
        store.setItem(K.done, "1");
        card.querySelector(".install-copy strong").textContent = "Terima kasih! \ud83d\ude4f";
        card.querySelector(".install-copy span").textContent = "Your feedback reached the developer.";
        card.querySelectorAll(".rate-stars,.rate-msg,.rate-send").forEach((el) => el.remove());
        window.setTimeout(() => {
          card.classList.remove("show");
          window.setTimeout(() => card.remove(), 250);
        }, 2200);
      }
    });

    document.body.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("show")));
  }

  window.setTimeout(() => {
    if (eligible()) show();
  }, 30000);
})();

/* ------------------------------------------------------------------------ */
/* PWA install — offer the home-screen prompt instead of hoping the user     */
/* finds it in the browser menu.                                             */
/* ------------------------------------------------------------------------ */

const INSTALL_DISMISSED_KEY = "rapidbus.installDismissed";

function installDismissed() {
  try {
    return Boolean(localStorage.getItem(INSTALL_DISMISSED_KEY));
  } catch {
    return false;
  }
}

function markInstallDismissed() {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    /* optional */
  }
}

const runningStandalone =
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/* One install card for both platforms: icon, name, pitch — then either the
   real install button (Android/Chrome) or the two Share-menu steps Apple
   leaves us with (iOS Safari). Appears once, after the app has had a moment
   to prove itself; dismissing it is remembered forever. */
function showInstallCard({ mode, onInstall }) {
  if (document.getElementById("installCard")) return;

  const card = document.createElement("div");
  card.id = "installCard";
  card.className = "install-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Install the app");

  const shareGlyph = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12M12 3l-4 4M12 3l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const plusGlyph = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

  card.innerHTML = `
    <button type="button" class="install-close" aria-label="Not now">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <div class="install-head">
      <img class="install-icon" src="/assets/icon-192.png" alt="" width="44" height="44" />
      <div class="install-copy">
        <strong>Public Transport Live</strong>
        <span>Full screen, faster, works offline</span>
      </div>
    </div>
    ${
      mode === "ios"
        ? `<ol class="install-steps">
             <li><span class="install-glyph">${shareGlyph}</span>Tap <b>Share</b> in Safari</li>
             <li><span class="install-glyph">${plusGlyph}</span>Choose <b>Add to Home Screen</b></li>
           </ol>`
        : mode === "android" || mode === "android-fallback"
        ? `<a class="install-go" href="/download/ptlive.apk" download style="text-decoration:none;text-align:center">Install app <b>(Android)</b></a>
           <div class="install-sub">Best notifications &amp; reliability</div>
           ${
             mode === "android"
               ? `<button type="button" class="install-alt" data-pwa>Or add to home screen (lite web app)</button>`
               : `<div class="install-alt-note">Or: menu <b>\u22ee</b> \u2192 <b>Add to Home screen</b> for the lite web app</div>`
           }`
        : `<button type="button" class="install-go">Install app</button>`
    }
  `;

  card.querySelector(".install-close").addEventListener("click", () => {
    markInstallDismissed();
    card.classList.remove("show");
    window.setTimeout(() => card.remove(), 250);
  });
  card.querySelector(".install-go")?.addEventListener("click", () => {
    onInstall?.();
    // APK links (<a download>) navigate on their own; only the desktop/web
    // button needs the card dismissed.
    if (!card.querySelector(".install-go[href]")) card.remove();
  });
  card.querySelector("[data-pwa]")?.addEventListener("click", () => {
    onInstall?.();
    card.remove();
  });

  document.body.appendChild(card);
  // Two frames so the entrance transition actually runs.
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("show")));
}

/* Chrome/Edge/Android: the real prompt. Captured, deferred, offered once. */
let deferredInstall = null;
let installPromptFired = false;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstall = event;
  installPromptFired = true;
  if (runningStandalone || installDismissed() || window.Capacitor?.isNativePlatform?.()) return;
  document.getElementById("installCard")?.remove(); // replace any fallback card
  window.setTimeout(() => {
    showInstallCard({
      mode: "android",
      onInstall: async () => {
        if (!deferredInstall) return;
        deferredInstall.prompt();
        const choice = await deferredInstall.userChoice.catch(() => null);
        deferredInstall = null;
        if (choice?.outcome !== "accepted") markInstallDismissed();
      }
    });
  }, 2500);
});

/* Chrome withholds beforeinstallprompt until it judges the user "engaged",
   so a first-time Android visitor often sees nothing. If the event hasn't
   fired a few seconds in, offer the fallback card anyway: the APK download
   plus manual "Add to Home Screen" — so first open always offers something. */
if (/android/i.test(navigator.userAgent) && !runningStandalone && !window.Capacitor?.isNativePlatform?.()) {
  window.setTimeout(() => {
    if (!installPromptFired && !installDismissed() && !document.getElementById("installCard")) {
      showInstallCard({ mode: "android-fallback" });
    }
  }, 6000);
}

window.addEventListener("appinstalled", () => {
  document.getElementById("installCard")?.remove();
  markInstallDismissed();
  // Count the install itself, once.
  fetch(apiUrl("/api/visit?installed=1"), { keepalive: true }).catch(() => {});
});

/* iOS Safari never fires beforeinstallprompt; the best that exists is telling
   the user where Apple hid it. Shown once, dismissible forever. */
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (isIos && !runningStandalone && !installDismissed() && !window.Capacitor?.isNativePlatform?.()) {
  window.setTimeout(() => showInstallCard({ mode: "ios" }), 4000);
}
