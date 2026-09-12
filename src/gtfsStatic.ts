import { parse } from "csv-parse/sync";
import JSZip from "jszip";
import { type FeedId, feedDefinition, STATIC_GTFS_TTL_MS } from "./config.js";
import { fetchArrayBuffer } from "./http.js";
import { buildSgRailFeed } from "./sg/railFeed.js";
import { buildSgBusFeed } from "./sg/busFeed.js";
import type {
  RoutePattern,
  GtfsCalendar,
  GtfsFrequency,
  GtfsCalendarException,
  GtfsRoute,
  GtfsShapePoint,
  GtfsStop,
  GtfsStopTime,
  GtfsTrip,
  RouteStop,
  StaticGtfsFeed
} from "./types.js";

type StaticCacheEntry = {
  expiresAt: number;
  feed: StaticGtfsFeed;
};

const staticCache = new Map<FeedId, StaticCacheEntry>();

/* One download per feed, no matter how many requests race for it. The app's
   boot fires every category at once, so an uncached feed used to be fetched
   and parsed once per concurrent request — same zip, same CPU, N times. */
const inflight = new Map<FeedId, Promise<StaticGtfsFeed>>();

/* A feed whose upstream is dead (Kuantan and Kangar 404 for months at a time)
   never lands in the cache, so without this every request that touches "all
   feeds" — /route-index above all — re-attempted the download and sat waiting
   on the broken upstream. Remember the failure and answer from it for a few
   minutes instead. */
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const lastFailure = new Map<FeedId, { at: number; error: Error }>();

export function getStaticGtfsUrl(feedId: FeedId): string {
  return feedDefinition(feedId).staticUrl;
}

export async function getStaticFeed(feedId: FeedId): Promise<StaticGtfsFeed> {
  const cached = staticCache.get(feedId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.feed;
  }

  /* Timetables a few hours past their TTL are still timetables. Serving the
     stale copy and refreshing behind it turns the daily expiry from a
     multi-second stall for whoever hits it first into zero user-visible cost.
     A feed that was never loaded still has to block — there is nothing to
     serve yet. */
  if (cached) {
    if (!inflight.has(feedId)) {
      loadStaticFeed(feedId).catch(() => {
        /* refresh failed; the stale copy stands until the next attempt */
      });
    }
    return cached.feed;
  }

  return loadStaticFeed(feedId);
}

function loadStaticFeed(feedId: FeedId): Promise<StaticGtfsFeed> {
  const pending = inflight.get(feedId);
  if (pending) {
    return pending;
  }

  const failed = lastFailure.get(feedId);
  if (failed && Date.now() - failed.at < FAILURE_COOLDOWN_MS) {
    return Promise.reject(failed.error);
  }

  const load = fetchAndParseFeed(feedId)
    .then((feed) => {
      lastFailure.delete(feedId);
      return feed;
    })
    .catch((error: Error) => {
      lastFailure.set(feedId, { at: Date.now(), error });
      throw error;
    })
    .finally(() => inflight.delete(feedId));
  inflight.set(feedId, load);
  return load;
}

