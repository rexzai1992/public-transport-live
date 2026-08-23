/* A nice-to-have, not a transit mode: live aircraft over the region, with
   route and ETA when known. Two community sources, both keyless —
   adsb.lol for positions, adsbdb for callsign → route. Proxied so the
   browser stays same-origin, responses stay cached, and neither community
   service gets hammered by every open tab. No SLA on either; the layer
   degrades to nothing rather than erroring the app. */
import { UpstreamError } from "./http.js";

type Aircraft = {
  hex: string;
  callsign: string;
  type?: string;
  alt?: number;
  gs?: number;
  track?: number;
  lat: number;
  lon: number;
};

/* Two interchangeable position providers with the same readsb schema.
   adsb.lol is first choice but refuses connections from some datacenter IPs
   (it worked from a laptop and returned nothing but hangs from the VPS);
   adsb.fi accepts them but asks for ~1 request/second, so calls to it are
   queued rather than fired in parallel. The working provider sticks; the
   preferred one is retried every few minutes. */
const PROVIDERS = [
  {
    name: "adsb.lol",
    point: (lat: number, lon: number, r: number) =>
      `https://api.adsb.lol/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/${r}`,
    callsign: (cs: string) => `https://api.adsb.lol/v2/callsign/${encodeURIComponent(cs)}`,
    serial: false
  },
  {
    name: "adsb.fi",
    point: (lat: number, lon: number, r: number) =>
      `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(2)}/lon/${lon.toFixed(2)}/dist/${r}`,
    callsign: (cs: string) => `https://opendata.adsb.fi/api/v2/callsign/${encodeURIComponent(cs)}`,
    serial: true
  }
];

let providerIndex = 0;
let retryPreferredAt = 0;

/* One request at a time for providers that ask for it. */
let serialChain: Promise<unknown> = Promise.resolve();

function fetchUpstream(url: string, serial: boolean): Promise<Response> {
  const run = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": "public-transport-live/1.0" }
      });
    } finally {
      clearTimeout(timeout);
    }
  };
  if (!serial) return run();
  const next = serialChain.then(run, run);
  serialChain = next.then(
    () => new Promise((resolve) => setTimeout(resolve, 1100)),
    () => undefined
  );
  return next as Promise<Response>;
}

async function providerFetch(kind: "point" | "callsign", ...args: (string | number)[]): Promise<{ ac?: Record<string, unknown>[] }> {
  if (providerIndex !== 0 && Date.now() > retryPreferredAt) {
    providerIndex = 0; // give the preferred provider another chance
    // Stamp first so nine parallel tile calls produce ONE probe, not nine
    // 8-second timeouts in lockstep every retry window.
    retryPreferredAt = Date.now() + 5 * 60 * 1000;
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < PROVIDERS.length; attempt++) {
    const provider = PROVIDERS[providerIndex];
    const url =
      kind === "point"
        ? provider.point(Number(args[0]), Number(args[1]), Number(args[2]))
        : provider.callsign(String(args[0]));
    try {
      const response = await fetchUpstream(url, provider.serial);
      if (!response.ok) throw new UpstreamError(`${provider.name} returned ${response.status}`);
      const raw = (await response.json()) as { ac?: Record<string, unknown>[]; aircraft?: Record<string, unknown>[] };
      // Same readsb data, different envelope: adsb.lol says "ac",
      // adsb.fi says "aircraft". Miss this and the failover "succeeds"
      // with permanently empty skies.
      return { ac: raw.ac ?? raw.aircraft ?? [] };
    } catch (error) {
      lastError = error;
      providerIndex = (providerIndex + 1) % PROVIDERS.length;
      if (providerIndex !== 0) retryPreferredAt = Date.now() + 5 * 60 * 1000;
    }
  }
  throw lastError instanceof UpstreamError ? lastError : new UpstreamError("Flight positions unavailable");
}

function toAircraft(rows: Record<string, unknown>[]): Aircraft[] {
  return rows
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
    .map((a) => ({
      hex: String(a.hex ?? ""),
      callsign: String(a.flight ?? "").trim(),
      type: a.t ? String(a.t) : undefined,
      alt: Number.isFinite(a.alt_baro) ? Number(a.alt_baro) : undefined,
      gs: Number.isFinite(a.gs) ? Number(a.gs) : undefined,
      track: Number.isFinite(a.track) ? Number(a.track) : undefined,
      lat: Number(a.lat),
      lon: Number(a.lon)
    }));
}

