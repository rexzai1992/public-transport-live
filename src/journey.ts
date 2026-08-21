import { type FeedId, FEEDS } from "./config.js";
import { getStaticFeed } from "./gtfsStatic.js";
import { gtfsTimeToMinutes, malaysiaClock, type MalaysiaClock } from "./schedule.js";
import type { StaticGtfsFeed } from "./types.js";

/* ---------------------------------------------------------------------------
   A journey planner over the GTFS feeds.

   The network is a set of PATTERNS (one route + direction), each holding its
   ordered stops, the running-time offsets from the start of a trip, and the
   times trips begin. Rail publishes headways rather than trips, so its trips
   are the headway slots sharing one offsets array — cheap to hold and exact to
   query. Neither Prasarana nor KTMB ships transfers.txt, so interchanges are
   inferred from station names and walking distance.
--------------------------------------------------------------------------- */

const WALK_SPEED_M_PER_MIN = 80; // ~4.8 km/h
const MAX_ORIGIN_WALK_M = 1200;
const MAX_TRANSFER_WALK_M = 400;
/** Minutes added to any interchange for platform changes and boarding. */
const TRANSFER_PENALTY_MIN = 3;
const MAX_ROUNDS = 4; // up to 3 transfers
const NETWORK_TTL_MS = 6 * 60 * 60 * 1000;

export type StopRef = {
  key: string;
  feed: FeedId;
  stopId: string;
  name: string;
  lat: number;
  lon: number;
};

type Pattern = {
  feed: FeedId;
  routeId: string;
  routeName: string;
  routeColor?: string;
  headsign?: string;
  directionId?: string;
  mode: "bus" | "rail";
  stopKeys: string[];
  /** trips[i].start + offsets[j] = departure minute at stop j. */
  trips: { start: number; offsets: number[] }[];
};

type Network = {
  builtAt: number;
  serviceDay: string;
  stops: Map<string, StopRef>;
  patterns: Pattern[];
  /** stop key -> indices into patterns that serve it */
  patternsByStop: Map<string, number[]>;
  /** stop key -> walkable neighbours */
  transfers: Map<string, { key: string; minutes: number; meters: number }[]>;
};

export type WalkLeg = {
  kind: "walk";
  from: StopRef | { name: string; lat: number; lon: number };
  to: StopRef | { name: string; lat: number; lon: number };
  meters: number;
  minutes: number;
};

export type RideLeg = {
  kind: "ride";
  feed: FeedId;
  mode: "bus" | "rail";
  routeId: string;
  routeName: string;
  routeColor?: string;
  headsign?: string;
  /** Which direction of the route this leg rides, for platform lookups. */
  directionId?: string;
  from: StopRef;
  to: StopRef;
  departure: string;
  arrival: string;
  minutes: number;
  stopCount: number;
  intermediate: string[];
  /** Every stop from boarding to alighting, with its own time, so the leg can
      be drawn and read stop by stop. stopId doubles as the station code that
      appears on rail signage (KJ14, KG16, AG18). */
  path: { stopId: string; name: string; lat: number; lon: number; time: string }[];
};

export type Journey = {
  departure: string;
  arrival: string;
  totalMinutes: number;
  transfers: number;
  walkMeters: number;
  legs: (WalkLeg | RideLeg)[];
};

const networkCache = new Map<string, Network>();

/* --------------------------- network construction ----------------------- */

