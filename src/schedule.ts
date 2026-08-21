import type { GtfsStopTime, RouteStop, StaticGtfsFeed } from "./types.js";

/* GTFS static times are Malaysia local wall-clock, and service days roll past
   midnight as 24:xx / 25:xx. Everything in here works in that clock, so the
   server's own timezone never leaks into a departure time. */
const MY_TZ = "Asia/Kuala_Lumpur";
const MINUTES_PER_DAY = 24 * 60;

export type MalaysiaClock = {
  /** YYYYMMDD, matching the calendar.txt date format. */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Minutes since midnight. */
  minutes: number;
};

const DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: MY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short"
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export function malaysiaClock(now: Date = new Date()): MalaysiaClock {
  const parts = DATE_PARTS.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${get("year")}${get("month")}${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute"))
  };
}

/** "05:53:00" → 353. Past-midnight values ("25:10") stay above 1440 on purpose. */
export function gtfsTimeToMinutes(value?: string): number | undefined {
  const match = String(value ?? "").match(/^(\d{1,3}):(\d{2})/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Service ids running on the given Malaysia date, per calendar + exceptions. */
export function activeServiceIds(feed: StaticGtfsFeed, clock: MalaysiaClock): Set<string> {
  const active = new Set<string>();

  for (const calendar of feed.calendars.values()) {
    const withinWindow =
      (!calendar.startDate || calendar.startDate <= clock.date) &&
      (!calendar.endDate || calendar.endDate >= clock.date);

    if (withinWindow && calendar.days[clock.weekday]) {
      active.add(calendar.serviceId);
    }
  }

  // calendar_dates.txt overrides the weekly pattern for specific dates.
  for (const [serviceId, exceptions] of feed.calendarExceptions) {
    for (const exception of exceptions) {
      if (exception.date !== clock.date) {
        continue;
      }
      if (exception.exceptionType === 1) {
        active.add(serviceId);
      } else {
        active.delete(serviceId);
      }
    }
  }

  return active;
}

/* Every departure time at every stop on the route, gathered across all of the
   route's trips — not just one representative trip. Trips whose service isn't
   running today are dropped, unless that would leave nothing at all (some feeds
   ship no usable calendar, and a timetable beats an empty panel). */
export function buildRouteStopSchedule(
  feed: StaticGtfsFeed,
  routeId: string,
  clock: MalaysiaClock
): Map<string, number[]> {
  const trips = feed.tripsByRouteId.get(routeId) ?? [];
  const active = activeServiceIds(feed, clock);

  const runningToday = trips.filter(
    (trip) => !trip.serviceId || active.size === 0 || active.has(trip.serviceId)
  );
  const usableTrips = runningToday.length ? runningToday : trips;

  const byStop = new Map<string, Set<number>>();

  const record = (stopId: string, minutes: number) => {
    let times = byStop.get(stopId);
    if (!times) {
      times = new Set<number>();
      byStop.set(stopId, times);
    }
    times.add(minutes);
  };

  for (const trip of usableTrips) {
    const stopTimes = feed.stopTimesByTripId.get(trip.tripId) ?? [];
    const frequencies = feed.frequenciesByTripId.get(trip.tripId) ?? [];

    if (frequencies.length) {
      for (const departure of expandFrequencies(stopTimes, frequencies)) {
        record(departure.stopId, departure.minutes);
      }
      continue;
    }

    for (const stopTime of stopTimes) {
      const minutes = gtfsTimeToMinutes(stopTime.departureTime ?? stopTime.arrivalTime);
      if (minutes !== undefined) {
        record(stopTime.stopId, minutes);
      }
    }
  }

  return new Map(
    [...byStop].map(([stopId, times]) => [stopId, [...times].sort((a, b) => a - b)])
  );
}

/* Rail publishes one template trip plus headways ("every 180s, 06:00-09:00").
   The real departures are that template repeated across each window, offset by
   each stop's running time from the start of the trip. */
function expandFrequencies(
  stopTimes: GtfsStopTime[],
  frequencies: { startTime: string; endTime: string; headwaySeconds: number }[]
): { stopId: string; minutes: number }[] {
  const base = gtfsTimeToMinutes(stopTimes[0]?.departureTime ?? stopTimes[0]?.arrivalTime);
  if (base === undefined) {
    return [];
  }

  const offsets = stopTimes
    .map((stopTime) => {
      const at = gtfsTimeToMinutes(stopTime.departureTime ?? stopTime.arrivalTime);
      return at === undefined ? undefined : { stopId: stopTime.stopId, offset: at - base };
    })
    .filter((entry): entry is { stopId: string; offset: number } => entry !== undefined);

  const departures: { stopId: string; minutes: number }[] = [];

  for (const window of frequencies) {
    const start = gtfsTimeToMinutes(window.startTime);
    const end = gtfsTimeToMinutes(window.endTime);
    const headway = window.headwaySeconds / 60;
    if (start === undefined || end === undefined || headway <= 0) {
      continue;
    }

    for (let departure = start; departure < end; departure += headway) {
      for (const entry of offsets) {
        departures.push({ stopId: entry.stopId, minutes: Math.round(departure + entry.offset) });
      }
    }
  }

  return departures;
}

export function formatGtfsMinutes(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/* Wait time on a 24-hour ring: a 05:53 departure seen at 23:40 is 6h13m away,
   not "17 hours ago". Sorting by that wait puts the genuine next bus first. */
function waitMinutes(departure: number, nowMinutes: number): number {
  return (((departure - nowMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Attach each stop's real upcoming departures, soonest first. */
export function withNextDepartures(
  stops: RouteStop[],
  schedule: Map<string, number[]>,
  clock: MalaysiaClock,
  limit = 3
): RouteStop[] {
  return stops.map((stop) => {
    const times = schedule.get(stop.stopId);
    if (!times?.length) {
      return stop;
    }

    const upcoming = times
      .map((minutes) => ({ minutes, wait: waitMinutes(minutes, clock.minutes) }))
      .sort((a, b) => a.wait - b.wait)
      .slice(0, limit);

    return {
      ...stop,
      nextDepartures: upcoming.map((entry) => formatGtfsMinutes(entry.minutes)),
      nextDepartureInMinutes: upcoming[0].wait,
      // The old value came from one arbitrary trip; the next real departure is
      // what "Scheduled" should have meant all along.
      scheduledDeparture: formatGtfsMinutes(upcoming[0].minutes)
    };
  });
}
