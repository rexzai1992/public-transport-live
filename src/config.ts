import { readFileSync } from "node:fs";

/* Minimal .env loader — the only secret so far is the LTA DataMall key, and a
   dependency for five lines of parsing is not worth it. Real environment
   variables win over the file. */
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf-8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env file — fine */
}

export const DATA_GOV_BASE_URL = "https://api.data.gov.my";

export type TransitMode = "bus" | "rail";

export type FeedDefinition = {
  /** Full name, e.g. "Rapid Bus KL". */
  label: string;
  /** Compact name for chips and badges. */
  short: string;
  mode: TransitMode;
  staticUrl: string;
  /** null when the operator publishes no vehicle positions for this feed. */
  realtimeUrl: string | null;
};

const prasaranaStatic = (category: string) =>
  `${DATA_GOV_BASE_URL}/gtfs-static/prasarana?category=${category}`;
const prasaranaRealtime = (category: string) =>
  `${DATA_GOV_BASE_URL}/gtfs-realtime/vehicle-position/prasarana?category=${category}`;

/* APAD's stage-bus networks outside the Klang Valley. The API takes a city, and
   asking for an invalid one makes it list the valid set itself:
     ['alor-setar', 'ipoh', 'johor', 'kangar', 'kuala-terengganu',
      'kota-bharu', 'kuching', 'melaka', 'seremban-a', 'seremban-b']
   Static redirects to S3; realtime redirects to a trailing slash. Both are
   followed by default, so the plain URLs are kept for readability.

   Branding varies by concession — agency.txt says "BAS.MY-JohorBahru" in Johor
   and Melaka, "THE COMBINE BUS MYBUS" in Ipoh, "MYBUS KR TRAVEL" and
   "MYBUS GOPI TRAVEL" in Seremban, and the operator's own name elsewhere. They
   are labelled by CITY under the API's own umbrella name, because the city is
   what a passenger knows and the operator is not. */
const mybasStatic = (city: string) => `${DATA_GOV_BASE_URL}/gtfs-static/mybas-${city}`;
const mybasRealtime = (city: string) =>
  `${DATA_GOV_BASE_URL}/gtfs-realtime/vehicle-position/mybas-${city}`;

const mybas = (city: string, label: string, short: string) =>
  ({
    label,
    short,
    mode: "bus",
    staticUrl: mybasStatic(city),
    realtimeUrl: mybasRealtime(city)
  }) satisfies FeedDefinition;

/* Every feed the app can serve. Rapid Rail publishes static timetables but no
   vehicle positions — the realtime endpoint 404s — so its realtimeUrl is null
   and the UI presents it as timetable-only rather than as a route with no
   buses running. */
/* rapid-bus-kuantan is deliberately absent: both its static and realtime
   endpoints 404, and the API's own error lists only
   ['rapid-bus-penang', 'rapid-bus-mrtfeeder', 'rapid-rail-kl', 'rapid-bus-kl'].
   The published docs still mention Kuantan, but the feed is gone. */
