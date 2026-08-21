/* Live Singapore buses, reconstructed from arrival predictions.

   DataMall has no fleet-wide position feed; what it has is per-stop arrival
   predictions that carry each approaching bus's coordinates. So for one route
   we sample stops along its pattern, ask each for arrivals of that service,
   and de-duplicate the buses that several stops can both see. The result is a
   partial but honest picture: buses currently approaching the sampled stops. */
import type { StaticGtfsFeed, VehiclePosition } from "../types.js";
import { getBusArrival, type SgNextBus } from "./datamall.js";

const SAMPLED_STOPS = 8;
const DEDUPE_METERS = 60;
const CACHE_TTL_MS = 25 * 1000;

const cache = new Map<string, { expiresAt: number; vehicles: VehiclePosition[] }>();

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function busesOf(...entries: (SgNextBus | undefined)[]): { lat: number; lon: number; at: string }[] {
  const buses: { lat: number; lon: number; at: string }[] = [];
  for (const bus of entries) {
    const lat = Number(bus?.Latitude);
    const lon = Number(bus?.Longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0) {
      buses.push({ lat, lon, at: bus!.EstimatedArrival });
    }
  }
  return buses;
}

export async function getSgBusVehicles(
  feed: StaticGtfsFeed,
  routeId: string | undefined
): Promise<VehiclePosition[]> {
  if (!routeId) {
    // Fleet-wide positions would need thousands of per-stop calls; refuse
    // politely instead of hammering the API.
    return [];
  }

  const cached = cache.get(routeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.vehicles;
  }

  /* Sample evenly along EVERY direction's pattern — a stop only reports buses
     heading towards it, so sampling one direction made the other invisible. */
  const trips = feed.tripsByRouteId.get(routeId) ?? [];
  const patterns = trips
    .map((trip) => feed.stopTimesByTripId.get(trip.tripId) ?? [])
    .filter((stopTimes) => stopTimes.length > 0)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
  if (!patterns.length) {
    return [];
  }
  const perPattern = Math.max(2, Math.floor(SAMPLED_STOPS / patterns.length));
  const sampled = patterns.flatMap((stopTimes) => {
    const step = Math.max(1, Math.floor(stopTimes.length / perPattern));
    return stopTimes.filter((_, index) => index % step === 0).slice(0, perPattern);
  });

  const results = await Promise.all(
    sampled.map((stopTime) =>
      getBusArrival(stopTime.stopId).catch(() => [])
    )
  );

  const seen: { lat: number; lon: number; at: string }[] = [];
  for (const services of results) {
    for (const service of services) {
      if (service.ServiceNo !== routeId) continue;
      for (const bus of busesOf(service.NextBus, service.NextBus2, service.NextBus3)) {
        const duplicate = seen.some(
          (other) => haversineMeters(other.lat, other.lon, bus.lat, bus.lon) < DEDUPE_METERS
        );
        if (!duplicate) seen.push(bus);
      }
    }
  }

  const vehicles: VehiclePosition[] = seen.map((bus, index) => ({
    id: `sg:${routeId}:${index}`,
    routeId,
    timestamp: bus.at || undefined,
    position: { lat: bus.lat, lon: bus.lon }
  }));

  cache.set(routeId, { expiresAt: Date.now() + CACHE_TTL_MS, vehicles });
  return vehicles;
}

/* Per-stop arrival predictions, passed through nearly raw: LTA's ETAs are the
   best data Singapore has, and the load field ("SEA"/"SDA"/"LSD") is something
   a schedule can never know. Cached briefly per stop so a popular stop cannot
   drain the key. */
const arrivalCache = new Map<string, { expiresAt: number; services: SgStopArrival[] }>();

export type SgStopArrival = {
  service: string;
  etas: { minutes: number; load: string; monitored: boolean }[];
};

export async function getSgStopArrivals(stopCode: string): Promise<SgStopArrival[]> {
  const cached = arrivalCache.get(stopCode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.services;
  }

  const raw = await getBusArrival(stopCode);
  const now = Date.now();
  const services: SgStopArrival[] = raw
    .map((service) => ({
      service: service.ServiceNo,
      etas: [service.NextBus, service.NextBus2, service.NextBus3]
        .filter((bus) => bus?.EstimatedArrival)
        .map((bus) => ({
          minutes: Math.max(0, Math.round((Date.parse(bus.EstimatedArrival) - now) / 60000)),
          load: bus.Load || "",
          monitored: Number((bus as { Monitored?: number }).Monitored ?? 0) === 1
        }))
    }))
    .filter((service) => service.etas.length);

  arrivalCache.set(stopCode, { expiresAt: Date.now() + 20 * 1000, services });
  return services;
}
