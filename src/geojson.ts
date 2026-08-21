import type {
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GtfsRoute,
  GtfsShapePoint,
  RouteStop,
  StopEta,
  VehiclePosition
} from "./types.js";

export function buildRouteMapGeoJson(
  route: GtfsRoute,
  shapes: GtfsShapePoint[][],
  stops: RouteStop[],
  vehicles: VehiclePosition[],
  stopEtas: Map<string, StopEta> = new Map()
): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      ...shapes.map((shape, index): GeoJsonFeature => {
        return {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: shape.map((point) => [point.lon, point.lat])
          },
          properties: {
            kind: "route-shape",
            routeId: route.routeId,
            shortName: route.shortName,
            longName: route.longName,
            shapeIndex: index
          }
        };
      }),
      ...stops.map((stop): GeoJsonFeature => {
        const eta = stopEtas.get(stop.stopId);

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [stop.lon, stop.lat]
          },
          properties: {
            kind: "stop",
            stopId: stop.stopId,
            name: stop.name,
            routeId: route.routeId,
            sequence: stop.sequence,
            accessible: stop.accessible,
            scheduledArrival: stop.scheduledArrival,
            scheduledDeparture: stop.scheduledDeparture,
            nextDepartures: stop.nextDepartures,
            nextDepartureInMinutes: stop.nextDepartureInMinutes,
            etaMinutes: eta?.etaMinutes,
            etaVehicleId: eta?.vehicleId,
            etaVehicleLabel: eta?.vehicleLabel,
            etaDistanceMeters: eta?.distanceMeters,
            etaMethod: eta?.method ?? "unavailable"
          }
        };
      }),
      ...vehicles.map((vehicle): GeoJsonFeature => {
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [vehicle.position.lon, vehicle.position.lat]
          },
          properties: {
            kind: "vehicle",
            id: vehicle.id,
            label: vehicle.label,
            routeId: vehicle.routeId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            bearing: vehicle.bearing,
            speed: vehicle.speed,
            timestamp: vehicle.timestamp
          }
        };
      })
    ]
  };
}