export const FEEDS = {
  "rapid-bus-kl": {
    label: "Rapid Bus KL",
    short: "KL",
    mode: "bus",
    staticUrl: prasaranaStatic("rapid-bus-kl"),
    realtimeUrl: prasaranaRealtime("rapid-bus-kl")
  },
  "rapid-bus-mrtfeeder": {
    label: "MRT Feeder",
    short: "Feeder",
    mode: "bus",
    staticUrl: prasaranaStatic("rapid-bus-mrtfeeder"),
    realtimeUrl: prasaranaRealtime("rapid-bus-mrtfeeder")
  },
  "rapid-bus-penang": {
    label: "Rapid Penang",
    short: "Penang",
    mode: "bus",
    staticUrl: prasaranaStatic("rapid-bus-penang"),
    realtimeUrl: prasaranaRealtime("rapid-bus-penang")
  },
  "rapid-rail-kl": {
    label: "Rapid Rail KL",
    short: "Rail",
    mode: "rail",
    staticUrl: prasaranaStatic("rapid-rail-kl"),
    realtimeUrl: null
  },
  ktmb: {
    label: "KTM Komuter & ETS",
    short: "KTM",
    mode: "rail",
    staticUrl: `${DATA_GOV_BASE_URL}/gtfs-static/ktmb`,
    realtimeUrl: `${DATA_GOV_BASE_URL}/gtfs-realtime/vehicle-position/ktmb`
  },
  /* BAS.MY (formerly myBAS / MyBus) — ten city networks, every one publishing both a
     full static feed (routes, stops, trips, shapes, calendar) and live vehicle
     positions. Verified against the live API rather than the docs: 136 routes,
     8,530 stops and 332 vehicles reporting within ~70 seconds.

     agency.txt gives Asia/Singapore for Johor and Asia/Kuala_Lumpur elsewhere;
     both are UTC+8, so malaysiaClock() is right for all of them. */
  "mybas-johor": mybas("johor", "BAS.MY Johor Bahru", "Johor"),
  "mybas-melaka": mybas("melaka", "BAS.MY Melaka", "Melaka"),
  "mybas-ipoh": mybas("ipoh", "BAS.MY Ipoh", "Ipoh"),
  "mybas-seremban-a": mybas("seremban-a", "BAS.MY Seremban A", "Sbn A"),
  "mybas-seremban-b": mybas("seremban-b", "BAS.MY Seremban B", "Sbn B"),
  "mybas-alor-setar": mybas("alor-setar", "BAS.MY Alor Setar", "Alor Setar"),
  "mybas-kangar": mybas("kangar", "BAS.MY Kangar", "Kangar"),
  "mybas-kota-bharu": mybas("kota-bharu", "BAS.MY Kota Bharu", "Kota Bharu"),
  "mybas-kuala-terengganu": mybas("kuala-terengganu", "BAS.MY Kuala Terengganu", "K Terengganu"),
  "mybas-kuching": mybas("kuching", "BAS.MY Kuching", "Kuching"),

  /* Singapore: no GTFS upstream. The "sg:" URLs are sentinels — getStaticFeed
     and getVehiclePositions branch to the DataMall adapters in src/sg/ before
     any URL is fetched. Rail needs no API key (curated network, official
     coordinates); buses need LTA_ACCOUNT_KEY. */
  "sg-bus": {
    label: "Singapore Bus",
    short: "SG Bus",
    mode: "bus",
    staticUrl: "sg:bus",
    realtimeUrl: "sg:bus-arrivals"
  },
  "sg-rail": {
    label: "Singapore MRT & LRT",
    short: "SG Rail",
    mode: "rail",
    staticUrl: "sg:rail",
    realtimeUrl: null
  }
} as const satisfies Record<string, FeedDefinition>;

export type FeedId = keyof typeof FEEDS;

export const FEED_IDS = Object.keys(FEEDS) as [FeedId, ...FeedId[]];

export function feedDefinition(id: FeedId): FeedDefinition {
  return FEEDS[id];
}

export const STATIC_GTFS_TTL_MS = 24 * 60 * 60 * 1000;
export const REALTIME_GTFS_TTL_MS = 25 * 1000;
export const REQUEST_TIMEOUT_MS = 15 * 1000;

/* GTFS-RT specifies VehiclePosition.speed in metres per second, but the
   Malaysia Open API feeds publish km/h: bus values of 12.96 and 24.08 read as
   47 and 87 km/h under the spec, and KTM ETS trains report 98-132, which as
   m/s would be 350-475 km/h. Everything downstream (ETA maths, marker glide,
   the UI's own x3.6) assumes m/s, so the conversion happens once, at the edge.
   Set to "mps" if the upstream feed is ever corrected. */
export const REALTIME_SPEED_UNIT: "kmh" | "mps" = "kmh";
