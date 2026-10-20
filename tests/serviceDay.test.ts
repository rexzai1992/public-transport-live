/* Service days that run past midnight (GTFS "24:30:00" = 00:30 the next
   morning, still on the previous day's service). Run: npm test */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serviceClock } from "../src/providers/normalization.js";
import {
  buildRouteStopSchedule,
  previousServiceDayClock,
  withNextDepartures
} from "../src/schedule.js";
import type {
  GtfsCalendar,
  GtfsCalendarException,
  GtfsFrequency,
  GtfsStopTime,
  GtfsTrip,
  RouteStop,
  StaticGtfsFeed
} from "../src/types.js";

type TripSpec = { tripId: string; serviceId: string; times: [stopId: string, time: string][] };

const ROUTE = "R1";

function weekly(serviceId: string, days: number[]): GtfsCalendar {
  return {
    serviceId,
    days: [0, 1, 2, 3, 4, 5, 6].map((day) => days.includes(day)),
    startDate: "20260101",
    endDate: "20281231"
  };
}

function makeFeed(
  specs: TripSpec[],
  calendars: GtfsCalendar[],
  exceptions: GtfsCalendarException[] = [],
  frequencies: GtfsFrequency[] = []
): StaticGtfsFeed {
  const trips: GtfsTrip[] = specs.map((spec) => ({ routeId: ROUTE, serviceId: spec.serviceId, tripId: spec.tripId }));
  const stopTimes = new Map<string, GtfsStopTime[]>(
    specs.map((spec) => [
      spec.tripId,
      spec.times.map(([stopId, time], index) => ({
        tripId: spec.tripId,
        stopId,
        sequence: index + 1,
        arrivalTime: time,
        departureTime: time
      }))
    ])
  );
  const calendarExceptions = new Map<string, GtfsCalendarException[]>();
  for (const exception of exceptions) {
    calendarExceptions.set(exception.serviceId, [...(calendarExceptions.get(exception.serviceId) ?? []), exception]);
  }
  const frequenciesByTripId = new Map<string, GtfsFrequency[]>();
  for (const frequency of frequencies) {
    frequenciesByTripId.set(frequency.tripId, [...(frequenciesByTripId.get(frequency.tripId) ?? []), frequency]);
  }
  return {
    loadedAt: "2026-10-20T00:00:00.000Z",
    routes: new Map([[ROUTE, { routeId: ROUTE, shortName: ROUTE } as never]]),
    stops: new Map(),
    trips: new Map(trips.map((trip) => [trip.tripId, trip])),
    tripsByRouteId: new Map([[ROUTE, trips]]),
    stopTimesByTripId: stopTimes,
    shapesByShapeId: new Map(),
    calendars: new Map(calendars.map((calendar) => [calendar.serviceId, calendar])),
    calendarExceptions,
    frequenciesByTripId
  };
}

const stop = (stopId: string): RouteStop => ({ stopId, name: stopId, lat: 0, lon: 0, sequence: 1 });

function next(feed: StaticGtfsFeed, clock: ReturnType<typeof serviceClock>, stopId = "A") {
  const [result] = withNextDepartures([stop(stopId)], buildRouteStopSchedule(feed, ROUTE, clock), clock);
  return { times: result.nextDepartures, wait: result.nextDepartureInMinutes };
}

const FRIDAY = 5;
const SATURDAY = 6;

/* 2026-10-23 is a Friday, 2026-10-24 a Saturday. Instants are chosen so the
   wall clock in each zone reads the stated local time. */
const ZONES = [
  {
    zone: "Asia/Tokyo",
    fri2350: "2026-10-23T14:50:00Z",
    sat0020: "2026-10-23T15:20:00Z",
    fri1100: "2026-10-23T02:00:00Z"
  },
  {
    zone: "Asia/Kuala_Lumpur",
    fri2350: "2026-10-23T15:50:00Z",
    sat0020: "2026-10-23T16:20:00Z",
    fri1100: "2026-10-23T03:00:00Z"
  }
];

const calendars = [weekly("FRI", [FRIDAY]), weekly("SAT", [SATURDAY]), weekly("DAILY", [0, 1, 2, 3, 4, 5, 6])];

