import { Router } from "express";
import { type FeedId, FEED_IDS, FEEDS } from "./config.js";
import { buildStopEtas } from "./eta.js";
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
import { planJourney, searchStops, nearbyDepartures } from "./journey.js";
import { getSgStopArrivals } from "./sg/vehicles.js";
import { getTrainAlerts, getPlatformCrowd, getExpresswayTimes } from "./sg/datamall.js";
import {
  categoryParamSchema,
  journeySchema,
  stopSearchSchema,
  mapQuerySchema,
  routeParamSchema,
  routeSearchSchema,
  vehicleQuerySchema, nearbySchema, sgArrivalSchema, crowdSchema } from "./validators.js";

export const apiRouter = Router();

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
  try {
    const { category } = categoryParamSchema.parse(req.params);
    const { routeId, direction } = mapQuerySchema.parse(req.query);
    const feed = await getStaticFeed(category);
    const route = feed.routes.get(routeId);

    if (!route) {
      res.status(404).json({ error: "Route not found", routeId });
      return;
    }

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
    const stops = withNextDepartures(
      pattern ? pattern.stops : findOrderedRouteStops(feed, routeId),
      buildRouteStopSchedule(feed, routeId, clock),
      clock
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
const DEFAULT_JOURNEY_FEEDS: FeedId[] = [
  "rapid-rail-kl",
  "ktmb",
  "rapid-bus-kl",
  "rapid-bus-mrtfeeder",
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
  try {
    const query = nearbySchema.parse(req.query);
    const stops = await nearbyDepartures(query.lat, query.lon, parseFeeds(query.feeds), query.limit ?? 6);
    res.json({ generatedAt: new Date().toISOString(), stops });
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

/* Service disruptions. Singapore rail comes from LTA; Malaysia has no
   equivalent API, so its entries can only ever arrive by hand. */
apiRouter.get("/alerts", async (_req, res, next) => {
  try {
    res.json({ alerts: await getTrainAlerts() });
  } catch (error) {
    next(error);
  }
});

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

apiRouter.get("/sg/travel-times", async (_req, res, next) => {
  try {
    res.json({ roads: await getExpresswayTimes() });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/journey", async (req, res, next) => {
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
