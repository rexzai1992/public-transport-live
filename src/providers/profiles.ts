/* Current Malaysia and Singapore feeds described in the provider contract.

   The server reads each feed's clock (serviceClockForFeed), speed unit
   (speedToMpsForFeed) and passenger time label (feedTime) from here; FEEDS
   still owns URLs and labels. `satisfies Record<FeedId, …>` makes the
   compiler reject a feed added to FEEDS without a profile here. Licence
   status is "unrecorded" throughout because no provider licence has been
   re-verified from an official source in this workstream. */

import { FEEDS, type FeedId, REALTIME_GTFS_TTL_MS, REALTIME_SPEED_UNIT } from "../config.js";
import type { ProviderProfile } from "./contract.js";
import { serviceClock, speedToMps, type ServiceClock } from "./normalization.js";

/* public/app.js greys a vehicle marker out after 120 s without a fix. */
const MARKER_STALE_MS = 120 * 1000;
/* src/sg/vehicles.ts caches reconstructed buses for 25 s. */
const SG_VEHICLE_TTL_MS = 25 * 1000;

const unrecorded = { status: "unrecorded", attribution: null } as const;

function malaysiaGtfs(
  feedId: FeedId,
  scope: string[],
  /* agency.txt gives Asia/Singapore for the Johor network (see config.ts). */
  timeZone = "Asia/Kuala_Lumpur"
): ProviderProfile {
  const definition = FEEDS[feedId];
  const live = definition.realtimeUrl !== null;
  return {
    feedId,
    productionEnabled: true,
    country: "MY",
    scope,
    mode: definition.mode,
    ingestion: "gtfs",
    timeZone,
    speedUnit: live ? REALTIME_SPEED_UNIT : null,
    coordinateSystem: "WGS84",
    auth: { kind: "none" },
    capabilities: {
      routes: "provider",
      stops: "provider",
      schedules: "provider",
      ...(live ? { vehicles: "provider" as const } : {}),
      journeyPlanning: "derived"
    },
    freshness: {
      realtimeTtlMs: live ? REALTIME_GTFS_TTL_MS : null,
      staleAfterMs: live ? MARKER_STALE_MS : null
    },
    licence: unrecorded
  };
}

export const PROVIDER_PROFILES = {
  "rapid-bus-kl": malaysiaGtfs("rapid-bus-kl", ["Klang Valley"]),
  "rapid-bus-mrtfeeder": malaysiaGtfs("rapid-bus-mrtfeeder", ["Klang Valley"]),
  "rapid-bus-penang": malaysiaGtfs("rapid-bus-penang", ["Penang"]),
  "rapid-rail-kl": malaysiaGtfs("rapid-rail-kl", ["Klang Valley"]),
  ktmb: malaysiaGtfs("ktmb", ["Peninsular Malaysia"]),
  "mybas-johor": malaysiaGtfs("mybas-johor", ["Johor Bahru"], "Asia/Singapore"),
  "mybas-melaka": malaysiaGtfs("mybas-melaka", ["Melaka"]),
  "mybas-ipoh": malaysiaGtfs("mybas-ipoh", ["Ipoh"]),
  "mybas-seremban-a": malaysiaGtfs("mybas-seremban-a", ["Seremban"]),
  "mybas-seremban-b": malaysiaGtfs("mybas-seremban-b", ["Seremban"]),
  "mybas-alor-setar": malaysiaGtfs("mybas-alor-setar", ["Alor Setar"]),
  "mybas-kangar": malaysiaGtfs("mybas-kangar", ["Kangar"]),
  "mybas-kota-bharu": malaysiaGtfs("mybas-kota-bharu", ["Kota Bharu"]),
  "mybas-kuala-terengganu": malaysiaGtfs("mybas-kuala-terengganu", ["Kuala Terengganu"]),
  "mybas-kuching": malaysiaGtfs("mybas-kuching", ["Kuching"]),

  /* DataMall has no trip timetable or position feed: schedules are expanded
     from published headways and estimated running times, and bus positions
     are reconstructed from per-stop arrival predictions. Both are "derived". */
  "sg-bus": {
    feedId: "sg-bus",
    productionEnabled: true,
    country: "SG",
    scope: ["Singapore"],
    mode: "bus",
    ingestion: "adapter",
    timeZone: "Asia/Singapore",
    speedUnit: null,
    coordinateSystem: "WGS84",
    auth: { kind: "apiKey", envVars: ["LTA_ACCOUNT_KEY"], placement: "header" },
    capabilities: {
      routes: "provider",
      stops: "provider",
      schedules: "derived",
      arrivals: "provider",
      vehicles: "derived",
      journeyPlanning: "derived"
    },
    freshness: { realtimeTtlMs: SG_VEHICLE_TTL_MS, staleAfterMs: MARKER_STALE_MS },
    licence: unrecorded
  },
  "sg-rail": {
    feedId: "sg-rail",
    productionEnabled: true,
    country: "SG",
    scope: ["Singapore"],
    mode: "rail",
    ingestion: "adapter",
    timeZone: "Asia/Singapore",
    speedUnit: null,
    coordinateSystem: "WGS84",
    auth: { kind: "none" },
    capabilities: {
      routes: "derived",
      stops: "provider",
      schedules: "derived",
      journeyPlanning: "derived"
    },
    freshness: { realtimeTtlMs: null, staleAfterMs: null },
    licence: unrecorded
  }
} as const satisfies Record<FeedId, ProviderProfile>;

export function providerProfile(feedId: FeedId): ProviderProfile {
  return PROVIDER_PROFILES[feedId];
}

/** Provider-local service clock without changing the current schedule runtime. */
export function serviceClockForFeed(feedId: FeedId, now: Date = new Date()): ServiceClock {
  return serviceClock(providerProfile(feedId).timeZone, now);
}

/* Passenger-facing abbreviation, chosen by country rather than IANA zone:
   Johor's feed declares Asia/Singapore, but its riders live on Malaysia time. */
const COUNTRY_TIME_LABEL: Record<ProviderProfile["country"], string> = {
  MY: "MYT",
  SG: "SGT",
  JP: "JST",
  CN: "CST"
};

/** Timezone and its short label for showing a feed's times to passengers. */
export function feedTime(feedId: FeedId): { timeZone: string; label: string } {
  const profile = providerProfile(feedId);
  return { timeZone: profile.timeZone, label: COUNTRY_TIME_LABEL[profile.country] };
}

/** Undefined means this provider does not publish a vehicle speed value. */
export function speedToMpsForFeed(
  feedId: FeedId,
  value: number | null | undefined
): number | undefined {
  const unit = providerProfile(feedId).speedUnit;
  return unit ? speedToMps(value, unit) : undefined;
}
