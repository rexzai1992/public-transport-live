/* Usage statistics for the admin panel. Aggregate counters only — no IPs, no
   sessions, no identities: totals, a per-day breakdown, and which routes get
   opened. File-backed with debounced writes so a pm2 restart keeps history.
   Everything here is best-effort; stats must never take the app down. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

type DayStats = {
  visits: number;
  api: number;
  routeViews: number;
  journeys: number;
  nearby: number;
  flights: number;
  /** Seconds of visible, foreground use across all sessions. */
  activeSec: number;
  /** Sessions that stayed at least 30 s / 3 min / 10 min — each counted once. */
  s30: number;
  s3m: number;
  s10m: number;
};

type Stats = {
  startedTracking: string;
  visits: number;
  days: Record<string, DayStats>;
  routes: Record<string, number>;
  /** Display name per route key, recorded when the route is opened. */
  routeNames: Record<string, string>;
};

const DATA_DIR = new URL("../data/", import.meta.url);
const STATS_FILE = new URL("../data/stats.json", import.meta.url);
const LEGACY_VISITS_FILE = new URL("../data/visits.json", import.meta.url);

const EMPTY_DAY: DayStats = { visits: 0, api: 0, routeViews: 0, journeys: 0, nearby: 0, flights: 0, activeSec: 0, s30: 0, s3m: 0, s10m: 0 };

function load(): Stats {
  try {
    const parsed = JSON.parse(readFileSync(STATS_FILE, "utf-8")) as Stats;
    if (parsed && typeof parsed.visits === "number") {
      return { ...parsed, days: parsed.days ?? {}, routes: parsed.routes ?? {}, routeNames: parsed.routeNames ?? {} };
    }
  } catch {
    /* first run, or the file is gone */
  }
  // Carry the pre-panel visit total forward rather than resetting to zero.
  let legacyVisits = 0;
  try {
    legacyVisits = Number(JSON.parse(readFileSync(LEGACY_VISITS_FILE, "utf-8")).visits) || 0;
  } catch {
    /* none */
  }
  return {
    startedTracking: new Date().toISOString().slice(0, 10),
    visits: legacyVisits,
    days: {},
    routes: {},
    routeNames: {}
  };
}

const stats = load();

let writeQueued = false;
function persist() {
  if (writeQueued) return;
  writeQueued = true;
  setTimeout(() => {
    writeQueued = false;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(STATS_FILE, JSON.stringify(stats));
    } catch {
      /* kept in memory until the next successful write */
    }
  }, 3000);
}

/* Malaysia/Singapore share UTC+8; day boundaries follow the app's users. */
function today(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function day(): DayStats {
  const key = today();
  let entry = stats.days[key];
  if (entry) {
    // Days recorded before these fields existed must not NaN the sums.
    entry.activeSec ??= 0;
    entry.s30 ??= 0;
    entry.s3m ??= 0;
    entry.s10m ??= 0;
  }
  if (!entry) {
    entry = { ...EMPTY_DAY };
    stats.days[key] = entry;
    // Keep two months of days; the totals carry the rest.
    const keys = Object.keys(stats.days).sort();
    while (keys.length > 62) {
      delete stats.days[keys.shift()!];
    }
  }
  return entry;
}

export function bumpVisit(): number {
  stats.visits += 1;
  day().visits += 1;
  persist();
  return stats.visits;
}

export function bumpApi(): void {
  day().api += 1;
  persist();
}

export function bumpDay(field: "routeViews" | "journeys" | "nearby" | "flights"): void {
  day()[field] += 1;
  persist();
}

export function bumpActive(seconds: number): void {
  day().activeSec += Math.max(0, Math.min(600, Math.round(seconds)));
  persist();
}

export function bumpTier(tier: "30s" | "3m" | "10m"): void {
  const entry = day();
  if (tier === "30s") entry.s30 += 1;
  else if (tier === "3m") entry.s3m += 1;
  else entry.s10m += 1;
  persist();
}

export function bumpRoute(key: string, name?: string): void {
  stats.routes[key] = (stats.routes[key] ?? 0) + 1;
  if (name) {
    stats.routeNames[key] = name;
  }
  // Cap the table: when it grows past 500 routes, drop the coldest ones.
  const entries = Object.entries(stats.routes);
  if (entries.length > 500) {
    entries.sort((a, b) => b[1] - a[1]);
    stats.routes = Object.fromEntries(entries.slice(0, 400));
    const kept = new Set(Object.keys(stats.routes));
    for (const staleKey of Object.keys(stats.routeNames)) {
      if (!kept.has(staleKey)) delete stats.routeNames[staleKey];
    }
  }
  persist();
}

export function visitTotal(): number {
  return stats.visits;
}

export function getStats() {
  return {
    startedTracking: stats.startedTracking,
    visits: stats.visits,
    today: { ...(stats.days[today()] ?? EMPTY_DAY) },
    days: stats.days,
    topRoutes: Object.entries(stats.routes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([key, count]) => ({ key, name: stats.routeNames[key] ?? key, count })),
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    /* Zone boundaries for the admin gauges. Memory limit mirrors pm2's
       --max-memory-restart; the API budget is a soft self-imposed line to
       notice growth before upstreams or the box do. */
    memoryLimitMb: 1200,
    apiSoftBudget: 100000
  };
}