async function fetchAndParseFeed(feedId: FeedId): Promise<StaticGtfsFeed> {
  // Singapore has no GTFS to download; its adapters synthesise the same shape.
  if (feedId === "sg-rail" || feedId === "sg-bus") {
    const feed = feedId === "sg-rail" ? buildSgRailFeed() : await buildSgBusFeed();
    staticCache.set(feedId, { expiresAt: Date.now() + STATIC_GTFS_TTL_MS, feed });
    return feed;
  }

  const zipBuffer = await fetchArrayBuffer(getStaticGtfsUrl(feedId));
  const zip = await JSZip.loadAsync(zipBuffer);

  const [routes, stops, trips, stopTimes, shapes, calendars, calendarExceptions, frequencies] =
    await Promise.all([
      parseGtfsFile<GtfsRoute>(zip, "routes.txt", parseRoute),
      parseGtfsFile<GtfsStop>(zip, "stops.txt", parseStop),
      parseGtfsFile<GtfsTrip>(zip, "trips.txt", parseTrip),
      parseGtfsFile<GtfsStopTime>(zip, "stop_times.txt", parseStopTime),
      parseGtfsFile<GtfsShapePoint>(zip, "shapes.txt", parseShapePoint),
      parseGtfsFile<GtfsCalendar>(zip, "calendar.txt", parseCalendar),
      parseGtfsFile<GtfsCalendarException>(zip, "calendar_dates.txt", parseCalendarDate),
      parseGtfsFile<GtfsFrequency>(zip, "frequencies.txt", parseFrequency)
    ]);

  const feed: StaticGtfsFeed = {
    loadedAt: new Date().toISOString(),
    routes: mapBy(routes, (route) => route.routeId),
    stops: mapBy(stops, (stop) => stop.stopId),
    trips: mapBy(trips, (trip) => trip.tripId),
    tripsByRouteId: groupBy(trips, (trip) => trip.routeId),
    stopTimesByTripId: groupBy(
      stopTimes.sort((a, b) => a.sequence - b.sequence),
      (stopTime) => stopTime.tripId
    ),
    shapesByShapeId: groupBy(
      shapes.sort((a, b) => a.sequence - b.sequence),
      (shape) => shape.shapeId
    ),
    calendars: mapBy(calendars, (calendar) => calendar.serviceId),
    calendarExceptions: groupBy(calendarExceptions, (exception) => exception.serviceId),
    frequenciesByTripId: groupBy(frequencies, (frequency) => frequency.tripId)
  };

  staticCache.set(feedId, {
    expiresAt: Date.now() + STATIC_GTFS_TTL_MS,
    feed
  });

  return feed;
}

export function listRoutes(feed: StaticGtfsFeed, search?: string): GtfsRoute[] {
  const normalizedSearch = search?.toLowerCase();
  const routes = [...feed.routes.values()];

  if (!normalizedSearch) {
    return routes;
  }

  return routes.filter((route) => {
    return [
      route.routeId,
      route.shortName,
      route.longName,
      route.description
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedSearch));
  });
}

export function findRouteStops(feed: StaticGtfsFeed, routeId: string): GtfsStop[] {
  return findOrderedRouteStops(feed, routeId);
}

export function findOrderedRouteStops(feed: StaticGtfsFeed, routeId: string): RouteStop[] {
  const trips = feed.tripsByRouteId.get(routeId) ?? [];
  const representativeTrip = trips
    .map((trip) => ({
      trip,
      stopTimes: feed.stopTimesByTripId.get(trip.tripId) ?? []
    }))
    .sort((a, b) => b.stopTimes.length - a.stopTimes.length)[0];

  if (!representativeTrip) {
    return [];
  }

  return representativeTrip.stopTimes
    .map((stopTime): RouteStop | undefined => {
      const stop = feed.stops.get(stopTime.stopId);
      if (!stop) {
        return undefined;
      }

      const routeStop: RouteStop = {
        ...stop,
        sequence: stopTime.sequence
      };

      if (stopTime.arrivalTime) {
        routeStop.scheduledArrival = stopTime.arrivalTime;
      }
      if (stopTime.departureTime) {
        routeStop.scheduledDeparture = stopTime.departureTime;
      }

      return routeStop;
    })
    .filter((stop): stop is RouteStop => Boolean(stop));
}

/* Groups a route's trips by direction_id and returns one pattern per direction.
   Feeds that omit direction_id collapse to a single pattern, which matches the
   old single-list behaviour. */