const positionsCache = new Map<string, { expiresAt: number; aircraft: Aircraft[] }>();
const inFlight = new Map<string, Promise<Aircraft[]>>();

/* Both flight caches only ever gained keys — every map cell viewed and every
   callsign looked up stayed in memory forever. Small per entry, unbounded in
   count. A sweep drops expired cells, and the route table is capped. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of positionsCache) {
    if (entry.expiresAt < now) positionsCache.delete(key);
  }
  if (routeCache.size > 4000) {
    // Oldest-inserted first: Map preserves insertion order.
    const drop = routeCache.size - 3000;
    let n = 0;
    for (const key of routeCache.keys()) {
      routeCache.delete(key);
      if (++n >= drop) break;
    }
  }
}, 5 * 60 * 1000).unref();

export async function getAircraft(lat: number, lon: number, radiusNm = 60): Promise<Aircraft[]> {
  const radius = Math.max(10, Math.min(250, Math.round(radiusNm / 10) * 10));
  // One cache cell per ~half degree and radius bucket: viewers share fetches,
  // and simultaneous misses for one cell coalesce into a single upstream call.
  const cell = `${Math.round(lat * 2) / 2},${Math.round(lon * 2) / 2},${radius}`;
  const cached = positionsCache.get(cell);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.aircraft;
  }
  const pending = inFlight.get(cell);
  if (pending) return pending;

  const work = (async () => {
    try {
      const data = await providerFetch("point", lat, lon, radius);
      const aircraft = toAircraft(data.ac ?? []);
      positionsCache.set(cell, { expiresAt: Date.now() + 15 * 1000, aircraft });
      return aircraft;
    } catch (error) {
      if (cached) return cached.aircraft;
      throw error;
    } finally {
      inFlight.delete(cell);
    }
  })();
  inFlight.set(cell, work);
  return work;
}

type FlightRoute = {
  airline?: string;
  flight?: string;
  icao?: string;
  from?: { iata: string; city: string; lat: number; lon: number };
  to?: { iata: string; city: string; lat: number; lon: number };
};

/* Callsign → route barely changes; hits and misses both cache for the
   process lifetime so adsbdb sees each callsign once. */
const routeCache = new Map<string, FlightRoute | null>();

export async function getFlightRoute(callsign: string): Promise<FlightRoute | null> {
  if (routeCache.has(callsign)) {
    return routeCache.get(callsign) ?? null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
      signal: controller.signal,
      headers: { "user-agent": "public-transport-live/1.0" }
    });
    if (!response.ok) {
      routeCache.set(callsign, null);
      return null;
    }
    const data = (await response.json()) as {
      response?: {
        flightroute?: {
          callsign_iata?: string;
          callsign_icao?: string;
          airline?: { name?: string };
          origin?: { iata_code?: string; municipality?: string; latitude?: number; longitude?: number };
          destination?: { iata_code?: string; municipality?: string; latitude?: number; longitude?: number };
        };
      };
    };
    const fr = data.response?.flightroute;
    const route: FlightRoute | null = fr
      ? {
          airline: fr.airline?.name,
          flight: fr.callsign_iata,
          icao: fr.callsign_icao,
          from: fr.origin?.iata_code
            ? {
                iata: fr.origin.iata_code,
                city: fr.origin.municipality ?? "",
                lat: Number(fr.origin.latitude),
                lon: Number(fr.origin.longitude)
              }
            : undefined,
          to: fr.destination?.iata_code
            ? {
                iata: fr.destination.iata_code,
                city: fr.destination.municipality ?? "",
                lat: Number(fr.destination.latitude),
                lon: Number(fr.destination.longitude)
              }
            : undefined
        }
      : null;
    routeCache.set(callsign, route);
    return route;
  } catch {
    return null; // transient failure: do not poison the cache
  } finally {
    clearTimeout(timeout);
  }
}

/* Search any flight worldwide: resolve the route first (adsbdb accepts both
   "SQ432" and "SIA432"), then look for the aircraft globally under its
   transmitted ICAO callsign. Either half can be missing: a real flight may
   not be airborne, an airborne freighter may have no published route. */
export async function findFlight(callsign: string) {
  const wanted = callsign.toUpperCase().replace(/\s+/g, "");
  const route = await getFlightRoute(wanted);
  const transmitted = route?.icao || wanted;

  let aircraft: Aircraft | null = null;
  try {
    const data = await providerFetch("callsign", transmitted);
    aircraft = toAircraft(data.ac ?? [])[0] ?? null;
  } catch {
    /* not airborne or not tracked — the route may still be worth returning */
  }

  return { route, aircraft };
}