function stopKey(feed: FeedId, stopId: string): string {
  return `${feed}:${stopId}`;
}

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Station names differ cosmetically between lines; compare them loosely. */
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(LRT|MRT|KTM|BRT|MONORAIL|STESEN|STATION|HENTIAN)\b/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function buildPatternsForFeed(
  feedId: FeedId,
  feed: StaticGtfsFeed,
  activeServices: Set<string>,
  stops: Map<string, StopRef>
): Pattern[] {
  const patterns: Pattern[] = [];
  const mode = FEEDS[feedId].mode;

  for (const [routeId, trips] of feed.tripsByRouteId) {
    const route = feed.routes.get(routeId);
    const routeName = route?.shortName || route?.longName || routeId;

    // Group this route's trips by the stop sequence they actually serve, so a
    // short-turn does not get mixed into the full-length pattern.
    const groups = new Map<string, { trip: (typeof trips)[number]; stopIds: string[]; times: number[] }[]>();

    for (const trip of trips) {
      if (trip.serviceId && activeServices.size && !activeServices.has(trip.serviceId)) {
        continue;
      }
      const stopTimes = feed.stopTimesByTripId.get(trip.tripId) ?? [];
      if (stopTimes.length < 2) {
        continue;
      }

      const stopIds: string[] = [];
      const times: number[] = [];
      for (const stopTime of stopTimes) {
        const at = gtfsTimeToMinutes(stopTime.departureTime ?? stopTime.arrivalTime);
        if (at === undefined || !feed.stops.has(stopTime.stopId)) {
          continue;
        }
        stopIds.push(stopTime.stopId);
        times.push(at);
      }
      if (stopIds.length < 2) {
        continue;
      }

      const signature = `${trip.directionId ?? "0"}|${stopIds.join(">")}`;
      const bucket = groups.get(signature);
      if (bucket) {
        bucket.push({ trip, stopIds, times });
      } else {
        groups.set(signature, [{ trip, stopIds, times }]);
      }
    }

    for (const bucket of groups.values()) {
      const first = bucket[0];
      const keys = first.stopIds.map((stopId) => {
        const key = stopKey(feedId, stopId);
        if (!stops.has(key)) {
          const stop = feed.stops.get(stopId)!;
          stops.set(key, {
            key,
            feed: feedId,
            stopId,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon
          });
        }
        return key;
      });

      const trips: Pattern["trips"] = [];

      for (const entry of bucket) {
        const base = entry.times[0];
        const offsets = entry.times.map((t) => t - base);
        const frequencies = feed.frequenciesByTripId.get(entry.trip.tripId) ?? [];

        if (frequencies.length) {
          // Headway-based: one offsets array, many start times.
          for (const window of frequencies) {
            const start = gtfsTimeToMinutes(window.startTime);
            const end = gtfsTimeToMinutes(window.endTime);
            const headway = window.headwaySeconds / 60;
            if (start === undefined || end === undefined || headway <= 0) {
              continue;
            }
            for (let departure = start; departure < end; departure += headway) {
              trips.push({ start: Math.round(departure), offsets });
            }
          }
        } else {
          trips.push({ start: base, offsets });
        }
      }

      if (!trips.length) {
        continue;
      }

      trips.sort((a, b) => a.start - b.start);
      patterns.push({
        feed: feedId,
        routeId,
        routeName,
        routeColor: route?.color,
        headsign: first.trip.headsign,
        directionId: first.trip.directionId,
        mode,
        stopKeys: keys,
        trips
      });
    }
  }

  return patterns;
}

