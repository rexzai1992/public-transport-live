import { Router } from "express";
import { type FeedId, FEED_IDS, FEEDS, feedDefinition } from "./config.js";
import { buildStopEtas, buildPassedTrips } from "./eta.js";
import { buildRouteMapGeoJson } from "./geojson.js";
import { getVehiclePositions, hasRealtime } from "./gtfsRealtime.js";
import {
  findOrderedRouteStops,
  findRoutePatterns,
  findRouteShapes,
  getStaticFeed,
  listRoutes,
  routeMatchKeys,
  vehicleBelongsToRoute
} from "./gtfsStatic.js";
import { buildRouteStopSchedule, malaysiaClock, withNextDepartures } from "./schedule.js";
import { planJourney, searchStops, nearbyDepartures, stopBoard } from "./journey.js";
import { getSgStopArrivals } from "./sg/vehicles.js";
import { getTrainAlerts, getPlatformCrowd } from "./sg/datamall.js";
import { getAircraft, getFlightRoute, findFlight } from "./flights.js";
import { getKlAlerts } from "./mtrec.js";
import { registerToken, unregisterToken, pushToAll, tokenCount } from "./push.js";
import { subscribeWeb, unsubscribeWeb, pushWebAll, webSubCount } from "./webpush.js";
import { bumpVisit, bumpApi, bumpDay, bumpRoute, bumpActive, bumpTier, addFeedback, bumpInstall, bumpDevice, bumpGuideView, bumpFromGuide, visitTotal, getStats } from "./stats.js";
import {
  categoryParamSchema,
  journeySchema,
  stopSearchSchema,
  mapQuerySchema,
  routeParamSchema,
  routeSearchSchema,
  vehicleQuerySchema, nearbySchema, stopBoardSchema, sgArrivalSchema, crowdSchema, flightsSchema, flightRouteSchema, sessionSchema, feedbackSchema } from "./validators.js";

export const apiRouter = Router();

/* One aggregate tick per API request that reaches the app (nginx's
   micro-cache answers the rest, which is the point of it). */
apiRouter.use((req, _res, next) => {
  if (!req.path.startsWith("/visit") && !req.path.startsWith("/stats")) {
    bumpApi();
  }
  next();
});

apiRouter.get("/rapid-bus/categories", (_req, res) => {
  res.json({
    categories: FEED_IDS,
    feeds: FEED_IDS.map((id) => ({
      id,
      label: FEEDS[id].label,
      short: FEEDS[id].short,
      mode: FEEDS[id].mode,
      live: FEEDS[id].realtimeUrl !== null
    }))
  });
});

