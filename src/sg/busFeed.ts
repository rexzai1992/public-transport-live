/* Singapore buses as a synthetic GTFS feed, assembled from three DataMall
   collections: BusStops (locations), BusServices (headways per direction) and
   BusRoutes (ordered stop sequences with distances).

   DataMall has no per-trip timetable, so each direction becomes one
   frequency-expanded trip: running times are estimated from the route's
   cumulative distance at a city-bus 16 km/h, and the service window comes from
   the origin stop's weekday first/last bus. Weekend first/last variations are
   deliberately ignored in this first cut. */
import type {
  GtfsFrequency,
  GtfsRoute,
  GtfsStop,
  GtfsStopTime,
  GtfsTrip,
  StaticGtfsFeed
} from "../types.js";
import { getBusRoutes, getBusServices, getBusStops, type SgBusService } from "./datamall.js";

const SERVICE_ID = "SG-DAILY";
const BUS_KMH = 16;

/* "5-8" -> 6.5 minutes; blank -> null. */
function parseFreq(raw: string): number | null {
  const parts = String(raw || "")
    .split("-")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function headwaySeconds(service: SgBusService): number {
  const windows = [
    parseFreq(service.AM_Peak_Freq),
    parseFreq(service.AM_Offpeak_Freq),
    parseFreq(service.PM_Peak_Freq),
    parseFreq(service.PM_Offpeak_Freq)
  ].filter((value): value is number => value !== null);
  const minutes = windows.length ? windows.reduce((a, b) => a + b, 0) / windows.length : 12;
  return Math.round(minutes * 60);
}

/* "0530" -> "05:30:00"; DataMall uses "2400"+ past midnight, which GTFS
   understands natively. */
function gtfsTime(raw: string): string | null {
  const digits = String(raw || "").trim();
  if (!/^\d{4}$/.test(digits)) return null;
  return `${digits.slice(0, 2)}:${digits.slice(2)}:00`;
}

export async function buildSgBusFeed(): Promise<StaticGtfsFeed> {
  const [busStops, busServices, busRoutes] = await Promise.all([
    getBusStops(),
    getBusServices(),
    getBusRoutes()
  ]);

  const stops = new Map<string, GtfsStop>();
  for (const stop of busStops) {
    stops.set(stop.BusStopCode, {
      stopId: stop.BusStopCode,
      name: `${stop.Description} (${stop.RoadName})`,
      lat: stop.Latitude,
      lon: stop.Longitude
    });
  }

  const serviceByKey = new Map<string, SgBusService>();
  for (const service of busServices) {
    serviceByKey.set(`${service.ServiceNo}:${service.Direction}`, service);
  }

  const rowsByKey = new Map<string, typeof busRoutes>();
  for (const row of busRoutes) {
    const key = `${row.ServiceNo}:${row.Direction}`;
    const bucket = rowsByKey.get(key);
    if (bucket) bucket.push(row);
    else rowsByKey.set(key, [row]);
  }

  const routes = new Map<string, GtfsRoute>();
  const trips = new Map<string, GtfsTrip>();
  const tripsByRouteId = new Map<string, GtfsTrip[]>();
  const stopTimesByTripId = new Map<string, GtfsStopTime[]>();
  const frequenciesByTripId = new Map<string, GtfsFrequency[]>();

  for (const [key, rows] of rowsByKey) {
    rows.sort((a, b) => a.StopSequence - b.StopSequence);
    const [serviceNo, direction] = key.split(":");
    const service = serviceByKey.get(key);
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (!first || !last) continue;

    if (!routes.has(serviceNo)) {
      const origin = stops.get(first.BusStopCode)?.name ?? first.BusStopCode;
      const destination = stops.get(last.BusStopCode)?.name ?? last.BusStopCode;
      routes.set(serviceNo, {
        routeId: serviceNo,
        shortName: serviceNo,
        longName: service?.LoopDesc
          ? `Loop via ${service.LoopDesc}`
          : `${origin} → ${destination}`,
        type: "3"
      });
    }

    const tripId = `${serviceNo}:${direction}`;
    const trip: GtfsTrip = {
      routeId: serviceNo,
      tripId,
      serviceId: SERVICE_ID,
      directionId: String(Number(direction) - 1),
      headsign: stops.get(last.BusStopCode)?.name
    };
    trips.set(tripId, trip);
    const bucket = tripsByRouteId.get(serviceNo);
    if (bucket) bucket.push(trip);
    else tripsByRouteId.set(serviceNo, [trip]);

    const base = 6 * 60; // arbitrary; frequencies define real departures
    stopTimesByTripId.set(
      tripId,
      rows
        .filter((row) => stops.has(row.BusStopCode))
        .map((row, index) => {
          const minutes = base + Math.round(((row.Distance || 0) / BUS_KMH) * 60);
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
          return {
            tripId,
            stopId: row.BusStopCode,
            sequence: index + 1,
            arrivalTime: time,
            departureTime: time
          };
        })
    );

    const startTime = gtfsTime(first.WD_FirstBus) ?? "05:30:00";
    const endTime = gtfsTime(first.WD_LastBus) ?? "23:30:00";
    frequenciesByTripId.set(tripId, [
      {
        tripId,
        startTime,
        endTime,
        headwaySeconds: service ? headwaySeconds(service) : 12 * 60
      }
    ]);
  }

  return {
    loadedAt: new Date().toISOString(),
    routes,
    stops,
    trips,
    tripsByRouteId,
    stopTimesByTripId,
    shapesByShapeId: new Map(),
    calendars: new Map([
      [SERVICE_ID, { serviceId: SERVICE_ID, days: [true, true, true, true, true, true, true] }]
    ]),
    calendarExceptions: new Map(),
    frequenciesByTripId
  };
}