export function findRoutePatterns(feed: StaticGtfsFeed, routeId: string): RoutePattern[] {
  const trips = feed.tripsByRouteId.get(routeId) ?? [];
  const byDirection = new Map<string, GtfsTrip[]>();

  for (const trip of trips) {
    const key = trip.directionId ?? "0";
    const bucket = byDirection.get(key);
    if (bucket) {
      bucket.push(trip);
    } else {
      byDirection.set(key, [trip]);
    }
  }

  const patterns: RoutePattern[] = [];

  for (const [directionId, directionTrips] of [...byDirection].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  )) {
    // The longest trip is the fullest version of the pattern; short-turns and
    // partial runs would otherwise truncate the timeline.
    const representative = directionTrips
      .map((trip) => ({ trip, stopTimes: feed.stopTimesByTripId.get(trip.tripId) ?? [] }))
      .sort((a, b) => b.stopTimes.length - a.stopTimes.length)[0];

    if (!representative?.stopTimes.length) {
      continue;
    }

    const stops = representative.stopTimes
      .map((stopTime): RouteStop | undefined => {
        const stop = feed.stops.get(stopTime.stopId);
        if (!stop) {
          return undefined;
        }
        const routeStop: RouteStop = { ...stop, sequence: stopTime.sequence };
        if (stopTime.arrivalTime) {
          routeStop.scheduledArrival = stopTime.arrivalTime;
        }
        if (stopTime.departureTime) {
          routeStop.scheduledDeparture = stopTime.departureTime;
        }
        return routeStop;
      })
      .filter((stop): stop is RouteStop => Boolean(stop));

    const shapeIds = new Set(
      directionTrips
        .map((trip) => trip.shapeId)
        .filter((shapeId): shapeId is string => Boolean(shapeId))
    );
    const shapes = [...shapeIds]
      .map((shapeId) => feed.shapesByShapeId.get(shapeId))
      .filter((shape): shape is GtfsShapePoint[] => Boolean(shape?.length));

    /* KTMB ships no shapes.txt, so with no geometry anywhere in the feed the
       line is traced through its own stations instead. That is an approximation
       of the corridor, not the true track alignment, and is reported as such
       via shapeSource so the UI can say so. */
    const fromFeed = shapes.length ? shapes : findRouteShapes(feed, routeId);
    const traced = fromFeed.length ? fromFeed : traceShapeFromStops(stops);

    patterns.push({
      directionId,
      headsign: representative.trip.headsign,
      stops,
      shapes: traced,
      shapeSource: fromFeed.length ? "feed" : traced.length ? "stops" : "none"
    });
  }

  return patterns;
}

/** Straight segments between consecutive stops, for feeds without shapes.txt. */
function traceShapeFromStops(stops: RouteStop[]): GtfsShapePoint[][] {
  if (stops.length < 2) {
    return [];
  }

  return [
    stops.map((stop, index) => ({
      shapeId: "traced",
      lat: stop.lat,
      lon: stop.lon,
      sequence: index
    }))
  ];
}

export function findRouteShapes(feed: StaticGtfsFeed, routeId: string): GtfsShapePoint[][] {
  const trips = feed.tripsByRouteId.get(routeId) ?? [];
  const shapeIds = new Set(
    trips.map((trip) => trip.shapeId).filter((shapeId): shapeId is string => Boolean(shapeId))
  );

  return [...shapeIds]
    .map((shapeId) => feed.shapesByShapeId.get(shapeId))
    .filter((shape): shape is GtfsShapePoint[] => Boolean(shape?.length));
}

/* The two feeds identify routes differently. Static GTFS gives MRT feeder
   routes a numeric surrogate route_id ("30000030") and carries the public code
   ("T821") in route_long_name, while the realtime feed reports the public code
   as its route_id. Matching on route_id alone therefore discards every live
   feeder bus, so a route is matched on any identifier it is known by. */
const ROUTE_CODE_PATTERN = /^[A-Z]{0,3}\d{1,4}[A-Z]?$/i;

export function routeMatchKeys(route: GtfsRoute): Set<string> {
  const keys = new Set<string>();

  const add = (value?: string) => {
    const text = String(value ?? "").trim();
    if (text) {
      keys.add(text.toUpperCase());
    }
  };

  add(route.routeId);
  add(route.shortName);
  // Only a long name that is itself a route code — never a "A ~ B" headsign.
  if (ROUTE_CODE_PATTERN.test(String(route.longName ?? "").trim())) {
    add(route.longName);
  }

  return keys;
}

export function vehicleBelongsToRoute(
  vehicleRouteId: string | undefined,
  keys: Set<string>
): boolean {
  const value = String(vehicleRouteId ?? "").trim().toUpperCase();
  return value.length > 0 && keys.has(value);
}

export function resolveRouteIdForTrip(feed: StaticGtfsFeed, tripId?: string): string | undefined {
  if (!tripId) {
    return undefined;
  }

  const exactTrip = feed.trips.get(tripId);
  if (exactTrip) {
    return exactTrip.routeId;
  }

  const suffixMatch = [...feed.trips.values()].find((trip) => tripId.endsWith(trip.tripId));
  return suffixMatch?.routeId;
}

