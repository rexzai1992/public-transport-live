export type GtfsRoute = {
  routeId: string;
  agencyId?: string;
  shortName?: string;
  longName?: string;
  description?: string;
  type?: string;
  color?: string;
  textColor?: string;
};

export type GtfsStop = {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  /** From the rail feed's isOKU column; undefined when the feed omits it. */
  accessible?: boolean;
};

export type GtfsTrip = {
  routeId: string;
  serviceId?: string;
  tripId: string;
  headsign?: string;
  directionId?: string;
  shapeId?: string;
};

export type GtfsCalendar = {
  serviceId: string;
  /** Indexed by JS day-of-week: 0 = Sunday … 6 = Saturday. */
  days: boolean[];
  startDate?: string;
  endDate?: string;
};

/** calendar_dates.txt row: 1 = service added on that date, 2 = removed. */
export type GtfsCalendarException = {
  serviceId: string;
  date: string;
  exceptionType: 1 | 2;
};

/* Rapid Rail schedules headways rather than individual departures, so the real
   timetable has to be expanded from frequencies.txt. */
export type GtfsFrequency = {
  tripId: string;
  startTime: string;
  endTime: string;
  headwaySeconds: number;
};

export type GtfsShapePoint = {
  shapeId: string;
  lat: number;
  lon: number;
  sequence: number;
};

export type GtfsStopTime = {
  tripId: string;
  stopId: string;
  sequence: number;
  arrivalTime?: string;
  departureTime?: string;
};

export type RouteStop = GtfsStop & {
  sequence: number;
  scheduledArrival?: string;
  scheduledDeparture?: string;
  /** Upcoming departures at this stop across every trip running today, soonest first. */
  nextDepartures?: string[];
  /** Minutes until nextDepartures[0], measured in Malaysia local time. */
  nextDepartureInMinutes?: number;
};

/* One direction of a route: its own ordered stops and its own shape. Route 250
   has two, and merging them into a single stop list is what made its ETAs climb
   and then fall back down the same list. */
export type RoutePattern = {
  directionId: string;
  headsign?: string;
  stops: RouteStop[];
  shapes: GtfsShapePoint[][];
  /* "feed" when shapes.txt supplied the geometry, "stops" when it was traced
     between stations because the feed ships none (KTMB). */
  shapeSource: "feed" | "stops" | "none";
};

export type StaticGtfsFeed = {
  loadedAt: string;
  routes: Map<string, GtfsRoute>;
  stops: Map<string, GtfsStop>;
  trips: Map<string, GtfsTrip>;
  tripsByRouteId: Map<string, GtfsTrip[]>;
  stopTimesByTripId: Map<string, GtfsStopTime[]>;
  shapesByShapeId: Map<string, GtfsShapePoint[]>;
  calendars: Map<string, GtfsCalendar>;
  calendarExceptions: Map<string, GtfsCalendarException[]>;
  frequenciesByTripId: Map<string, GtfsFrequency[]>;
};

export type VehiclePosition = {
  id: string;
  label?: string;
  routeId?: string;
  tripId?: string;
  stopId?: string;
  bearing?: number;
  speed?: number;
  timestamp?: string;
  position: {
    lat: number;
    lon: number;
  };
};

export type StopEta = {
  stopId: string;
  etaMinutes?: number;
  vehicleId?: string;
  vehicleLabel?: string;
  distanceMeters?: number;
  method: "live-estimate" | "unavailable";
};

export type GeoJsonFeature = {
  type: "Feature";
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, unknown>;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};