for (const z of ZONES) {
  const clock = (iso: string) => serviceClock(z.zone, new Date(iso));

  describe(`after-midnight service (${z.zone})`, () => {
    it("clocks used by these tests read the intended local time", () => {
      assert.deepEqual(clock(z.sat0020), { date: "20261024", weekday: SATURDAY, minutes: 20 });
      assert.deepEqual(clock(z.fri2350), { date: "20261023", weekday: FRIDAY, minutes: 23 * 60 + 50 });
    });

    const feed = makeFeed(
      [
        { tripId: "fri-late", serviceId: "FRI", times: [["A", "24:30:00"], ["B", "24:40:00"]] },
        { tripId: "day", serviceId: "DAILY", times: [["A", "08:00:00"], ["B", "08:10:00"]] },
        { tripId: "noon", serviceId: "DAILY", times: [["A", "12:00:00"], ["B", "12:10:00"]] }
      ],
      calendars
    );

    it("00:20 Saturday shows Friday's 24:30 trip as next, in 10 min", () => {
      assert.deepEqual(next(feed, clock(z.sat0020)), { times: ["00:30", "08:00", "12:00"], wait: 10 });
      assert.deepEqual(next(feed, clock(z.sat0020), "B"), { times: ["00:40", "08:10", "12:10"], wait: 20 });
    });

    it("23:50 Friday shows the 24:30 trip in 40 min", () => {
      assert.deepEqual(next(feed, clock(z.fri2350)), { times: ["00:30", "08:00", "12:00"], wait: 40 });
    });

    it("normal daytime is unchanged", () => {
      assert.deepEqual(next(feed, clock(z.fri1100)), { times: ["12:00", "00:30", "08:00"], wait: 60 });
    });

    it("a Saturday-only 24:30 (Sunday 00:30) is not shown at 00:20 Saturday", () => {
      const satLate = makeFeed(
        [
          { tripId: "sat-late", serviceId: "SAT", times: [["A", "24:30:00"]] },
          { tripId: "day", serviceId: "DAILY", times: [["A", "08:00:00"]] }
        ],
        calendars
      );
      // Its real departure (tomorrow 00:30) sorts after today's 08:00, not first.
      assert.deepEqual(next(satLate, clock(z.sat0020)), { times: ["08:00", "00:30"], wait: 7 * 60 + 40 });

      const onlySatLate = makeFeed([{ tripId: "sat-late", serviceId: "SAT", times: [["A", "24:30:00"]] }], calendars);
      assert.equal(next(onlySatLate, clock(z.sat0020)).wait, 24 * 60 + 10);
    });

    it("a Friday-only route still shows its 24:30 at 00:20 Saturday, despite today's fallback", () => {
      const onlyFriLate = makeFeed([{ tripId: "fri-late", serviceId: "FRI", times: [["A", "24:30:00"]] }], calendars);
      assert.deepEqual(next(onlyFriLate, clock(z.sat0020)), { times: ["00:30"], wait: 10 });
    });

    it("the route-page service-day map keeps only today's service, unshifted", () => {
      const schedule = buildRouteStopSchedule(feed, ROUTE, clock(z.sat0020));
      assert.deepEqual(schedule.get("A")?.map((entry) => entry.minutes), [480, 720]);
      assert.deepEqual(schedule.previousServiceDay?.get("A"), [{ minutes: 30, tripId: "fri-late" }]);
    });

    it("calendar_dates exceptions on the previous day are respected", () => {
      const removed = makeFeed(
        [
          { tripId: "fri-late", serviceId: "FRI", times: [["A", "24:30:00"]] },
          { tripId: "day", serviceId: "DAILY", times: [["A", "08:00:00"]] }
        ],
        calendars,
        [{ serviceId: "FRI", date: "20261023", exceptionType: 2 }]
      );
      assert.equal(next(removed, clock(z.sat0020)).times?.[0], "08:00");

      const added = makeFeed(
        [
          { tripId: "special", serviceId: "SPECIAL", times: [["A", "25:00:00"]] },
          { tripId: "day", serviceId: "DAILY", times: [["A", "08:00:00"]] }
        ],
        [...calendars, weekly("SPECIAL", [])],
        [{ serviceId: "SPECIAL", date: "20261023", exceptionType: 1 }]
      );
      assert.deepEqual(next(added, clock(z.sat0020)), { times: ["01:00", "08:00"], wait: 40 });
    });

    it("a frequencies.txt window running past 24:00 carries into the next morning", () => {
      const headways = makeFeed(
        [{ tripId: "freq", serviceId: "FRI", times: [["A", "23:00:00"], ["B", "23:10:00"]] }],
        calendars,
        [],
        [{ tripId: "freq", startTime: "23:00:00", endTime: "25:00:00", headwaySeconds: 1800 }]
      );
      // Friday's 24:00 and 24:30 departures are tonight after midnight.
      const sat = next(headways, clock(z.sat0020));
      assert.equal(sat.wait, 10);
      assert.equal(sat.times?.[0], "00:30");
      const satB = next(headways, clock(z.sat0020), "B");
      assert.equal(satB.wait, 20);
      assert.equal(satB.times?.[0], "00:40");
      // On Friday evening they are still ahead.
      assert.deepEqual(next(headways, clock(z.fri2350)), { times: ["00:00", "00:30", "23:00"], wait: 10 });
    });
  });
}

describe("previousServiceDayClock", () => {
  it("crosses month, year and leap-day boundaries", () => {
    assert.deepEqual(previousServiceDayClock({ date: "20270101", weekday: 5, minutes: 20 }), {
      date: "20261231",
      weekday: 4,
      minutes: 1460
    });
    assert.deepEqual(previousServiceDayClock({ date: "20280301", weekday: 3, minutes: 0 }), {
      date: "20280229",
      weekday: 2,
      minutes: 1440
    });
    assert.deepEqual(previousServiceDayClock({ date: "20270301", weekday: 1, minutes: 5 }).date, "20270228");
    assert.deepEqual(previousServiceDayClock({ date: "20261101", weekday: 0, minutes: 5 }), {
      date: "20261031",
      weekday: 6,
      minutes: 1445
    });
  });
});

describe("no repeated clock times", () => {
  it("a once-a-day bus seen after midnight shows its time once, not today's and tomorrow's copy", async () => {
    const { withNextDepartures } = await import("../src/schedule.js");
    const schedule = Object.assign(new Map([["S1", [{ minutes: 15 * 60 + 26, tripId: "t1" }]]]), {}) as Parameters<typeof withNextDepartures>[1];
    const [stop] = withNextDepartures(
      [{ stopId: "S1", name: "Only", lat: 0, lon: 0, sequence: 1 }],
      schedule,
      { date: "20261024", weekday: 6, minutes: 15 },
      3
    );
    assert.deepEqual(stop.nextDepartures, ["15:26"]);
    assert.equal(stop.nextDepartureInMinutes, 15 * 60 + 26 - 15);
  });
});
