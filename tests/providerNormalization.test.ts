/* Per-provider timezone and speed-unit normalisation.

   The generic helpers in src/providers/contract.ts are not wired into the
   server yet; these tests pin them to today's Malaysia/Singapore behaviour
   (malaysiaClock(), the km/h edge conversion in gtfsRealtime.ts) and to the
   Japan/China clocks they will need. Run: npm test */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEED_IDS, FEEDS, REALTIME_SPEED_UNIT } from "../src/config.js";
import { partitionByClock, serviceClock, speedToMps } from "../src/providers/normalization.js";
import {
  feedTime,
  PROVIDER_PROFILES,
  serviceClockForFeed,
  speedToMpsForFeed
} from "../src/providers/profiles.js";
import { malaysiaClock } from "../src/schedule.js";

const at = (iso: string) => new Date(iso);

describe("serviceClock", () => {
  it("matches malaysiaClock() for Asia/Kuala_Lumpur across two years", () => {
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2028, 0, 1);
    // 37-minute step lands on every minute-of-hour and crosses every midnight.
    for (let t = start; t < end; t += 37 * 60 * 1000) {
      const now = new Date(t);
      assert.deepEqual(serviceClock("Asia/Kuala_Lumpur", now), malaysiaClock(now), now.toISOString());
    }
  });

  it("gives Singapore the same wall clock as Malaysia (both UTC+8)", () => {
    for (const iso of ["2026-10-20T15:59:00Z", "2026-10-20T16:00:00Z", "2027-02-28T23:30:00Z"]) {
      assert.deepEqual(serviceClock("Asia/Singapore", at(iso)), malaysiaClock(at(iso)), iso);
    }
  });

  it("rolls the service date at local midnight, per provider zone", () => {
    // 15:30Z = 23:30 in KL/Shanghai, 00:30 next day in Tokyo.
    const now = at("2026-10-20T15:30:00Z");
    assert.deepEqual(serviceClock("Asia/Kuala_Lumpur", now), { date: "20261020", weekday: 2, minutes: 23 * 60 + 30 });
    assert.deepEqual(serviceClock("Asia/Shanghai", now), { date: "20261020", weekday: 2, minutes: 23 * 60 + 30 });
    assert.deepEqual(serviceClock("Asia/Tokyo", now), { date: "20261021", weekday: 3, minutes: 30 });
  });

  it("handles year and leap-day boundaries", () => {
    assert.deepEqual(serviceClock("Asia/Tokyo", at("2027-12-31T15:00:00Z")), { date: "20280101", weekday: 6, minutes: 0 });
    assert.deepEqual(serviceClock("Asia/Shanghai", at("2028-02-28T16:00:00Z")), { date: "20280229", weekday: 2, minutes: 0 });
  });

  it("is independent of the server's own timezone", () => {
    // Formatting carries an explicit timeZone, so process TZ must not matter;
    // run the suite under TZ=UTC and TZ=America/New_York to exercise this.
    const now = at("2026-03-08T07:30:00Z"); // US DST change day
    assert.deepEqual(serviceClock("Asia/Tokyo", now), { date: "20260308", weekday: 0, minutes: 16 * 60 + 30 });
  });
});

describe("speedToMps", () => {
  it("reproduces the current km/h edge conversion", () => {
    // Values quoted in config.ts: bus 12.96 / 24.08, KTM ETS 98-132 (km/h).
    for (const raw of [0, 12.96, 24.08, 98, 132]) {
      assert.equal(speedToMps(raw, "kmh"), raw / 3.6);
    }
    assert.equal(speedToMps(36, "kmh"), 10);
  });

  it("passes spec-compliant m/s through unchanged", () => {
    assert.equal(speedToMps(13.4, "mps"), 13.4);
  });

  it("drops missing and non-finite speeds rather than inventing zero", () => {
    for (const unit of ["kmh", "mps"] as const) {
      assert.equal(speedToMps(undefined, unit), undefined);
      assert.equal(speedToMps(null, unit), undefined);
      assert.equal(speedToMps(Number.NaN, unit), undefined);
      assert.equal(speedToMps(Number.POSITIVE_INFINITY, unit), undefined);
    }
  });
});

