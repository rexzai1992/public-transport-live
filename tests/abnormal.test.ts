/* Abnormal, negative and edge-case inputs. The contract under test: bad input
   degrades gracefully — no crash, no hang, no invented data — and anything that
   is rejected is rejected with a clear error. Cases marked `todo` document a
   known defect (the assertion states the expected behaviour) and do not fail
   the suite. Fixtures are small in-memory zips, not real provider data.
   Run: npm test */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { parseFeedZip } from "../src/gtfsStatic.js";
import {
  activeServiceIds,
  buildRouteStopSchedule,
  gtfsTimeToMinutes,
  previousServiceDayClock,
  withNextDepartures,
  type MalaysiaClock
} from "../src/schedule.js";
import { partitionByClock, serviceClock, speedToMps } from "../src/providers/normalization.js";
import { makeDoc, makeDocs, normalizeWords, queryVariants, scoreDoc, scoreDocs } from "../src/search.js";
import type { GtfsCalendar, GtfsFrequency, GtfsStopTime, GtfsTrip, RouteStop, StaticGtfsFeed } from "../src/types.js";

/* ------------------------------------------------------------------------- */
/* GTFS zip fixtures                                                          */

type Files = Record<string, string | Uint8Array | undefined>;

async function zipOf(files: Files, folder = ""): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    if (content !== undefined) zip.file(folder + name, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

const ROUTES = "route_id,route_short_name,route_long_name,route_type\nR1,1,Line One,3\n";
const STOPS = "stop_id,stop_name,stop_lat,stop_lon\nS1,Alpha,3.1,101.6\nS2,Beta,3.2,101.7\n";
const TRIPS = "route_id,service_id,trip_id\nR1,WK,T1\n";
const STOP_TIMES =
  "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" +
  "T1,08:00:00,08:00:00,S1,1\n" +
  "T1,08:10:00,08:10:00,S2,2\n";
const BASE: Files = { "routes.txt": ROUTES, "stops.txt": STOPS, "trips.txt": TRIPS, "stop_times.txt": STOP_TIMES };

async function parse(files: Files, folder = ""): Promise<StaticGtfsFeed> {
  return parseFeedZip(await zipOf(files, folder));
}

describe("parseFeedZip: container abnormalities", () => {
  it("rejects a buffer that is not a zip with a clear error", async () => {
    await assert.rejects(parseFeedZip(Buffer.from("this is not a zip")), /central directory|zip/i);
  });

  it("rejects a zero-length buffer with a clear error", async () => {
    await assert.rejects(parseFeedZip(Buffer.alloc(0)), /corrupted zip|end of data/i);
  });

  it("an empty zip parses to an empty feed (the caller rejects route-less feeds)", async () => {
    const feed = await parse({});
    assert.equal(feed.routes.size, 0);
    assert.equal(feed.stops.size, 0);
    assert.equal(feed.trips.size, 0);
  });

  it("header-only and zero-byte files parse to empty tables", async () => {
    const feed = await parse({ "routes.txt": "route_id,route_short_name\n", "stops.txt": "" });
    assert.equal(feed.routes.size, 0);
    assert.equal(feed.stops.size, 0);
  });

  it(
    "files inside a subfolder are found (common in hand-zipped feeds)",
    async () => {
      const feed = await parse(BASE, "gtfs/");
      assert.equal(feed.routes.size, 1);
    }
  );

  it("a stops.txt-less root still reads the nested feed, not a stray file", async () => {
    const feed = await parse(BASE, "gtfs/");
    assert.equal(feed.stops.size > 0, true);
  });
});

describe("parseFeedZip: missing required files", () => {
  it("missing stops.txt: routes/trips load, stops map is empty", async () => {
    const feed = await parse({ ...BASE, "stops.txt": undefined });
    assert.equal(feed.routes.size, 1);
    assert.equal(feed.stops.size, 0);
  });

  it("missing stop_times.txt: no trip has stop times", async () => {
    const feed = await parse({ ...BASE, "stop_times.txt": undefined });
    assert.equal(feed.trips.size, 1);
    assert.equal(feed.stopTimesByTripId.size, 0);
  });
});

describe("parseFeedZip: malformed CSV", () => {
  it("unbalanced quote in a required file throws a clear CSV error (whole feed rejected)", async () => {
    await assert.rejects(
      parse({ ...BASE, "stops.txt": 'stop_id,stop_name,stop_lat,stop_lon\nS1,"Alpha,3.1,101.6\nS2,Beta,3.2,101.7\n' }),
      /Quote Not Closed/
    );
  });

  it(
    "an unescaped quote inside one stop name drops that row, not the whole feed",
    async () => {
      const feed = await parse({
        ...BASE,
        "stops.txt": 'stop_id,stop_name,stop_lat,stop_lon\nS1,City bus "Gururin",3.1,101.6\nS2,Beta,3.2,101.7\n'
      });
      assert.ok(feed.stops.has("S2"));
    }
  );

  it("unbalanced quote in translations.txt is ignored; the feed still loads", async () => {
    const feed = await parse({
      ...BASE,
      "translations.txt": 'table_name,field_name,language,translation,record_id\nstops,stop_name,en,"Broken,S1\n'
    });
    assert.equal(feed.routes.size, 1);
    assert.equal(feed.stops.get("S1")?.name, "Alpha");
    assert.equal(feed.stops.get("S1")?.altNames, undefined);
  });

  it("BOM and CRLF line endings parse cleanly", async () => {
    const feed = await parse({
      ...BASE,
      "stops.txt": "﻿stop_id,stop_name,stop_lat,stop_lon\r\nS1,Alpha,3.1,101.6\r\nS2,Beta,3.2,101.7\r\n",
      "stop_times.txt": STOP_TIMES.replace(/\n/g, "\r\n")
    });
    assert.deepEqual([...feed.stops.keys()], ["S1", "S2"]);
    assert.equal(feed.stops.get("S1")?.lat, 3.1);
    assert.equal(feed.stopTimesByTripId.get("T1")?.[1].departureTime, "08:10:00");
  });

  it("extra unknown COLUMNS (in the header) are tolerated", async () => {
    const feed = await parse({
      ...BASE,
      "stops.txt": "stop_id,stop_name,stop_lat,stop_lon,zone_id,wheelchair_boarding\nS1,Alpha,3.1,101.6,Z,1\n"
    });
    assert.equal(feed.stops.get("S1")?.name, "Alpha");
  });

  it(
    "a row with an extra trailing field is tolerated (or only that row dropped)",
    async () => {
      const feed = await parse({
        ...BASE,
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS1,Alpha,3.1,101.6,\nS2,Beta,3.2,101.7\n"
      });
      assert.ok(feed.stops.has("S2"));
    }
  );

  it("a short row is dropped (missing coordinate), the rest of the feed loads", async () => {
    const feed = await parse({ ...BASE, "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS1,Alpha,3.1\nS2,Beta,3.2,101.7\n" });
    assert.equal(feed.stops.has("S1"), false);
    assert.ok(feed.stops.has("S2"));
  });

  it("missing required columns: rows without an id are dropped, not invented", async () => {
    const feed = await parse({ ...BASE, "routes.txt": "route_short_name\n1\n", "trips.txt": "trip_id\nT1\n" });
    assert.equal(feed.routes.size, 0);
    assert.equal(feed.trips.size, 0);
  });
});

describe("parseFeedZip: bad rows", () => {
  it("duplicate stop_id / route_id: last row wins, no crash", async () => {
    const feed = await parse({
      ...BASE,
      "routes.txt": ROUTES + "R1,1X,Duplicate,3\n",
      "stops.txt": STOPS + "S1,Alpha again,3.11,101.61\n"
    });
    assert.equal(feed.routes.size, 1);
    assert.equal(feed.routes.get("R1")?.longName, "Duplicate");
    assert.equal(feed.stops.size, 2);
    assert.equal(feed.stops.get("S1")?.name, "Alpha again");
  });

  it("stop_times referencing unknown trips/stops do not crash and do not create trips", async () => {
    const feed = await parse({
      ...BASE,
      "stop_times.txt": STOP_TIMES + "TX,09:00:00,09:00:00,SX,1\nT1,08:20:00,08:20:00,NOPE,3\n"
    });
    assert.equal(feed.trips.has("TX"), false);
    assert.equal(feed.stops.has("NOPE"), false);
    assert.equal(feed.stops.has("SX"), false);
  });

  it("non-numeric lat/lon drop the stop", async () => {
    const feed = await parse({
      ...BASE,
      "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS1,Alpha,abc,101.6\nS2,Beta,3.2,NaN\nS3,Gamma,3.3,101.8\n"
    });
    assert.deepEqual([...feed.stops.keys()], ["S3"]);
  });

  it(
    "empty lat/lon drop the stop instead of placing it at 0,0 (Null Island)",
    async () => {
      const feed = await parse({ ...BASE, "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS1,Alpha,,\n" });
      assert.equal(feed.stops.has("S1"), false);
    }
  );

  it(
    "out-of-range lat/lon (|lat|>90, |lon|>180) drop the stop",
    async () => {
      const feed = await parse({
        ...BASE,
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS1,Alpha,999,-999\nS2,Beta,0x10,101.6\n"
      });
      assert.equal(feed.stops.size, 0);
    }
  );

  it("Infinity lat/lon are rejected", async () => {
    const feed = await parse({ ...BASE, "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS1,Alpha,Infinity,1\n" });
    assert.equal(feed.stops.size, 0);
  });

  it(
    "empty stop_sequence drops the stop_time row",
    async () => {
      const feed = await parse({
        ...BASE,
        "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,S1,\n"
      });
      assert.equal(feed.stopTimesByTripId.get("T1")?.length ?? 0, 0);
    }
  );

  it("frequencies with zero/negative/non-numeric headway are dropped at parse time", async () => {
    const feed = await parse({
      ...BASE,
      "frequencies.txt":
        "trip_id,start_time,end_time,headway_secs\nT1,06:00:00,07:00:00,0\nT1,06:00:00,07:00:00,-60\nT1,06:00:00,07:00:00,abc\n"
    });
    assert.equal(feed.frequenciesByTripId.size, 0);
  });

  it(
    "frequencies with an implausibly tiny headway are rejected at parse time",
    async () => {
      const feed = await parse({
        ...BASE,
        "frequencies.txt": "trip_id,start_time,end_time,headway_secs\nT1,06:00:00,07:00:00,0.001\n"
      });
      assert.equal(feed.frequenciesByTripId.size, 0);
    }
  );

  it("Shift_JIS bytes do not crash the parser (decoded as UTF-8, so mojibake)", async () => {
    // 新宿 in Shift_JIS is 90 56 8F 68.
    const bytes = new Uint8Array([
      ...Buffer.from("stop_id,stop_name,stop_lat,stop_lon\nS1,"),
      0x90, 0x56, 0x8f, 0x68,
      ...Buffer.from(",35.69,139.70\n")
    ]);
    const feed = await parse({ ...BASE, "stops.txt": bytes });
    const name = feed.stops.get("S1")?.name ?? "";
    assert.equal(feed.stops.get("S1")?.lat, 35.69);
    // Documented behaviour: Shift_JIS is not detected; the name holds U+FFFD.
    assert.ok(name.includes("�"), `expected replacement chars, got ${JSON.stringify(name)}`);
  });
});

/* ------------------------------------------------------------------------- */
/* Schedule                                                                   */

const ROUTE = "R";
const EVERY_DAY = [true, true, true, true, true, true, true];

function scheduleFeed(opts: {
  times?: string[];
  calendars?: GtfsCalendar[];
  frequencies?: Omit<GtfsFrequency, "tripId">[];
  noTrips?: boolean;
}): StaticGtfsFeed {
  const trips: GtfsTrip[] = opts.noTrips ? [] : [{ routeId: ROUTE, serviceId: "WK", tripId: "T" }];
  const stopTimes: GtfsStopTime[] = (opts.times ?? []).map((time, index) => ({
    tripId: "T",
    stopId: `A${index}`,
    sequence: index + 1,
    arrivalTime: time,
    departureTime: time
  }));
  return {
    loadedAt: "",
    routes: new Map([[ROUTE, { routeId: ROUTE }]]),
    stops: new Map(),
    trips: new Map(trips.map((trip) => [trip.tripId, trip])),
    tripsByRouteId: new Map(trips.length ? [[ROUTE, trips]] : []),
    stopTimesByTripId: new Map(trips.length ? [["T", stopTimes]] : []),
    shapesByShapeId: new Map(),
    calendars: new Map((opts.calendars ?? []).map((calendar) => [calendar.serviceId, calendar])),
    calendarExceptions: new Map(),
    frequenciesByTripId: new Map(
      opts.frequencies ? [["T", opts.frequencies.map((frequency) => ({ tripId: "T", ...frequency }))]] : []
    )
  };
}

function routeStops(count: number): RouteStop[] {
  return Array.from({ length: count }, (_, index) => ({
    stopId: `A${index}`,
    name: `A${index}`,
    lat: 3,
    lon: 101,
    sequence: index + 1
  }));
}

// Tuesday 2026-10-20, 10:00.
const TUESDAY: MalaysiaClock = { date: "20261020", weekday: 2, minutes: 600 };
const SUNDAY: MalaysiaClock = { date: "20261025", weekday: 0, minutes: 600 };

describe("gtfsTimeToMinutes: bad times", () => {
  it("empty, non-numeric and negative times are undefined", () => {
    for (const value of [undefined, "", "abc", "-1:00:00", "08:0", "1e3:00"]) {
      assert.equal(gtfsTimeToMinutes(value), undefined, JSON.stringify(value));
    }
  });

  it("valid past-midnight times stay above 1440", () => {
    assert.equal(gtfsTimeToMinutes("24:30:00"), 1470);
    assert.equal(gtfsTimeToMinutes("8:00:00"), 480);
  });

  it(
    "minutes above 59 are rejected",
    () => {
      assert.equal(gtfsTimeToMinutes("25:61:00"), undefined);
    }
  );

  it(
    "implausible service-day hours (>= 48) are rejected",
    () => {
      assert.equal(gtfsTimeToMinutes("99:00:00"), undefined);
      assert.equal(gtfsTimeToMinutes("999:59:59"), undefined);
    }
  );
});

describe("schedule: calendars", () => {
  it("empty calendar: no active services, all trips count (no-calendar feeds)", () => {
    const feed = scheduleFeed({ times: ["10:30:00"] });
    assert.equal(activeServiceIds(feed, TUESDAY).size, 0);
    const schedule = buildRouteStopSchedule(feed, ROUTE, TUESDAY);
    assert.deepEqual(schedule.get("A0")?.map((entry) => entry.minutes), [630]);
  });

  it("expired calendar: service is not active today", () => {
    const feed = scheduleFeed({
      times: ["10:30:00"],
      calendars: [{ serviceId: "WK", days: EVERY_DAY, startDate: "20200101", endDate: "20201231" }]
    });
    assert.equal(activeServiceIds(feed, TUESDAY).has("WK"), false);
  });

  it(
    "expired calendar: no departures are offered as if they ran today",
    { todo: "by design for now: when NO service in the whole feed is active (expired or unusable calendar) every trip counts, so MY feeds with stale calendars keep a timetable; needs a STALE label rather than silence" },
    () => {
      const feed = scheduleFeed({
        times: ["10:30:00"],
        calendars: [{ serviceId: "WK", days: EVERY_DAY, startDate: "20200101", endDate: "20201231" }]
      });
      const stops = withNextDepartures(routeStops(1), buildRouteStopSchedule(feed, ROUTE, TUESDAY), TUESDAY);
      assert.equal(stops[0].nextDepartures, undefined);
    }
  );

  it(
    "weekday-only route on a Sunday shows no Sunday departures",
    () => {
      const weekdays = [false, true, true, true, true, true, false];
      const feed = scheduleFeed({
        times: ["10:30:00"],
        calendars: [
          { serviceId: "WK", days: weekdays, startDate: "20260101", endDate: "20281231" },
          { serviceId: "OTHER_ROUTE_SUN", days: EVERY_DAY, startDate: "20260101", endDate: "20281231" }
        ]
      });
      const stops = withNextDepartures(routeStops(1), buildRouteStopSchedule(feed, ROUTE, SUNDAY), SUNDAY);
      assert.equal(stops[0].nextDepartures, undefined);
    }
  );
});

describe("schedule: empty and degenerate inputs", () => {
  it("route with zero trips: empty schedule, stops returned unchanged", () => {
    const feed = scheduleFeed({ noTrips: true });
    const schedule = buildRouteStopSchedule(feed, ROUTE, TUESDAY);
    assert.equal(schedule.size, 0);
    const stops = routeStops(2);
    assert.deepEqual(withNextDepartures(stops, schedule, TUESDAY), stops);
  });

  it("unknown route id: empty schedule", () => {
    const schedule = buildRouteStopSchedule(scheduleFeed({ times: ["10:30:00"] }), "NOPE", TUESDAY);
    assert.equal(schedule.size, 0);
  });

  it("stop with no times keeps no departure fields", () => {
    const feed = scheduleFeed({ times: ["10:30:00", "", "abc"] });
    const stops = withNextDepartures(routeStops(3), buildRouteStopSchedule(feed, ROUTE, TUESDAY), TUESDAY);
    assert.deepEqual(stops[0].nextDepartures, ["10:30"]);
    assert.equal(stops[1].nextDepartures, undefined);
    assert.equal(stops[2].nextDepartures, undefined);
    assert.equal(stops[1].nextDepartureInMinutes, undefined);
  });

  it("limit 0 / NaN return stops without departures; never throws", () => {
    const feed = scheduleFeed({ times: ["10:30:00", "10:40:00"] });
    const schedule = buildRouteStopSchedule(feed, ROUTE, TUESDAY);
    for (const limit of [0, Number.NaN]) {
      const stops = withNextDepartures(routeStops(2), schedule, TUESDAY, limit);
      assert.equal(stops[0].nextDepartures, undefined, `limit ${limit}`);
    }
  });

  it("clock at 00:00 and 23:59: departures are never in the past", () => {
    const feed = scheduleFeed({ times: ["00:00:00", "23:59:00", "24:00:00"] });
    for (const minutes of [0, 1439]) {
      const clock = { ...TUESDAY, minutes };
      const stops = withNextDepartures(routeStops(3), buildRouteStopSchedule(feed, ROUTE, clock), clock);
      for (const stop of stops) {
        assert.ok(stop.nextDepartureInMinutes !== undefined && stop.nextDepartureInMinutes >= 0, `${stop.stopId} at ${minutes}`);
        assert.ok(stop.nextDepartureInMinutes! <= 1440, `${stop.stopId} wait ${stop.nextDepartureInMinutes}`);
      }
    }
  });

  it(
    "an absurd time ('99:00:00') is not presented as a departure",
    () => {
      const feed = scheduleFeed({ times: ["99:00:00"] });
      const stops = withNextDepartures(routeStops(1), buildRouteStopSchedule(feed, ROUTE, TUESDAY), TUESDAY);
      assert.equal(stops[0].nextDepartures, undefined);
    }
  );

  it("previousServiceDayClock on a malformed date does not throw", () => {
    const clock = previousServiceDayClock({ date: "garbage", weekday: 0, minutes: 0 });
    assert.equal(clock.minutes, 1440);
    assert.equal(clock.weekday, 6);
  });

  it("previousServiceDayClock crosses month/leap boundaries", () => {
    assert.equal(previousServiceDayClock({ date: "20260301", weekday: 0, minutes: 5 }).date, "20260228");
    assert.equal(previousServiceDayClock({ date: "20280301", weekday: 3, minutes: 5 }).date, "20280229");
    assert.equal(previousServiceDayClock({ date: "20270101", weekday: 5, minutes: 5 }).date, "20261231");
  });
});

describe("schedule: frequencies.txt abnormalities (must terminate)", () => {
  it("zero, negative headway and end-before-start produce no departures, quickly", { timeout: 5000 }, () => {
    const started = Date.now();
    const feed = scheduleFeed({
      times: ["06:00:00", "06:10:00"],
      frequencies: [
        { startTime: "06:00:00", endTime: "05:00:00", headwaySeconds: 60 },
        { startTime: "06:00:00", endTime: "07:00:00", headwaySeconds: 0 },
        { startTime: "06:00:00", endTime: "07:00:00", headwaySeconds: -300 },
        { startTime: "abc", endTime: "07:00:00", headwaySeconds: 300 }
      ]
    });
    const schedule = buildRouteStopSchedule(feed, ROUTE, TUESDAY);
    assert.equal(schedule.size, 0);
    assert.ok(Date.now() - started < 1000);
  });

  it(
    "a NaN headway (bypassing parseFrequency) yields no departures",
    () => {
      const feed = scheduleFeed({
        times: ["06:00:00", "06:10:00"],
        frequencies: [{ startTime: "06:00:00", endTime: "07:00:00", headwaySeconds: Number.NaN }]
      });
      const schedule = buildRouteStopSchedule(feed, ROUTE, TUESDAY);
      const all = [...schedule.values()].flat();
      assert.ok(all.every((entry) => Number.isFinite(entry.minutes)), JSON.stringify(all));
      assert.equal(schedule.size, 0);
    }
  );

  it("a 1-second headway over 99 hours terminates within the timeout", { timeout: 10000 }, () => {
    const feed = scheduleFeed({
      times: ["00:00:00", "00:10:00"],
      frequencies: [{ startTime: "00:00:00", endTime: "99:00:00", headwaySeconds: 1 }]
    });
    const schedule = buildRouteStopSchedule(feed, ROUTE, TUESDAY);
    // Deduplicated per whole minute.
    assert.ok((schedule.get("A0")?.length ?? 0) <= 99 * 60 + 1);
  });

  it(
    "a sub-second headway is bounded (no multi-second event-loop stall)",
    { timeout: 30000 },
    () => {
      const started = Date.now();
      const feed = scheduleFeed({
        times: ["00:00:00", "00:10:00"],
        frequencies: [{ startTime: "00:00:00", endTime: "24:00:00", headwaySeconds: 0.01 }]
      });
      buildRouteStopSchedule(feed, ROUTE, TUESDAY);
      assert.ok(Date.now() - started < 200, `took ${Date.now() - started} ms`);
    }
  );
});

/* ------------------------------------------------------------------------- */
/* Provider normalization                                                     */

describe("providers/normalization: abnormal inputs", () => {
  it("serviceClock throws RangeError for an invalid IANA zone (documented, callers must validate)", () => {
    assert.throws(() => serviceClock("Not/AZone"), RangeError);
    assert.throws(() => serviceClock(""), RangeError);
  });

  it("serviceClock accepts case-insensitive and offset zones", () => {
    const at = new Date("2026-10-20T00:00:00Z");
    assert.deepEqual(serviceClock("utc", at), { date: "20261020", weekday: 2, minutes: 0 });
    assert.equal(serviceClock("+08:00", at).minutes, 8 * 60);
  });

  it("serviceClock at the epoch and at an invalid Date", () => {
    assert.deepEqual(serviceClock("UTC", new Date(0)), { date: "19700101", weekday: 4, minutes: 0 });
    assert.throws(() => serviceClock("UTC", new Date(Number.NaN)), RangeError);
  });

  it("speedToMps: non-finite and missing values are undefined", () => {
    for (const value of [Number.NaN, Infinity, -Infinity, null, undefined]) {
      assert.equal(speedToMps(value, "kmh"), undefined);
      assert.equal(speedToMps(value, "mps"), undefined);
    }
  });

  it("speedToMps: huge values stay finite", () => {
    assert.ok(Number.isFinite(speedToMps(Number.MAX_VALUE, "kmh")!));
    assert.equal(speedToMps(Number.MAX_VALUE, "mps"), Number.MAX_VALUE);
  });

  it("speedToMps: -0 is preserved as -0 (harmless; documented)", () => {
    assert.ok(Object.is(speedToMps(-0, "kmh"), -0));
  });

  it(
    "speedToMps: a negative speed is not passed downstream as a real speed",
    () => {
      assert.equal(speedToMps(-10, "kmh"), undefined);
    }
  );

  it("partitionByClock: single id is kept", () => {
    assert.deepEqual(partitionByClock(["a"], () => "UTC"), { timeZone: "UTC", kept: ["a"], leftOut: [] });
  });

  it("partitionByClock: duplicates are preserved, not merged", () => {
    const zones: Record<string, string> = { a: "Asia/Kuala_Lumpur", b: "Asia/Tokyo", c: "Asia/Singapore" };
    const result = partitionByClock(["a", "a", "b", "c", "b"], (id) => zones[id]);
    assert.deepEqual(result.kept, ["a", "a", "c"]);
    assert.deepEqual(result.leftOut, ["b", "b"]);
  });

  it("partitionByClock: empty list and an invalid zone throw clearly", () => {
    assert.throws(() => partitionByClock([], () => "UTC"), /no feeds given/);
    assert.throws(() => partitionByClock(["a"], () => "Bad/Zone"), RangeError);
  });
});

/* ------------------------------------------------------------------------- */
/* Search                                                                     */

const SEARCH_DOCS = [
  makeDocs("KL SENTRAL"),
  makeDocs("JLN TUN RAZAK"),
  makeDocs("新宿", ["Shinjuku", "しんじゅく"]),
  makeDocs("KL2212 PASAR SENI"),
  makeDocs("a".repeat(5000)),
  makeDocs("")
];

function bestScore(query: string): { score: number; ms: number } {
  const started = performance.now();
  let score = 0;
  for (const words of queryVariants(query)) {
    for (const docs of SEARCH_DOCS) score = Math.max(score, scoreDocs(words, docs));
  }
  return { score, ms: performance.now() - started };
}

const SENTRAL = bestScore("sentral").score;

describe("search: hostile and unusual queries", () => {
  const cases: [string, string, "zero" | "match" | "any"][] = [
    ["empty string", "", "zero"],
    ["whitespace only", " \t\n\r 　 ", "zero"],
    ["punctuation only", "!!!---///", "zero"],
    ["regex metacharacters", ".*+?^${}()|[]\\", "zero"],
    ["regex metacharacters around a word", "(sentral)|.*", "match"],
    ["control chars around a word", "\u0001\u0002 sentral \u001f\u007f", "match"],
    ["null bytes inside a word", "kl\u0000sentral", "any"],
    ["zero-width joiner inside a word", "sen‍tral", "any"],
    ["zero-width space alone", "​‌‍﻿", "zero"],
    ["RTL override + Arabic", "‮محطة", "zero"],
    ["Hebrew", "תחנה מרכזית", "zero"],
    ["emoji ZWJ sequences", "👨‍👩‍👧‍👦 🚌🏳️‍🌈", "zero"],
    ["emoji around a word", "🚌 sentral 🚆", "match"],
    ["lone high surrogate", "\ud800", "zero"],
    ["lone surrogates around a word", "\ud800 sentral \udc00", "match"],
    ["combining marks only", "́́́", "zero"],
    ["small kana only", "ゃゅょっー", "any"],
    ["10k-char single word", "x".repeat(10_000), "zero"],
    ["10k chars of kana", "し".repeat(10_000), "any"],
    ["10k chars of many words", "sentral ".repeat(1250), "any"],
    ["10k chars of digits", "1".repeat(10_000), "zero"]
  ];

  for (const [label, query, expect] of cases) {
    it(`${label}: no throw, sane score, < 50 ms`, () => {
      const { score, ms } = bestScore(query);
      assert.ok(Number.isFinite(score) && score >= 0, `score ${score}`);
      if (expect === "zero") assert.equal(score, 0);
      if (expect === "match") assert.ok(score > 0);
      assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
    });
  }

  it("normalizeWords never returns empty words", () => {
    for (const [, query] of cases) {
      assert.ok(normalizeWords(query).every((word) => word.length > 0));
    }
  });

  it("makeDoc/makeDocs on hostile names do not throw", () => {
    for (const [, name] of cases) {
      const doc = makeDoc(name);
      assert.ok(Array.isArray(doc.words));
      assert.ok(Array.isArray(makeDocs(name, [name, ""])));
    }
  });

  it("scoreDoc with no words on either side is 0", () => {
    assert.equal(scoreDoc([], makeDoc("KL SENTRAL")), 0);
    assert.equal(scoreDoc(["sentral"], makeDoc("")), 0);
  });

  it(
    "repeating a query word does not inflate the score beyond a real exact match",
    { todo: "'sentral ' x1250 scores ~12500 vs ~100 for an exact phrase: each repeat re-matches the same name word (search.ts scoreDoc); bounded in HTTP by the 80-char q limit" },
    () => {
      assert.ok(bestScore("sentral ".repeat(1250)).score <= 100);
    }
  );

  it("a single plain query still finds its stop (control)", () => {
    assert.ok(SENTRAL > 0);
  });
});
