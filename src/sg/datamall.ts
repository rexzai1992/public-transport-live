/* LTA DataMall client. Singapore publishes no GTFS: static data is paginated
   JSON (500 rows a page) and realtime is per-stop arrival predictions, both
   behind an AccountKey header. The key is free but mandatory — without it the
   SG feeds throw and the rest of the app carries on without them. */
import { UpstreamError } from "../http.js";

const BASE = "https://datamall2.mytransport.sg/ltaodataservice";
const PAGE_SIZE = 500;

export function ltaKey(): string | null {
  return process.env.LTA_ACCOUNT_KEY?.trim() || null;
}

async function getJson<T>(path: string): Promise<T> {
  const key = ltaKey();
  if (!key) {
    throw new UpstreamError("LTA_ACCOUNT_KEY is not set — Singapore data is unavailable", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { AccountKey: key, accept: "application/json" }
    });
    if (!response.ok) {
      throw new UpstreamError(`DataMall returned ${response.status} for ${path}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    throw new UpstreamError(`Failed to fetch DataMall ${path}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/* Drain a paginated collection. BusRoutes is ~26k rows = ~52 pages; requests
   run a few at a time so a cold cache builds in seconds, not a minute. */
export async function getAll<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let skip = 0;
  const CONCURRENCY = 4;

  for (;;) {
    const batch = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        getJson<{ value: T[] }>(`${path}?$skip=${skip + i * PAGE_SIZE}`)
      )
    );
    let done = false;
    for (const page of batch) {
      rows.push(...page.value);
      if (page.value.length < PAGE_SIZE) done = true;
    }
    if (done) return rows;
    skip += CONCURRENCY * PAGE_SIZE;
  }
}

export type SgBusStop = {
  BusStopCode: string;
  RoadName: string;
  Description: string;
  Latitude: number;
  Longitude: number;
};

export type SgBusService = {
  ServiceNo: string;
  Operator: string;
  Direction: number;
  Category: string;
  OriginCode: string;
  DestinationCode: string;
  AM_Peak_Freq: string;
  AM_Offpeak_Freq: string;
  PM_Peak_Freq: string;
  PM_Offpeak_Freq: string;
  LoopDesc: string;
};

export type SgBusRouteRow = {
  ServiceNo: string;
  Direction: number;
  StopSequence: number;
  BusStopCode: string;
  Distance: number;
  WD_FirstBus: string;
  WD_LastBus: string;
};

export type SgNextBus = {
  EstimatedArrival: string;
  Latitude: string;
  Longitude: string;
  Load: string;
  Type: string;
};

export type SgArrivalService = {
  ServiceNo: string;
  NextBus: SgNextBus;
  NextBus2: SgNextBus;
  NextBus3: SgNextBus;
};

export function getBusStops(): Promise<SgBusStop[]> {
  return getAll<SgBusStop>("/BusStops");
}

export function getBusServices(): Promise<SgBusService[]> {
  return getAll<SgBusService>("/BusServices");
}

export function getBusRoutes(): Promise<SgBusRouteRow[]> {
  return getAll<SgBusRouteRow>("/BusRoutes");
}

export async function getBusArrival(stopCode: string): Promise<SgArrivalService[]> {
  const data = await getJson<{ Services: SgArrivalService[] }>(
    `/v3/BusArrival?BusStopCode=${encodeURIComponent(stopCode)}`
  );
  return data.Services ?? [];
}

/* Train service alerts: Status 1 = normal, 2 = disrupted. Cached for a minute;
   a missing key degrades to "no alerts" rather than an error, because the
   banner is an extra, never a blocker. */
type TrainAlerts = {
  value?: { Status: number; AffectedSegments?: { Line: string }[]; Message?: { Content: string }[] };
};

let alertsCache: { expiresAt: number; alerts: { line: string; message: string }[] } | null = null;

export async function getTrainAlerts(): Promise<{ line: string; message: string }[]> {
  if (alertsCache && alertsCache.expiresAt > Date.now()) {
    return alertsCache.alerts;
  }
  if (!ltaKey()) {
    return [];
  }
  try {
    const data = await getJson<TrainAlerts>("/TrainServiceAlerts");
    const value = data.value;
    const alerts =
      value && value.Status === 2
        ? (value.AffectedSegments ?? []).map((segment) => ({
            line: segment.Line,
            message: value.Message?.[0]?.Content ?? "Service disruption"
          }))
        : [];
    alertsCache = { expiresAt: Date.now() + 60 * 1000, alerts };
    return alerts;
  } catch {
    return alertsCache?.alerts ?? [];
  }
}

/* Platform crowding, the only real-time train data Singapore publishes:
   10-minute windows per station, per line. Our line ids map onto LTA's —
   the Sengkang/Punggol loops are one system each to LTA, and the stations
   LTA still files under CEL belong to our closed Circle Line. */
const CROWD_LINE: Record<string, string[]> = {
  NSL: ["NSL"], EWL: ["EWL"], CGL: ["CGL"], NEL: ["NEL"], DTL: ["DTL"],
  TEL: ["TEL"], BPL: ["BPL"], CCL: ["CCL", "CEL"],
  "SKL-E": ["SLRT"], "SKL-W": ["SLRT"], "PGL-E": ["PLRT"], "PGL-W": ["PLRT"]
};

type PcdRow = { Station: string; CrowdLevel: string };

const crowdCache = new Map<string, { expiresAt: number; stations: { code: string; level: string }[] }>();

export async function getPlatformCrowd(lineId: string): Promise<{ code: string; level: string }[]> {
  const ltaLines = CROWD_LINE[lineId];
  if (!ltaLines || !ltaKey()) return [];

  const cached = crowdCache.get(lineId);
  if (cached && cached.expiresAt > Date.now()) return cached.stations;

  const rows = (
    await Promise.all(
      ltaLines.map((line) =>
        getJson<{ value: PcdRow[] }>(`/PCDRealTime?TrainLine=${line}`)
          .then((d) => d.value ?? [])
          .catch(() => [])
      )
    )
  ).flat();

  const stations = rows
    .filter((row) => ["l", "m", "h"].includes(row.CrowdLevel))
    .map((row) => ({ code: row.Station, level: row.CrowdLevel }));
  crowdCache.set(lineId, { expiresAt: Date.now() + 90 * 1000, stations });
  return stations;
}

/* Expressway travel times, aggregated per road and direction. */
type TravelRow = { Name: string; Direction: number; FarEndPoint: string; StartPoint: string; EndPoint: string; EstTime: number };

let travelCache: { expiresAt: number; roads: { road: string; towards: string; minutes: number }[] } | null = null;

export async function getExpresswayTimes(): Promise<{ road: string; towards: string; minutes: number }[]> {
  if (travelCache && travelCache.expiresAt > Date.now()) return travelCache.roads;
  const data = await getJson<{ value: TravelRow[] }>("/EstTravelTimes");
  const byRoute = new Map<string, { road: string; towards: string; minutes: number }>();
  for (const row of data.value ?? []) {
    const key = `${row.Name}:${row.Direction}`;
    const entry = byRoute.get(key) ?? { road: row.Name, towards: row.FarEndPoint, minutes: 0 };
    entry.minutes += Number(row.EstTime) || 0;
    byRoute.set(key, entry);
  }
  const roads = [...byRoute.values()].sort((a, b) => a.road.localeCompare(b.road));
  travelCache = { expiresAt: Date.now() + 2 * 60 * 1000, roads };
  return roads;
}
