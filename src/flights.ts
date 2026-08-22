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

const positionsCache = new Map<string, { expiresAt: number; aircraft: Aircraft[] }>();

export async function getAircraft(lat: number, lon: number, radiusNm = 60): Promise<Aircraft[]> {
  const radius = Math.max(10, Math.min(250, Math.round(radiusNm / 10) * 10));
  // One cache cell per ~half degree and radius bucket: viewers share fetches.
  const cell = `${Math.round(lat * 2) / 2},${Math.round(lon * 2) / 2},${radius}`;
  const cached = positionsCache.get(cell);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.aircraft;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.adsb.lol/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/${radius}`, {
      signal: controller.signal,
      headers: { "user-agent": "public-transport-live/1.0" }
    });
    if (!response.ok) {
      throw new UpstreamError(`adsb.lol returned ${response.status}`);
    }
    const data = (await response.json()) as { ac?: Record<string, unknown>[] };
    const aircraft: Aircraft[] = (data.ac ?? [])
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
    positionsCache.set(cell, { expiresAt: Date.now() + 15 * 1000, aircraft });
    return aircraft;
  } catch (error) {
    if (cached) return cached.aircraft;
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError("Flight positions unavailable");
  } finally {
    clearTimeout(timeout);
  }
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

  let aircraft = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.adsb.lol/v2/callsign/${encodeURIComponent(transmitted)}`, {
      signal: controller.signal,
      headers: { "user-agent": "public-transport-live/1.0" }
    });
    if (response.ok) {
      const data = (await response.json()) as { ac?: Record<string, unknown>[] };
      const match = (data.ac ?? []).find((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
      if (match) {
        aircraft = {
          hex: String(match.hex ?? ""),
          callsign: String(match.flight ?? "").trim(),
          type: match.t ? String(match.t) : undefined,
          alt: Number.isFinite(match.alt_baro) ? Number(match.alt_baro) : undefined,
          gs: Number.isFinite(match.gs) ? Number(match.gs) : undefined,
          track: Number.isFinite(match.track) ? Number(match.track) : undefined,
          lat: Number(match.lat),
          lon: Number(match.lon)
        };
      }
    }
  } catch {
    /* not airborne or not tracked — the route may still be worth returning */
  } finally {
    clearTimeout(timeout);
  }

  return { route, aircraft };
}