apiRouter.get("/rapid-bus/:category/routes", async (req, res, next) => {
  try {
    const { category } = categoryParamSchema.parse(req.params);
    const { search } = routeSearchSchema.parse(req.query);
    const feed = await getStaticFeed(category);

    res.json({
      category,
      loadedAt: feed.loadedAt,
      routes: listRoutes(feed, search)
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/rapid-bus/:category/routes/:routeId", async (req, res, next) => {
  try {
    const { category, routeId } = routeParamSchema.parse(req.params);
    const feed = await getStaticFeed(category);
    const route = feed.routes.get(routeId);

    if (!route) {
      res.status(404).json({ error: "Route not found", routeId });
      return;
    }

    const trips = feed.tripsByRouteId.get(routeId) ?? [];
    const shapes = findRouteShapes(feed, routeId);
    const stops = findOrderedRouteStops(feed, routeId);

    res.json({
      category,
      route,
      stats: {
        trips: trips.length,
        shapes: shapes.length,
        stops: stops.length
      },
      stops,
      shapes: shapes.map((shape, index) => ({
        shapeIndex: index,
        points: shape
      }))
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/rapid-bus/:category/vehicles", async (req, res, next) => {
  try {
    const { category } = categoryParamSchema.parse(req.params);
    const { routeId } = vehicleQuerySchema.parse(req.query);
    const feed = await getStaticFeed(category);
    const vehicles = await getVehiclePositions(category, feed, routeId);

    let matching = vehicles;
    if (routeId) {
      const route = feed.routes.get(routeId);
      const keys = route ? routeMatchKeys(route) : new Set([routeId.toUpperCase()]);
      matching = vehicles.filter((vehicle) => vehicleBelongsToRoute(vehicle.routeId, keys));
    }

    res.json({
      category,
      routeId,
      vehicles: matching
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/rapid-bus/:category/map", async (req, res, next) => {
  bumpDay("routeViews");
  try {
    const { category } = categoryParamSchema.parse(req.params);
    const { routeId, direction } = mapQuerySchema.parse(req.query);
    const feed = await getStaticFeed(category);
    const route = feed.routes.get(routeId);

    if (!route) {
      res.status(404).json({ error: "Route not found", routeId });
      return;
    }

    // Stats read like the app does: the route's code, not its feed-internal
    // id (MRT feeder codes live in longName; shortName ships empty there).
    bumpRoute(
      `${category}:${routeId}`,
      `${route.shortName || route.longName || routeId} \u00b7 ${feedDefinition(category).short}`
    );

    const matchKeys = routeMatchKeys(route);
    const vehicles = (await getVehiclePositions(category, feed, routeId)).filter((vehicle) =>
      vehicleBelongsToRoute(vehicle.routeId, matchKeys)
    );

    /* Serve one direction at a time: stops and shape must belong to the same
       pattern or the ETAs count down the wrong way along the list. */
    const patterns = findRoutePatterns(feed, routeId);
    const directionIndex = patterns.length
      ? Math.min(direction ?? 0, patterns.length - 1)
      : 0;
    const pattern = patterns[directionIndex];

    const shapes = pattern ? pattern.shapes : findRouteShapes(feed, routeId);
    const clock = malaysiaClock();
    const patternStops = pattern ? pattern.stops : findOrderedRouteStops(feed, routeId);
    const stops = withNextDepartures(
      patternStops,
      buildRouteStopSchedule(feed, routeId, clock),
      clock,
      3,
      buildPassedTrips(patternStops, shapes, vehicles)
    );
    const stopEtas = buildStopEtas(stops, shapes, vehicles);
    const geojson = buildRouteMapGeoJson(
      route,
      shapes,
      stops,
      vehicles,
      stopEtas
    );

    res.json({
      category,
      route,
      generatedAt: new Date().toISOString(),
      serviceDay: clock.date,
      mode: FEEDS[category].mode,
      live: hasRealtime(category),
      shapeSource: pattern?.shapeSource ?? "none",
      direction: directionIndex,
      patterns: patterns.map((entry, index) => ({
        index,
        directionId: entry.directionId,
        headsign: entry.headsign,
        // KTMB trips carry no headsign, so the endpoints stand in for one.
        from: entry.stops[0]?.name,
        to: entry.stops[entry.stops.length - 1]?.name,
        stops: entry.stops.length
      })),
      etaSource: "Estimated from vehicle-position GTFS-RT; official trip-update ETAs are not available in the Data.gov.my feed yet.",
      geojson
    });
  } catch (error) {
    next(error);
  }
});

/* Feeds worth searching for a journey. Bus networks are huge and mostly serve
   first/last mile, so the default is rail plus the KL bus networks; callers can
   narrow or widen it with ?feeds=a,b. */
export const DEFAULT_JOURNEY_FEEDS: FeedId[] = [
  "rapid-rail-kl",
  "ktmb",
  "rapid-bus-kl",
  "rapid-bus-mrtfeeder",
  /* The myBAS / MyBus city networks. Each is geographically disjoint from the
     others and from KL, so they add nothing to a Klang Valley search — the
     550 m transfer grid never compares their stops against KL's — but without
     them a passenger in Johor Bahru or Melaka cannot plan a trip at all, which
     is the whole point of carrying the feed. */
  "mybas-johor",
  "mybas-melaka",
  "mybas-ipoh",
  "mybas-seremban-a",
  "mybas-seremban-b",
  "mybas-alor-setar",
  "mybas-kangar",
  "mybas-kota-bharu",
  "mybas-kuala-terengganu",
  "mybas-kuching",
  // The planner drops feeds that fail to load, so Singapore rides along and
  // simply vanishes from planning while LTA_ACCOUNT_KEY is unset (rail works
  // keyless). The two countries never link — no walk transfer spans the causeway.
  "sg-rail",
  "sg-bus"
];

function parseFeeds(raw?: string): FeedId[] {
  if (!raw) {
    return DEFAULT_JOURNEY_FEEDS;
  }
  const wanted = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is FeedId => (FEED_IDS as string[]).includes(value));
  return wanted.length ? wanted : DEFAULT_JOURNEY_FEEDS;
}

apiRouter.get("/stops/search", async (req, res, next) => {
  try {
    const { q, feeds } = stopSearchSchema.parse(req.query);
    res.json({ query: q, stops: await searchStops(q, parseFeeds(feeds)) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/stops/nearby", async (req, res, next) => {
  bumpDay("nearby");
  try {
    const query = nearbySchema.parse(req.query);
    const stops = await nearbyDepartures(query.lat, query.lon, parseFeeds(query.feeds), query.limit ?? 6);
    res.json({ generatedAt: new Date().toISOString(), stops });
  } catch (error) {
    next(error);
  }
});

/* The full board for one stop: every route that calls there and when. Answers
   "I am standing here, what can I catch" — which /stops/nearby cannot, because
   it caps itself at two departures per route across a handful of stops. */
apiRouter.get("/stops/board", async (req, res, next) => {
  try {
    const query = stopBoardSchema.parse(req.query);
    const board = await stopBoard(query.key, parseFeeds(query.feeds), query.minutes ?? 120);
    if (!board) {
      res.status(404).json({ error: "Unknown stop" });
      return;
    }
    res.json({ generatedAt: new Date().toISOString(), ...board });
  } catch (error) {
    next(error);
  }
});

/* Live per-stop predictions from LTA, ETAs plus crowding. */
apiRouter.get("/rapid-bus/sg-bus/arrivals", async (req, res, next) => {
  try {
    const { stop } = sgArrivalSchema.parse(req.query);
    res.json({ stop, services: await getSgStopArrivals(stop) });
  } catch (error) {
    next(error);
  }
});

/* Service disruptions, both countries: Singapore rail from LTA's official
   alerts, Klang Valley lines from the MTREC community API. */
apiRouter.get("/alerts", async (_req, res, next) => {
  try {
    const [sg, kl] = await Promise.all([getTrainAlerts(), getKlAlerts()]);

    /* Attach the affected routes so the app can flag them in the route list
       and inside the route's own page — a banner warns, a marked line
       explains. MTREC's KA_/KC_ Komuter ids map to the KTMB lines; its other
       ids match rapid-rail-kl short names; LTA's codes match sg-rail ids. */
    const alerts: { line: string; message: string; severe: boolean; routes: { category: string; routeId: string }[] }[] = [];

    const klFeed = await getStaticFeed("rapid-rail-kl").catch(() => null);
    const ktmb = await getStaticFeed("ktmb").catch(() => null);
    for (const alert of kl) {
      const routes: { category: string; routeId: string }[] = [];
      if (klFeed) {
        for (const route of klFeed.routes.values()) {
          if ((route.shortName || route.routeId) === alert.lineId) {
            routes.push({ category: "rapid-rail-kl", routeId: route.routeId });
          }
        }
      }
      if (ktmb && /Komuter/i.test(alert.lineId)) {
        const wanted = alert.lineId.startsWith("KA") ? "Port Klang" : alert.lineId.startsWith("KC") ? "Seremban" : "";
        for (const route of ktmb.routes.values()) {
          if (wanted && (route.shortName || "").includes(wanted)) {
            routes.push({ category: "ktmb", routeId: route.routeId });
          }
        }
      }
      alerts.push({ line: alert.line, message: alert.message, severe: alert.severe, routes });
    }

    for (const alert of sg) {
      // LTA only reports trains when actually disrupted, so treat as severe.
      alerts.push({
        line: alert.line,
        message: alert.message,
        severe: true,
        routes: [{ category: "sg-rail", routeId: alert.line }]
      });
    }

    // Push once when the set of disruptions changes — riders learn of a new
    // problem without opening the app. The digest guard prevents re-pushing
    // the same advisory every poll.
    void maybePushAlerts(alerts);

    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

/* Push discipline, keyed by LINE not message text. MTREC is crowdsourced:
   statuses flap (Degraded ↔ Normal) and remarks get edited between polls, so a
   naive "message changed → push" spams the same line repeatedly. Instead each
   line can push at most once per cooldown; pre-existing suspensions at startup
   are recorded silently, never blasted. */
// Per-line push cooldown, hours. Change PUSH_COOLDOWN_HOURS in .env and
// restart — no code change needed. Default 3h.
const PUSH_COOLDOWN_MS = (Number(process.env.PUSH_COOLDOWN_HOURS) || 3) * 60 * 60 * 1000;
const lastPushByLine = new Map<string, number>();
let alertDigestPrimed = false;

async function maybePushAlerts(alerts: { line: string; message: string; severe?: boolean; routes?: { category: string; routeId: string }[] }[]): Promise<void> {
  const severe = alerts.filter((a) => a.severe);
  const now = Date.now();

  // First observation after a restart: record what is already down, push none.
  if (!alertDigestPrimed) {
    alertDigestPrimed = true;
    for (const a of severe) lastPushByLine.set(a.line, now);
    return;
  }

  for (const a of severe) {
    const last = lastPushByLine.get(a.line) ?? 0;
    if (now - last < PUSH_COOLDOWN_MS) continue; // still cooling down
    lastPushByLine.set(a.line, now);
    const route = a.routes?.[0];
    const path = route ? `/?area=${encodeURIComponent(route.category)}&route=${encodeURIComponent(route.routeId)}` : "/";
    await Promise.all([
      pushToAll(`\u26a0 ${a.line}`, a.message, path),
      pushWebAll(`\u26a0 ${a.line}`, a.message, `https://public.kaynx1.com${path}`)
    ]).catch(() => {});
  }
}

/* Live platform crowding for one SG rail line — the only real-time train
   data LTA publishes. Levels: l / m / h. */
apiRouter.get("/rapid-bus/sg-rail/crowd", async (req, res, next) => {
  try {
    const { line } = crowdSchema.parse(req.query);
    res.json({ line, stations: await getPlatformCrowd(line) });
  } catch (error) {
    next(error);
  }
});

/* Visitor counter and usage stats — aggregate numbers only, see stats.ts. */
export function adminStats() {
  return { ...getStats(), pushDevices: tokenCount(), webPushDevices: webSubCount() };
}

export async function sendAdminPush(title: string, body: string) {
  const [fcm, web] = await Promise.all([pushToAll(title, body), pushWebAll(title, body)]);
  return { sent: fcm.sent + web.sent, failed: fcm.failed + web.failed, fcm: fcm.sent, web: web.sent };
}

apiRouter.get("/visit", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const src = req.query.src === "pwa" || req.query.src === "apk" ? String(req.query.src) : undefined;
  if (req.query.installed === "1") {
    bumpInstall();
  }
  if (req.query.device === "1" && (src === "pwa" || src === "apk")) {
    bumpDevice(src);
  }
  if (req.query.ref === "guide") {
    bumpFromGuide();
  }
  res.json({ visits: bumpVisit(src) });
});

/* Fired by the static guide site (fetch no-cors); response body is never
   read, so the pinned CORS policy stays untouched. */
apiRouter.get("/push/vapid", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ key: process.env.VAPID_PUBLIC ?? "" });
});

apiRouter.post("/push/web-subscribe", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  subscribeWeb(req.body);
  res.json({ ok: true });
});

apiRouter.get("/push/web-unsubscribe", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  unsubscribeWeb(String(req.query.endpoint ?? ""));
  res.json({ ok: true });
});

apiRouter.get("/push/register", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.query.token ?? "");
  registerToken(token);
  res.json({ ok: true });
});

apiRouter.get("/push/unregister", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  unregisterToken(String(req.query.token ?? ""));
  res.json({ ok: true });
});

apiRouter.get("/guide-view", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const page = String(req.query.page ?? "").slice(0, 80);
  if (/^\/[a-z0-9/-]*$/.test(page)) {
    bumpGuideView(page === "/" ? "/ (landing)" : page);
  }
  res.status(204).end();
});

/* Session heartbeat: the page reports chunks of visible-use seconds when it
   goes to background, and one tick per engagement tier crossed. GET so the
   pinned CORS setup stays untouched; no-store so nginx never caches it. */
apiRouter.get("/session", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { sec, tier } = sessionSchema.parse(req.query);
    if (sec) bumpActive(sec);
    if (tier) bumpTier(tier);
  } catch {
    /* malformed beacons are dropped, not errored — sendBeacon can't retry */
  }
  res.status(204).end();
});

/* In-app rating + improvement note. GET keeps the pinned CORS untouched;
   the message is length-capped and stored as plain text for the admin panel
   only — never republished anywhere. */
apiRouter.get("/feedback", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { stars, msg } = feedbackSchema.parse(req.query);
    addFeedback(stars, msg);
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "stars 1-5, msg up to 500 chars" });
  }
});

