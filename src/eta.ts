import type { GtfsShapePoint, RouteStop, StopEta, VehiclePosition } from "./types.js";

const FALLBACK_BUS_SPEED_MPS = 6.1;
const MIN_BUS_SPEED_MPS = 3.5;
const MAX_ETA_MINUTES = 180;

type ShapeIndexPoint = {
  lat: number;
  lon: number;
  distanceMeters: number;
};

export function buildStopEtas(
  stops: RouteStop[],
  shapes: GtfsShapePoint[][],
  vehicles: VehiclePosition[]
): Map<string, StopEta> {
  const shapeIndexes = shapes.map(buildShapeIndex).filter((shape) => shape.length > 1);
  const etaByStop = new Map<string, StopEta>();

  for (const stop of stops) {
    const stopEta = estimateStopEta(stop, shapeIndexes, vehicles);
    etaByStop.set(stop.stopId, stopEta);
  }

  return etaByStop;
}

/* Which scheduled trips have already been carried past which stops, judged by
   projecting each reporting vehicle onto the pattern shape. 150 m of buffer:
   GPS wobble at the stop itself must not cancel a bus that is still there. */
export function buildPassedTrips(
  stops: RouteStop[],
  shapes: GtfsShapePoint[][],
  vehicles: VehiclePosition[]
): Map<string, Set<string>> {
  const passed = new Map<string, Set<string>>();
  const shapeIndexes = shapes.map(buildShapeIndex).filter((shape) => shape.length > 1);
  const withTrip = vehicles.filter((vehicle) => vehicle.tripId);
  if (!withTrip.length || !shapeIndexes.length) {
    return passed;
  }

  for (const shape of shapeIndexes) {
    const vehicleDistances = withTrip
      .map((vehicle) => {
        const projection = projectToShape(vehicle.position.lat, vehicle.position.lon, shape);
        return projection ? { tripId: vehicle.tripId!, at: projection.distanceMeters } : null;
      })
      .filter((entry): entry is { tripId: string; at: number } => entry !== null);
    if (!vehicleDistances.length) continue;

    for (const stop of stops) {
      const stopProjection = projectToShape(stop.lat, stop.lon, shape);
      if (!stopProjection) continue;
      for (const vehicle of vehicleDistances) {
        if (vehicle.at > stopProjection.distanceMeters + 150) {
          let set = passed.get(stop.stopId);
          if (!set) {
            set = new Set();
            passed.set(stop.stopId, set);
          }
          set.add(vehicle.tripId);
        }
      }
    }
  }
  return passed;
}

function estimateStopEta(
  stop: RouteStop,
  shapeIndexes: ShapeIndexPoint[][],
  vehicles: VehiclePosition[]
): StopEta {
  let best: StopEta | undefined;

  for (const shape of shapeIndexes) {
    const stopProjection = projectToShape(stop.lat, stop.lon, shape);
    if (!stopProjection) {
      continue;
    }

    for (const vehicle of vehicles) {
      const vehicleProjection = projectToShape(vehicle.position.lat, vehicle.position.lon, shape);
      if (!vehicleProjection) {
        continue;
      }

      const distanceMeters = stopProjection.distanceMeters - vehicleProjection.distanceMeters;
      if (distanceMeters < 0) {
        continue;
      }

      const speedMps = Math.max(vehicle.speed || FALLBACK_BUS_SPEED_MPS, MIN_BUS_SPEED_MPS);
      const etaMinutes = Math.ceil(distanceMeters / speedMps / 60);

      if (etaMinutes > MAX_ETA_MINUTES) {
        continue;
      }

      if (!best || etaMinutes < (best.etaMinutes ?? Number.POSITIVE_INFINITY)) {
        best = {
          stopId: stop.stopId,
          etaMinutes,
          vehicleId: vehicle.id,
          vehicleLabel: vehicle.label,
          distanceMeters: Math.round(distanceMeters),
          method: "live-estimate"
        };
      }
    }
  }

  return best ?? {
    stopId: stop.stopId,
    method: "unavailable"
  };
}

function buildShapeIndex(shape: GtfsShapePoint[]): ShapeIndexPoint[] {
  let distanceMeters = 0;

  return shape.map((point, index) => {
    if (index > 0) {
      const previous = shape[index - 1]!;
      distanceMeters += haversineMeters(previous.lat, previous.lon, point.lat, point.lon);
    }

    return {
      lat: point.lat,
      lon: point.lon,
      distanceMeters
    };
  });
}

function projectToShape(
  lat: number,
  lon: number,
  shape: ShapeIndexPoint[]
): { distanceMeters: number; offRouteMeters: number } | undefined {
  let best: { distanceMeters: number; offRouteMeters: number } | undefined;

  for (let index = 1; index < shape.length; index += 1) {
    const start = shape[index - 1]!;
    const end = shape[index]!;
    const segmentMeters = haversineMeters(start.lat, start.lon, end.lat, end.lon);
    if (segmentMeters === 0) {
      continue;
    }

    const projected = projectPointToSegment(lat, lon, start, end);
    const distanceMeters = start.distanceMeters + segmentMeters * projected.t;

    if (!best || projected.offRouteMeters < best.offRouteMeters) {
      best = {
        distanceMeters,
        offRouteMeters: projected.offRouteMeters
      };
    }
  }

  return best;
}

function projectPointToSegment(
  lat: number,
  lon: number,
  start: ShapeIndexPoint,
  end: ShapeIndexPoint
): { t: number; offRouteMeters: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const pointX = lon * metersPerDegreeLon;
  const pointY = lat * metersPerDegreeLat;
  const startX = start.lon * metersPerDegreeLon;
  const startY = start.lat * metersPerDegreeLat;
  const endX = end.lon * metersPerDegreeLon;
  const endY = end.lat * metersPerDegreeLat;
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  const rawT = lengthSquared === 0 ? 0 : ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared;
  const t = Math.min(1, Math.max(0, rawT));
  const projectedX = startX + dx * t;
  const projectedY = startY + dy * t;

  return {
    t,
    offRouteMeters: Math.hypot(pointX - projectedX, pointY - projectedY)
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusMeters = 6_371_000;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radiusMeters * c;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
