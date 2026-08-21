/* Singapore MRT & LRT as a synthetic GTFS feed.

   LTA publishes no train positions and no trip-level timetable, so the lines
   are modelled the way Rapid Rail KL already is: an ordered station sequence
   per line, a nominal two minutes per hop, and frequencies.txt-style headways
   expanded by the existing schedule and journey machinery. Station sequences
   are curated; coordinates come from LTA's own station-exit dataset. */
import type {
  GtfsFrequency,
  GtfsRoute,
  GtfsStop,
  GtfsStopTime,
  GtfsTrip,
  StaticGtfsFeed
} from "../types.js";
import { SG_RAIL_LINES } from "./data/railNetwork.js";

const MINUTES_PER_HOP = 2;
const SERVICE_ID = "SG-DAILY";
const FIRST_TRAIN = "05:30:00";
const LAST_TRAIN = "23:45:00";

function hhmmss(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function buildSgRailFeed(): StaticGtfsFeed {
  const routes = new Map<string, GtfsRoute>();
  const stops = new Map<string, GtfsStop>();
  const trips = new Map<string, GtfsTrip>();
  const tripsByRouteId = new Map<string, GtfsTrip[]>();
  const stopTimesByTripId = new Map<string, GtfsStopTime[]>();
  const frequenciesByTripId = new Map<string, GtfsFrequency[]>();

  for (const [lineId, line] of Object.entries(SG_RAIL_LINES)) {
    routes.set(lineId, {
      routeId: lineId,
      shortName: lineId,
      longName: line.name,
      type: line.kind === "LRT" ? "0" : "1",
      color: line.color
    });

    for (const station of line.stations) {
      // Interchanges appear once per line, so lines transfer at zero-metre
      // walks without any special casing in the planner.
      stops.set(`${lineId}:${station.code}`, {
        stopId: `${lineId}:${station.code}`,
        name: `${station.name} (${station.code})`,
        lat: station.lat,
        lon: station.lon,
        accessible: true
      });
    }

    const headwaySeconds = Math.round(((line.headway[0] + line.headway[1]) / 2) * 60);
    const directions: GtfsTrip[] = [];

    for (const directionId of ["0", "1"] as const) {
      const ordered = directionId === "0" ? line.stations : [...line.stations].reverse();
      const tripId = `${lineId}:${directionId}`;
      const trip: GtfsTrip = {
        routeId: lineId,
        tripId,
        serviceId: SERVICE_ID,
        directionId,
        headsign: ordered[ordered.length - 1].name
      };
      trips.set(tripId, trip);
      directions.push(trip);

      const base = 5 * 60 + 30;
      stopTimesByTripId.set(
        tripId,
        ordered.map((station, index) => ({
          tripId,
          stopId: `${lineId}:${station.code}`,
          sequence: index + 1,
          arrivalTime: hhmmss(base + index * MINUTES_PER_HOP),
          departureTime: hhmmss(base + index * MINUTES_PER_HOP)
        }))
      );

      frequenciesByTripId.set(tripId, [
        { tripId, startTime: FIRST_TRAIN, endTime: LAST_TRAIN, headwaySeconds }
      ]);
    }

    tripsByRouteId.set(lineId, directions);
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