async function parseGtfsFile<T>(
  zip: JSZip,
  filename: string,
  rowParser: (row: Record<string, string>) => T | undefined
): Promise<T[]> {
  const file = zip.file(filename);
  if (!file) {
    return [];
  }

  const text = await file.async("text");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true
  }) as Record<string, string>[];

  return rows.map(rowParser).filter((row): row is T => Boolean(row));
}

function parseRoute(row: Record<string, string>): GtfsRoute | undefined {
  if (!row.route_id) {
    return undefined;
  }

  return {
    routeId: row.route_id,
    agencyId: row.agency_id || undefined,
    shortName: row.route_short_name || undefined,
    longName: row.route_long_name || undefined,
    description: row.route_desc || undefined,
    type: row.route_type || undefined,
    color: row.route_color || undefined,
    textColor: row.route_text_color || undefined
  };
}

function parseFrequency(row: Record<string, string>): GtfsFrequency | undefined {
  const headway = Number(row.headway_secs);
  if (!row.trip_id || !row.start_time || !row.end_time || !Number.isFinite(headway) || headway <= 0) {
    return undefined;
  }
  return {
    tripId: row.trip_id,
    startTime: row.start_time,
    endTime: row.end_time,
    headwaySeconds: headway
  };
}

function parseCalendar(row: Record<string, string>): GtfsCalendar | undefined {
  if (!row.service_id) {
    return undefined;
  }

  // days[] is indexed the way Date#getDay() is, so Sunday leads.
  return {
    serviceId: row.service_id,
    days: [
      row.sunday === "1",
      row.monday === "1",
      row.tuesday === "1",
      row.wednesday === "1",
      row.thursday === "1",
      row.friday === "1",
      row.saturday === "1"
    ],
    startDate: row.start_date || undefined,
    endDate: row.end_date || undefined
  };
}

function parseCalendarDate(row: Record<string, string>): GtfsCalendarException | undefined {
  if (!row.service_id || !row.date) {
    return undefined;
  }

  const exceptionType = row.exception_type === "2" ? 2 : 1;
  return { serviceId: row.service_id, date: row.date, exceptionType };
}

function parseStop(row: Record<string, string>): GtfsStop | undefined {
  const lat = Number(row.stop_lat);
  const lon = Number(row.stop_lon);

  if (!row.stop_id || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }

  const stop: GtfsStop = {
    stopId: row.stop_id,
    name: row.stop_name || row.stop_id,
    lat,
    lon
  };

  // The rail feed flags step-free stations; bus feeds omit the column.
  if (row.isOKU) {
    stop.accessible = row.isOKU.toLowerCase() === "true" || row.isOKU === "1";
  }

  return stop;
}

function parseTrip(row: Record<string, string>): GtfsTrip | undefined {
  if (!row.route_id || !row.trip_id) {
    return undefined;
  }

  return {
    routeId: row.route_id,
    serviceId: row.service_id || undefined,
    tripId: row.trip_id,
    headsign: row.trip_headsign || undefined,
    directionId: row.direction_id || undefined,
    shapeId: row.shape_id || undefined
  };
}

function parseStopTime(row: Record<string, string>): GtfsStopTime | undefined {
  const sequence = Number(row.stop_sequence);

  if (!row.trip_id || !row.stop_id || !Number.isFinite(sequence)) {
    return undefined;
  }

  return {
    tripId: row.trip_id,
    stopId: row.stop_id,
    sequence,
    arrivalTime: row.arrival_time || undefined,
    departureTime: row.departure_time || undefined
  };
}

function parseShapePoint(row: Record<string, string>): GtfsShapePoint | undefined {
  const lat = Number(row.shape_pt_lat);
  const lon = Number(row.shape_pt_lon);
  const sequence = Number(row.shape_pt_sequence);

  if (!row.shape_id || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(sequence)) {
    return undefined;
  }

  return {
    shapeId: row.shape_id,
    lat,
    lon,
    sequence
  };
}

function mapBy<T>(items: T[], getKey: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [getKey(item), item]));
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }

  return map;
}