describe("current provider profiles", () => {
  it("covers every configured feed exactly once", () => {
    assert.deepEqual(Object.keys(PROVIDER_PROFILES).sort(), [...FEED_IDS].sort());
    for (const id of FEED_IDS) {
      assert.equal(PROVIDER_PROFILES[id].feedId, id);
    }
  });

  it("records the global speed unit for every GTFS-Realtime feed and none elsewhere", () => {
    for (const id of FEED_IDS) {
      const profile = PROVIDER_PROFILES[id];
      const gtfsRealtime = profile.ingestion === "gtfs" && FEEDS[id].realtimeUrl !== null;
      assert.equal(profile.speedUnit, gtfsRealtime ? REALTIME_SPEED_UNIT : null, id);
    }
  });

  it("normalizes speed through each feed profile instead of guessing globally", () => {
    assert.equal(speedToMpsForFeed("rapid-bus-kl", 36), 10);
    assert.equal(speedToMpsForFeed("ktmb", 108), 30);
    assert.equal(speedToMpsForFeed("rapid-rail-kl", 36), undefined);
    assert.equal(speedToMpsForFeed("sg-bus", 36), undefined);
  });

  it("uses zones whose clock equals the malaysiaClock() the server applies today", () => {
    const samples = ["2026-10-20T15:59:00Z", "2026-10-20T16:00:00Z", "2027-06-30T04:12:00Z"];
    for (const id of FEED_IDS) {
      const { timeZone, country, coordinateSystem } = PROVIDER_PROFILES[id];
      assert.ok(country === "MY" || country === "SG", id);
      assert.equal(coordinateSystem, "WGS84", id);
      for (const iso of samples) {
        assert.deepEqual(serviceClock(timeZone, at(iso)), malaysiaClock(at(iso)), `${id} ${iso}`);
        assert.deepEqual(
          serviceClockForFeed(id, at(iso)),
          malaysiaClock(at(iso)),
          `${id} profile ${iso}`
        );
      }
    }
  });

  it("never claims provider-reported positions for Singapore", () => {
    assert.equal(PROVIDER_PROFILES["sg-bus"].capabilities.vehicles, "derived");
    assert.equal("vehicles" in PROVIDER_PROFILES["sg-rail"].capabilities, false);
    assert.equal("vehicles" in PROVIDER_PROFILES["rapid-rail-kl"].capabilities, false);
  });
});

describe("journey networks keep one service clock", () => {
  const zones: Record<string, string> = {
    "my-bus": "Asia/Kuala_Lumpur",
    "jb-bus": "Asia/Singapore",
    "sg-rail": "Asia/Singapore",
    "tokyo-metro": "Asia/Tokyo",
    "shanghai-bus": "Asia/Shanghai"
  };
  const zoneOf = (id: string) => zones[id];
  const now = at("2026-10-20T15:30:00Z"); // 23:30 KL/SG/Shanghai, 00:30 Tokyo

  it("keeps Malaysia, Johor (Asia/Singapore) and Singapore together", () => {
    const { kept, leftOut, timeZone } = partitionByClock(["my-bus", "jb-bus", "sg-rail"], zoneOf, now);
    assert.deepEqual(kept, ["my-bus", "jb-bus", "sg-rail"]);
    assert.deepEqual(leftOut, []);
    assert.equal(timeZone, "Asia/Kuala_Lumpur");
  });

  it("leaves a Japan feed out of a Malaysia network instead of planning it an hour off", () => {
    const { kept, leftOut } = partitionByClock(["my-bus", "tokyo-metro", "sg-rail"], zoneOf, now);
    assert.deepEqual(kept, ["my-bus", "sg-rail"]);
    assert.deepEqual(leftOut, ["tokyo-metro"]);
  });

  it("follows the first feed's zone, so a Japan network runs on Japan time", () => {
    const { kept, leftOut, timeZone } = partitionByClock(["tokyo-metro", "my-bus"], zoneOf, now);
    assert.equal(timeZone, "Asia/Tokyo");
    assert.deepEqual(kept, ["tokyo-metro"]);
    assert.deepEqual(leftOut, ["my-bus"]);
  });

  it("treats China (UTC+8) as sharing Malaysia's clock today", () => {
    assert.deepEqual(partitionByClock(["my-bus", "shanghai-bus"], zoneOf, now).leftOut, []);
  });

  it("refuses an empty request", () => {
    assert.throws(() => partitionByClock([], zoneOf, now));
  });
});

describe("passenger time labels", () => {
  it("labels by country, so Johor (Asia/Singapore zone) still shows MYT", () => {
    assert.deepEqual(feedTime("mybas-johor"), { timeZone: "Asia/Singapore", label: "MYT" });
    assert.deepEqual(feedTime("rapid-bus-kl"), { timeZone: "Asia/Kuala_Lumpur", label: "MYT" });
    assert.deepEqual(feedTime("sg-bus"), { timeZone: "Asia/Singapore", label: "SGT" });
  });

  it("gives every configured feed a zone and a label", () => {
    for (const id of FEED_IDS) {
      const { timeZone, label } = feedTime(id);
      assert.ok(timeZone && label, id);
    }
  });
});