apiRouter.get("/stats", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ visits: visitTotal() });
});

apiRouter.get("/flights", async (req, res, next) => {
  bumpDay("flights");
  try {
    const { lat, lon, r } = flightsSchema.parse(req.query);
    res.json({ aircraft: await getAircraft(lat, lon, r) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/flights/route", async (req, res, next) => {
  try {
    const { callsign } = flightRouteSchema.parse(req.query);
    res.json({ callsign, route: await getFlightRoute(callsign.toUpperCase()) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/flights/find", async (req, res, next) => {
  try {
    const { callsign } = flightRouteSchema.parse(req.query);
    res.json(await findFlight(callsign));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/journey", async (req, res, next) => {
  bumpDay("journeys");
  try {
    const query = journeySchema.parse(req.query);

    if (!query.toStop && (query.toLat === undefined || query.toLon === undefined)) {
      res.status(400).json({ error: "Provide toStop, or both toLat and toLon" });
      return;
    }

    const plan = await planJourney({
      from: { lat: query.fromLat, lon: query.fromLon, name: query.fromName },
      to: query.toStop
        ? { stopKey: query.toStop }
        : { lat: query.toLat!, lon: query.toLon!, name: query.toName },
      feeds: parseFeeds(query.feeds),
      departAfter: query.departAfter
    });

    res.json(plan);
  } catch (error) {
    next(error);
  }
});