async function buildNetwork(feedIds: FeedId[], clock: MalaysiaClock): Promise<Network> {
  const stops = new Map<string, StopRef>();
  const patterns: Pattern[] = [];

  for (const feedId of feedIds) {
    const feed = await getStaticFeed(feedId).catch(() => null);
    if (!feed) {
      continue;
    }
    const { activeServiceIds } = await import("./schedule.js");
    const active = activeServiceIds(feed, clock);
    patterns.push(...buildPatternsForFeed(feedId, feed, active, stops));
  }

  const patternsByStop = new Map<string, number[]>();
  patterns.forEach((pattern, index) => {
    for (const key of pattern.stopKeys) {
      const list = patternsByStop.get(key);
      if (list) {
        if (list[list.length - 1] !== index) list.push(index);
      } else {
        patternsByStop.set(key, [index]);
      }
    }
  });

  /* Interchanges. Only stops that some pattern serves are worth linking, and
     they are bucketed into a coarse grid so this stays well clear of comparing
     every stop with every other one. */
  const transfers = new Map<string, { key: string; minutes: number; meters: number }[]>();
  const grid = new Map<string, StopRef[]>();
  const cell = 0.005; // ~550 m
  const served = [...stops.values()].filter((stop) => patternsByStop.has(stop.key));

  for (const stop of served) {
    const gx = Math.floor(stop.lat / cell);
    const gy = Math.floor(stop.lon / cell);
    const key = `${gx},${gy}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(stop);
    else grid.set(key, [stop]);
  }

  for (const stop of served) {
    const gx = Math.floor(stop.lat / cell);
    const gy = Math.floor(stop.lon / cell);
    const near: { key: string; minutes: number; meters: number }[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (other.key === stop.key) {
            continue;
          }
          const meters = haversineMeters(stop.lat, stop.lon, other.lat, other.lon);
          const sameName = normalizeName(stop.name) === normalizeName(other.name);
          // Same-name stations interchange even when the platforms sit apart.
          if (meters <= MAX_TRANSFER_WALK_M || (sameName && meters <= 1000)) {
            near.push({
              key: other.key,
              meters: Math.round(meters),
              minutes: Math.max(1, Math.round(meters / WALK_SPEED_M_PER_MIN)) + TRANSFER_PENALTY_MIN
            });
          }
        }
      }
    }

    if (near.length) {
      near.sort((a, b) => a.meters - b.meters);
      transfers.set(stop.key, near.slice(0, 12));
    }
  }

  return {
    builtAt: Date.now(),
    serviceDay: clock.date,
    stops,
    patterns,
    patternsByStop,
    transfers
  };
}

export async function getNetwork(feedIds: FeedId[]): Promise<Network> {
  const clock = malaysiaClock();
  const cacheKey = `${[...feedIds].sort().join(",")}|${clock.date}`;
  const cached = networkCache.get(cacheKey);
  if (cached && Date.now() - cached.builtAt < NETWORK_TTL_MS) {
    return cached;
  }
  const network = await buildNetwork(feedIds, clock);
  networkCache.set(cacheKey, network);
  return network;
}

/* ------------------------------- planning ------------------------------- */

type Label = {
  time: number;
  /** How this stop was reached, for reconstructing the itinerary. */
  via?:
    | { kind: "ride"; patternIndex: number; boardKey: string; boardTime: number; tripIndex: number }
    | { kind: "walk"; fromKey: string; meters: number; minutes: number };
};

function formatMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/** Earliest trip on a pattern departing stop index at or after `time`. */
function earliestTrip(pattern: Pattern, stopIndex: number, time: number): number {
  let lo = 0;
  let hi = pattern.trips.length - 1;
  let found = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pattern.trips[mid].start + pattern.trips[mid].offsets[stopIndex] >= time) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return found;
}

export type PlanRequest = {
  from: { lat: number; lon: number; name?: string };
  to: { lat: number; lon: number; name?: string } | { stopKey: string };
  feeds: FeedId[];
  /** Minutes since midnight MYT; defaults to now. */
  departAfter?: number;
  maxResults?: number;
};

export async function planJourney(request: PlanRequest): Promise<{
  serviceDay: string;
  departAfter: string;
  journeys: Journey[];
}> {
  const clock = malaysiaClock();
  const network = await getNetwork(request.feeds);
  const departAfter = request.departAfter ?? clock.minutes;

  // Where can we start, and where are we trying to end up?
  const origins = nearbyStops(network, request.from.lat, request.from.lon, MAX_ORIGIN_WALK_M);
  const targets = resolveTargets(network, request.to);

  if (!origins.length || !targets.size) {
    return { serviceDay: network.serviceDay, departAfter: formatMinutes(departAfter), journeys: [] };
  }

  const best = new Map<string, Label>();
  const rounds: Map<string, Label>[] = [];

  let current = new Map<string, Label>();
  for (const origin of origins) {
    const time = departAfter + origin.minutes;
    current.set(origin.stop.key, {
      time,
      via: { kind: "walk", fromKey: "__origin__", meters: origin.meters, minutes: origin.minutes }
    });
    best.set(origin.stop.key, { time });
  }
  rounds.push(current);

  for (let round = 1; round < MAX_ROUNDS && current.size; round++) {
    const improved = new Map<string, Label>();

    // Ride every pattern reachable from the stops improved last round.
    const boardable = new Map<number, { key: string; index: number; time: number }>();
    for (const [key, label] of current) {
      for (const patternIndex of network.patternsByStop.get(key) ?? []) {
        const pattern = network.patterns[patternIndex];
        const index = pattern.stopKeys.indexOf(key);
        if (index < 0 || index === pattern.stopKeys.length - 1) {
          continue;
        }
        const existing = boardable.get(patternIndex);
        if (!existing || label.time < existing.time) {
          boardable.set(patternIndex, { key, index, time: label.time });
        }
      }
    }

    for (const [patternIndex, board] of boardable) {
      const pattern = network.patterns[patternIndex];
      const tripIndex = earliestTrip(pattern, board.index, board.time);
      if (tripIndex < 0) {
        continue;
      }
      const trip = pattern.trips[tripIndex];
      const boardTime = trip.start + trip.offsets[board.index];

      for (let i = board.index + 1; i < pattern.stopKeys.length; i++) {
        const arrival = trip.start + trip.offsets[i];
        const key = pattern.stopKeys[i];
        const known = best.get(key)?.time ?? Infinity;
        if (arrival < known) {
          const label: Label = {
            time: arrival,
            via: { kind: "ride", patternIndex, boardKey: board.key, boardTime, tripIndex }
          };
          best.set(key, label);
          improved.set(key, label);
        }
      }
    }

    // Then walk from anything that improved.
    for (const [key, label] of [...improved]) {
      for (const hop of network.transfers.get(key) ?? []) {
        const arrival = label.time + hop.minutes;
        if (arrival < (best.get(hop.key)?.time ?? Infinity)) {
          const walked: Label = {
            time: arrival,
            via: { kind: "walk", fromKey: key, meters: hop.meters, minutes: hop.minutes }
          };
          best.set(hop.key, walked);
          improved.set(hop.key, walked);
        }
      }
    }

    rounds.push(improved);
    current = improved;
  }

  // Reconstruct the best itinerary for each candidate destination stop.
  const journeys: Journey[] = [];
  for (const [key, finalWalk] of targets) {
    const label = best.get(key);
    if (!label) {
      continue;
    }
    const journey = reconstruct(network, best, key, departAfter, request, finalWalk);
    if (journey) {
      journeys.push(journey);
    }
  }

  journeys.sort(
    (a, b) =>
      toMinutes(a.arrival) - toMinutes(b.arrival) ||
      a.transfers - b.transfers ||
      a.walkMeters - b.walkMeters
  );

  return {
    serviceDay: network.serviceDay,
    departAfter: formatMinutes(departAfter),
    journeys: dedupe(journeys).slice(0, request.maxResults ?? 3)
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dedupe(journeys: Journey[]): Journey[] {
  const seen = new Set<string>();
  return journeys.filter((journey) => {
    const signature = journey.legs
      .map((leg) => (leg.kind === "ride" ? `${leg.routeId}@${leg.from.stopId}>${leg.to.stopId}` : "w"))
      .join("|");
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

function nearbyStops(
  network: Network,
  lat: number,
  lon: number,
  radius: number
): { stop: StopRef; meters: number; minutes: number }[] {
  const found: { stop: StopRef; meters: number; minutes: number }[] = [];

  for (const stop of network.stops.values()) {
    if (!network.patternsByStop.has(stop.key)) {
      continue;
    }
    const meters = haversineMeters(lat, lon, stop.lat, stop.lon);
    if (meters <= radius) {
      found.push({
        stop,
        meters: Math.round(meters),
        minutes: Math.max(0, Math.round(meters / WALK_SPEED_M_PER_MIN))
      });
    }
  }

  found.sort((a, b) => a.meters - b.meters);
  return found.slice(0, 12);
}

/** Destination stops, each with the walk from it to the requested point. */
function resolveTargets(
  network: Network,
  to: PlanRequest["to"]
): Map<string, { meters: number; minutes: number } | null> {
  const targets = new Map<string, { meters: number; minutes: number } | null>();

  if ("stopKey" in to) {
    const stop = network.stops.get(to.stopKey);
    if (stop) {
      targets.set(stop.key, null);
      // Sibling platforms of the same station are equally good arrivals.
      for (const hop of network.transfers.get(stop.key) ?? []) {
        const other = network.stops.get(hop.key);
        if (other && normalizeName(other.name) === normalizeName(stop.name)) {
          targets.set(other.key, { meters: hop.meters, minutes: hop.minutes });
        }
      }
    }
    return targets;
  }

  for (const entry of nearbyStops(network, to.lat, to.lon, MAX_ORIGIN_WALK_M)) {
    targets.set(entry.stop.key, { meters: entry.meters, minutes: entry.minutes });
  }
  return targets;
}

function reconstruct(
  network: Network,
  best: Map<string, Label>,
  destinationKey: string,
  departAfter: number,
  request: PlanRequest,
  finalWalk: { meters: number; minutes: number } | null
): Journey | null {
  const legs: (WalkLeg | RideLeg)[] = [];
  let key = destinationKey;
  let guard = 0;

  while (guard++ < 40) {
    const label = best.get(key);
    if (!label?.via) {
      break;
    }

    if (label.via.kind === "walk") {
      if (label.via.fromKey === "__origin__") {
        legs.push({
          kind: "walk",
          from: {
            name: request.from.name ?? "Your location",
            lat: request.from.lat,
            lon: request.from.lon
          },
          to: network.stops.get(key)!,
          meters: label.via.meters,
          minutes: label.via.minutes
        });
        break;
      }
      legs.push({
        kind: "walk",
        from: network.stops.get(label.via.fromKey)!,
        to: network.stops.get(key)!,
        meters: label.via.meters,
        minutes: label.via.minutes
      });
      key = label.via.fromKey;
      continue;
    }

    const pattern = network.patterns[label.via.patternIndex];
    const trip = pattern.trips[label.via.tripIndex];
    const boardIndex = pattern.stopKeys.indexOf(label.via.boardKey);
    const alightIndex = pattern.stopKeys.indexOf(key);
    if (boardIndex < 0 || alightIndex <= boardIndex) {
      return null;
    }

    legs.push({
      kind: "ride",
      feed: pattern.feed,
      mode: pattern.mode,
      routeId: pattern.routeId,
      routeName: pattern.routeName,
      routeColor: pattern.routeColor,
      headsign: pattern.headsign,
      directionId: pattern.directionId,
      from: network.stops.get(label.via.boardKey)!,
      to: network.stops.get(key)!,
      departure: formatMinutes(label.via.boardTime),
      arrival: formatMinutes(trip.start + trip.offsets[alightIndex]),
      minutes: Math.round(trip.offsets[alightIndex] - trip.offsets[boardIndex]),
      stopCount: alightIndex - boardIndex,
      intermediate: pattern.stopKeys
        .slice(boardIndex + 1, alightIndex)
        .map((stop) => network.stops.get(stop)?.name ?? stop),
      path: pattern.stopKeys
        .slice(boardIndex, alightIndex + 1)
        .map((stopKeyAtIndex, offset) => {
          const stop = network.stops.get(stopKeyAtIndex);
          if (!stop) {
            return null;
          }
          return {
            stopId: stop.stopId,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
            time: formatMinutes(trip.start + trip.offsets[boardIndex + offset])
          };
        })
        .filter(
          (
            entry
          ): entry is { stopId: string; name: string; lat: number; lon: number; time: string } =>
            Boolean(entry)
        )
    });

    key = label.via.boardKey;
  }

  legs.reverse();
  if (!legs.some((leg) => leg.kind === "ride")) {
    return null;
  }

  if (finalWalk) {
    legs.push({
      kind: "walk",
      from: network.stops.get(destinationKey)!,
      to:
        "stopKey" in request.to
          ? network.stops.get(request.to.stopKey)!
          : { name: request.to.name ?? "Destination", lat: request.to.lat, lon: request.to.lon },
      meters: finalWalk.meters,
      minutes: finalWalk.minutes
    });
  }

  const arrivalMinutes = (best.get(destinationKey)?.time ?? 0) + (finalWalk?.minutes ?? 0);
  const firstRide = legs.find((leg): leg is RideLeg => leg.kind === "ride");
  const startMinutes = firstRide
    ? toMinutes(firstRide.departure) -
      (legs[0].kind === "walk" ? legs[0].minutes : 0)
    : departAfter;

  return {
    departure: formatMinutes(startMinutes),
    arrival: formatMinutes(arrivalMinutes),
    totalMinutes: Math.round(arrivalMinutes - startMinutes),
    transfers: Math.max(0, legs.filter((leg) => leg.kind === "ride").length - 1),
    walkMeters: legs.reduce((sum, leg) => sum + (leg.kind === "walk" ? leg.meters : 0), 0),
    legs
  };
}

export type NearbyDeparture = {
  feed: FeedId;
  routeId: string;
  route: string;
  headsign?: string;
  mode: "bus" | "rail";
  minutes: number;
};

export type NearbyStop = {
  key: string;
  feed: FeedId;
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  meters: number;
  departures: NearbyDeparture[];
};

/** The commuter's opening question: what leaves near me, and when. Nearest
    served stops with their next scheduled departures over the next hour and a
    half, soonest first, at most two per route so one frequent service cannot
    drown out the list. */
export async function nearbyDepartures(
  lat: number,
  lon: number,
  feeds: FeedId[],
  limit = 6
): Promise<NearbyStop[]> {
  const network = await getNetwork(feeds);
  const clock = malaysiaClock();
  const now = clock.minutes;

  const candidates: { stop: StopRef; meters: number }[] = [];
  for (const stop of network.stops.values()) {
    if (!network.patternsByStop.has(stop.key)) {
      continue;
    }
    const meters = haversineMeters(lat, lon, stop.lat, stop.lon);
    if (meters <= 1200) {
      candidates.push({ stop, meters });
    }
  }
  candidates.sort((a, b) => a.meters - b.meters);

  const result: NearbyStop[] = [];
  for (const { stop, meters } of candidates.slice(0, limit * 3)) {
    const perRoute = new Map<string, number>();
    const departures: NearbyDeparture[] = [];

    for (const patternIndex of network.patternsByStop.get(stop.key) ?? []) {
      const pattern = network.patterns[patternIndex];
      const at = pattern.stopKeys.indexOf(stop.key);
      if (at < 0) continue;
      for (const trip of pattern.trips) {
        const dep = trip.start + trip.offsets[at];
        if (dep < now || dep > now + 90) continue;
        const routeKey = `${pattern.feed}:${pattern.routeId}`;
        const seen = perRoute.get(routeKey) ?? 0;
        if (seen >= 2) continue;
        perRoute.set(routeKey, seen + 1);
        departures.push({
          feed: pattern.feed,
          routeId: pattern.routeId,
          route: pattern.routeName,
          headsign: pattern.headsign,
          mode: pattern.mode,
          minutes: dep - now
        });
      }
    }

    if (!departures.length) continue;
    departures.sort((a, b) => a.minutes - b.minutes);
    result.push({
      key: stop.key,
      feed: stop.feed,
      stopId: stop.stopId,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      meters: Math.round(meters),
      departures: departures.slice(0, 6)
    });
    if (result.length >= limit) break;
  }

  return result;
}

/** Free-text stop lookup, for choosing a destination by name. */
export async function searchStops(
  query: string,
  feeds: FeedId[],
  limit = 8
): Promise<StopRef[]> {
  const network = await getNetwork(feeds);
  const needle = normalizeName(query);
  if (!needle) {
    return [];
  }

  const scored: { stop: StopRef; score: number }[] = [];
  for (const stop of network.stops.values()) {
    if (!network.patternsByStop.has(stop.key)) {
      continue;
    }
    const name = normalizeName(stop.name);
    let score = -1;
    if (name === needle) score = 0;
    else if (name.startsWith(needle)) score = 1;
    else if (name.includes(needle)) score = 2;
    if (score >= 0) {
      scored.push({ stop, score });
    }
  }

  /* A search for "Pasar Seni" means the station, not one of eight bus platforms
     that share the name, so rail outranks bus and a plainer name outranks a
     decorated one ("PASAR SENI" over "KL2212 PASAR SENI (PLATFORM D1 - D6)"). */
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(FEEDS[a.stop.feed].mode === "bus") - Number(FEEDS[b.stop.feed].mode === "bus") ||
      a.stop.name.length - b.stop.name.length ||
      a.stop.name.localeCompare(b.stop.name)
  );

  // One entry per station, not one per platform.
  const seen = new Set<string>();
  const result: StopRef[] = [];
  for (const entry of scored) {
    const dedupeKey = normalizeName(entry.stop.name);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    result.push(entry.stop);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
