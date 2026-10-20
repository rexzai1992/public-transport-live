/* Speed units are per feed (src/providers/profiles.ts): Malaysian feeds publish
   km/h, while most GTFS-Realtime feeds follow the spec's m/s. */
import { speedToMpsForFeed } from "./providers/profiles.js";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
  type FeedId,
  feedDefinition,
  REALTIME_GTFS_TTL_MS
} from "./config.js";
import { fetchArrayBuffer } from "./http.js";
import { resolveRouteIdForTrip } from "./gtfsStatic.js";
import { getSgBusVehicles } from "./sg/vehicles.js";
import type { StaticGtfsFeed, VehiclePosition } from "./types.js";

type RealtimeCacheEntry = {
  expiresAt: number;
  vehicles: VehiclePosition[];
};

const realtimeCache = new Map<FeedId, RealtimeCacheEntry>();

export function getRealtimeVehicleUrl(feedId: FeedId): string | null {
  return feedDefinition(feedId).realtimeUrl;
}

export function hasRealtime(feedId: FeedId): boolean {
  return feedDefinition(feedId).realtimeUrl !== null;
}

export async function getVehiclePositions(
  feedId: FeedId,
  staticFeed?: StaticGtfsFeed,
  routeId?: string
): Promise<VehiclePosition[]> {
  /* Singapore has no position feed; buses are reconstructed per route from
     arrival predictions, so the route must be known up front. */
  if (feedId === "sg-bus") {
    return staticFeed ? getSgBusVehicles(staticFeed, routeId) : [];
  }

  const url = getRealtimeVehicleUrl(feedId);
  // Rapid Rail publishes no vehicle positions; there is nothing to fetch.
  if (!url) {
    return [];
  }

  const cached = realtimeCache.get(feedId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.vehicles;
  }

  const buffer = await fetchArrayBuffer(url);
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(buffer)
  );

  const headerSeconds = Number(feed.header.timestamp || 0);

  const vehicles = feed.entity
    .map((entity) => entity.vehicle)
    .filter((vehicle): vehicle is NonNullable<typeof vehicle> => Boolean(vehicle?.position))
    .map((vehicle, index) => {
      const tripId = vehicle.trip?.tripId || undefined;
      const routeId = vehicle.trip?.routeId || (
        staticFeed ? resolveRouteIdForTrip(staticFeed, tripId) : undefined
      );
      const timestampSeconds = plausibleTimestampSeconds(
        Number(vehicle.timestamp || 0),
        headerSeconds
      );

      return {
        id: vehicle.vehicle?.id || vehicle.vehicle?.label || tripId || `vehicle-${index}`,
        label: vehicle.vehicle?.label || undefined,
        routeId: routeId || undefined,
        tripId: tripId || undefined,
        stopId: vehicle.stopId || undefined,
        bearing: normalizeNumber(vehicle.position?.bearing),
        speed: speedToMpsForFeed(feedId, normalizeNumber(vehicle.position?.speed)),
        timestamp: timestampSeconds > 0 ? new Date(timestampSeconds * 1000).toISOString() : undefined,
        position: {
          lat: Number(vehicle.position!.latitude),
          lon: Number(vehicle.position!.longitude)
        }
      };
    })
    .filter((vehicle) => {
      return Number.isFinite(vehicle.position.lat) && Number.isFinite(vehicle.position.lon);
    });

  realtimeCache.set(feedId, {
    expiresAt: Date.now() + REALTIME_GTFS_TTL_MS,
    vehicles
  });

  return vehicles;
}

function normalizeNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/* A few vehicles report a corrupt clock — one KL feeder bus publishes a
   timestamp years in the future, which would read as negative age and so never
   trip the staleness check, leaving a dead vehicle looking permanently fresh.
   Anything outside a sane window falls back to the feed's own header time. */
const FUTURE_TOLERANCE_SECONDS = 5 * 60;
const PAST_TOLERANCE_SECONDS = 24 * 60 * 60;

function plausibleTimestampSeconds(vehicleSeconds: number, headerSeconds: number): number {
  const nowSeconds = Date.now() / 1000;
  const reference = headerSeconds > 0 ? headerSeconds : nowSeconds;

  if (
    vehicleSeconds > 0 &&
    vehicleSeconds - nowSeconds <= FUTURE_TOLERANCE_SECONDS &&
    nowSeconds - vehicleSeconds <= PAST_TOLERANCE_SECONDS
  ) {
    return vehicleSeconds;
  }

  return reference;
}
