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
  /** Visits arriving from an installed surface. */
  pwa: number;
  apk: number;
  /** Guide (blog) page views, and app visits that came from the guide. */
  guideViews: number;
  fromGuide: number;
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
  /** In-app ratings and improvement suggestions, newest last, capped. */
  feedback: { at: string; stars: number; msg?: string }[];
  /** Home-screen installs observed (Chromium appinstalled events). */
  pwaInstalls: number;
  /** Distinct installed devices seen at least once (counted on first
      standalone open, so it includes iOS and pre-tracking installs). */
  pwaDevices: number;
  apkDevices: number;
  /** Views per guide page, capped like the routes table. */
  guidePages: Record<string, number>;
};

const DATA_DIR = new URL("../data/", import.meta.url);
const STATS_FILE = new URL("../data/stats.json", import.meta.url);
const LEGACY_VISITS_FILE = new URL("../data/visits.json", import.meta.url);

const EMPTY_DAY: DayStats = { visits: 0, api: 0, routeViews: 0, journeys: 0, nearby: 0, flights: 0, activeSec: 0, s30: 0, s3m: 0, s10m: 0, pwa: 0, apk: 0, guideViews: 0, fromGuide: 0 };

function load(): Stats {
  try {
    const parsed = JSON.parse(readFileSync(STATS_FILE, "utf-8")) as Stats;
    if (parsed && typeof parsed.visits === "number") {
      return { ...parsed, days: parsed.days ?? {}, routes: parsed.routes ?? {}, routeNames: parsed.routeNames ?? {}, feedback: parsed.feedback ?? [], pwaInstalls: parsed.pwaInstalls ?? 0, pwaDevices: parsed.pwaDevices ?? 0, apkDevices: parsed.apkDevices ?? 0, guidePages: parsed.guidePages ?? {} };
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
    routeNames: {},
    feedback: [],
    pwaInstalls: 0,
    pwaDevices: 0,
    apkDevices: 0,
    guidePages: {}
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
    entry.pwa ??= 0;
    entry.apk ??= 0;
    entry.guideViews ??= 0;
    entry.fromGuide ??= 0;
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

export function bumpVisit(src?: string): number {
  stats.visits += 1;
  const entry = day();
  entry.visits += 1;
  if (src === "pwa") entry.pwa += 1;
  else if (src === "apk") entry.apk += 1;
  persist();
  return stats.visits;
}

export function bumpInstall(): void {
  stats.pwaInstalls += 1;
  persist();
}

export function bumpGuideView(page: string): void {
  day().guideViews += 1;
  stats.guidePages[page] = (stats.guidePages[page] ?? 0) + 1;
  const entries = Object.entries(stats.guidePages);
  if (entries.length > 200) {
    entries.sort((a, b) => b[1] - a[1]);
    stats.guidePages = Object.fromEntries(entries.slice(0, 150));
  }
  persist();
}

export function bumpFromGuide(): void {
  day().fromGuide += 1;
  persist();
}

export function bumpDevice(kind: "pwa" | "apk"): void {
  if (kind === "pwa") stats.pwaDevices += 1;
  else stats.apkDevices += 1;
  persist();
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

export function addFeedback(stars: number, msg?: string): void {
  stats.feedback.push({
    at: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " "),
    stars,
    msg: msg?.slice(0, 500) || undefined
  });
  if (stats.feedback.length > 200) {
    stats.feedback = stats.feedback.slice(-200);
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
    pwaInstalls: stats.pwaInstalls,
    guidePages: Object.entries(stats.guidePages).sort((a, b) => b[1] - a[1]).slice(0, 12),
    pwaDevices: stats.pwaDevices,
    apkDevices: stats.apkDevices,
    feedback: stats.feedback.slice(-40).reverse(),
    feedbackAvg: stats.feedback.length
      ? Math.round((stats.feedback.reduce((sum, f) => sum + f.stars, 0) / stats.feedback.length) * 10) / 10
      : null,
    feedbackCount: stats.feedback.length,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    /* Zone boundaries for the admin gauges. Memory limit mirrors pm2's
       --max-memory-restart; the API budget is a soft self-imposed line to
       notice growth before upstreams or the box do. */
    memoryLimitMb: 1200,
    apiSoftBudget: 100000
  };
}
