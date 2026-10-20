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

/** "05:53:00" → 353. Past-midnight values ("25:10") stay above 1440 on purpose.
    Malformed times ("25:61", "99:00:00", "08:00junk") are undefined: a service
    day runs at most a day past its own midnight. */
export function gtfsTimeToMinutes(value?: string): number | undefined {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match || Number(match[1]) >= 48) {
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

/** The calendar day before `clock.date`, with `minutes` restated on that
    day's service clock (00:20 today = 24:20 yesterday). Month, year and leap-day
    boundaries come from Date.UTC, so the server's timezone never matters. */
export function previousServiceDayClock(clock: MalaysiaClock): MalaysiaClock {
  const year = Number(clock.date.slice(0, 4));
  const month = Number(clock.date.slice(4, 6));
  const day = Number(clock.date.slice(6, 8));
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  const date =
    String(previous.getUTCFullYear()).padStart(4, "0") +
    String(previous.getUTCMonth() + 1).padStart(2, "0") +
    String(previous.getUTCDate()).padStart(2, "0");
  return { date, weekday: (clock.weekday + 6) % 7, minutes: clock.minutes + MINUTES_PER_DAY };
}

/* Every departure time at every stop on the route, gathered across all of the
   route's trips — not just one representative trip. Trips whose service isn't
   running today are dropped, unless that would leave nothing at all (some feeds
   ship no usable calendar, and a timetable beats an empty panel). */
export type ScheduledDeparture = { minutes: number; tripId?: string };

/* The map holds today's service day exactly as published (24:xx stays 24:xx,
   which is what the route page's timetable wants). Yesterday's service trips
   that are still running after midnight ride along separately, already shifted
   onto today's clock (yesterday 24:30 -> 30), so only withNextDepartures sees
   them and a service-day timetable is never polluted. */
export type RouteStopSchedule = Map<string, ScheduledDeparture[]> & {
  previousServiceDay?: Map<string, ScheduledDeparture[]>;
  /** The route has no trip on this service day while other services do run:
      the map holds its usual timetable for reference, not today's departures. */
  notRunningToday?: boolean;
};

/** Trips of `routeId` that run on `clock.date`. With `fallBack`, all of the
    route's trips when none do (the service-day timetable's long-standing rule). */
function tripsForServiceDay(
  feed: StaticGtfsFeed,
  routeId: string,
  clock: MalaysiaClock,
  fallBack: boolean
) {
  const trips = feed.tripsByRouteId.get(routeId) ?? [];
  const active = activeServiceIds(feed, clock);
  const running = trips.filter(
    (trip) => !trip.serviceId || active.size === 0 || active.has(trip.serviceId)
  );
  const fellBack = !running.length && fallBack && trips.length > 0;
  return { trips: fellBack ? trips : running, fellBack };
}

function collectDepartures(
  feed: StaticGtfsFeed,
  trips: { tripId: string }[],
  keep: (minutes: number) => boolean = () => true,
  shift = 0
): Map<string, ScheduledDeparture[]> {
  /* minutes -> tripId, per stop. The tripId lets live vehicle positions
     cancel a specific departure once its bus has demonstrably gone past. */
  const byStop = new Map<string, Map<number, string | undefined>>();

  const record = (stopId: string, minutes: number, tripId?: string) => {
    if (!keep(minutes)) {
      return;
    }
    let times = byStop.get(stopId);
    if (!times) {
      times = new Map<number, string | undefined>();
      byStop.set(stopId, times);
    }
    if (!times.has(minutes + shift)) {
      times.set(minutes + shift, tripId);
    }
  };

  for (const trip of trips) {
    const stopTimes = feed.stopTimesByTripId.get(trip.tripId) ?? [];
    const frequencies = feed.frequenciesByTripId.get(trip.tripId) ?? [];

    if (frequencies.length) {
      // Headway-expanded departures share one template trip; a single live
      // vehicle cannot cancel them individually, so they carry no tripId.
      for (const departure of expandFrequencies(stopTimes, frequencies)) {
        record(departure.stopId, departure.minutes);
      }
      continue;
    }

    for (const stopTime of stopTimes) {
      const minutes = gtfsTimeToMinutes(stopTime.departureTime ?? stopTime.arrivalTime);
      if (minutes !== undefined) {
        record(stopTime.stopId, minutes, trip.tripId);
      }
    }
  }

  return new Map(
    [...byStop].map(([stopId, times]) => [
      stopId,
      [...times].map(([minutes, tripId]) => ({ minutes, tripId })).sort((a, b) => a.minutes - b.minutes)
    ])
  );
}

export function buildRouteStopSchedule(
  feed: StaticGtfsFeed,
  routeId: string,
  clock: MalaysiaClock
): RouteStopSchedule {
  const today = tripsForServiceDay(feed, routeId, clock, true);
  const schedule: RouteStopSchedule = collectDepartures(feed, today.trips);
  if (today.fellBack) {
    schedule.notRunningToday = true;
  }

  /* Yesterday's trips at 24:00 or later are tonight's after-midnight service.
     No fallback here: "nothing ran yesterday" must not turn a Saturday-only
     24:30 into a Friday-night departure. (A feed with no usable calendar still
     counts every trip, via activeServiceIds coming back empty.) */
  const yesterday = previousServiceDayClock(clock);
  const carryOver = collectDepartures(
    feed,
    tripsForServiceDay(feed, routeId, yesterday, false).trips,
    (minutes) => minutes >= MINUTES_PER_DAY,
    -MINUTES_PER_DAY
  );
  if (carryOver.size) {
    schedule.previousServiceDay = carryOver;
  }
  return schedule;
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
    if (start === undefined || end === undefined || !(headway >= 0.5)) {
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

/** Attach each stop's real upcoming departures, soonest first.

    Everything is measured on today's clock: today's service at its published
    minutes (24:30 = 00:30 tomorrow, so ~24h away just after midnight), and
    yesterday's after-midnight service shifted to 00:xx. Departures already gone
    are skipped. Today's timetable also stands in for tomorrow's (+24h), so
    after the last service the first one tomorrow still shows, as before. */
export function withNextDepartures(
  stops: RouteStop[],
  schedule: RouteStopSchedule,
  clock: MalaysiaClock,
  limit = 3,
  /* Trips a live vehicle has already carried PAST the stop. Buses run early
     as well as late; a timetable row for a bus that is visibly gone is a lie,
     so those departures are dropped rather than shown as a wait. */
  passedTrips?: Map<string, Set<string>>
): RouteStop[] {
  return stops.map((stop) => {
    const passed = passedTrips?.get(stop.stopId);
    const notPassed = (entry: ScheduledDeparture) => !(entry.tripId && passed?.has(entry.tripId));
    /* A route that doesn't run today has no departures today, and its usual
       timetable is no promise for tomorrow either. */
    const today = schedule.notRunningToday ? [] : schedule.get(stop.stopId)?.filter(notPassed) ?? [];
    const carried = schedule.previousServiceDay?.get(stop.stopId)?.filter(notPassed) ?? [];
    if (!today.length && !carried.length) {
      return stop;
    }

    const now = clock.minutes;
    const seen = new Set<number>();
    const candidates: number[] = [];
    const consider = (at: number) => {
      if (at >= now && !seen.has(at)) {
        seen.add(at);
        candidates.push(at);
      }
    };
    for (const entry of carried) consider(entry.minutes);
    for (const entry of today) consider(entry.minutes);
    // Tomorrow, approximated by today's timetable.
    for (const entry of today) {
      if (entry.minutes < MINUTES_PER_DAY) consider(entry.minutes + MINUTES_PER_DAY);
    }

    /* One entry per clock time: a once-a-day bus seen after midnight would
       otherwise read "15:26, 15:26" (today's, then tomorrow's copy). */
    const shown = new Set<string>();
    const upcoming = candidates
      .sort((a, b) => a - b)
      .filter((minutes) => {
        const label = formatGtfsMinutes(minutes);
        if (shown.has(label)) return false;
        shown.add(label);
        return true;
      })
      .slice(0, limit);
    if (!upcoming.length) {
      return stop;
    }

    return {
      ...stop,
      nextDepartures: upcoming.map((minutes) => formatGtfsMinutes(minutes)),
      nextDepartureInMinutes: upcoming[0] - now,
      // The old value came from one arbitrary trip; the next real departure is
      // what "Scheduled" should have meant all along.
      scheduledDeparture: formatGtfsMinutes(upcoming[0])
    };
  });
}
