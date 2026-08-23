import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "node:path";
import { ZodError } from "zod";
import { apiRouter, adminStats, DEFAULT_JOURNEY_FEEDS } from "./routes.js";
import { timingSafeEqual } from "node:crypto";
import { UpstreamError } from "./http.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

/* Behind a reverse proxy the app should not also be reachable directly, so the
   bind address is configurable. Set HOST=127.0.0.1 in production; the default
   keeps local development reachable from other devices on the network. */
const host = process.env.HOST ?? "0.0.0.0";

/* Behind nginx; trust exactly one proxy hop so rate limiting sees the real
   client IP from X-Forwarded-For instead of 127.0.0.1 for everyone. */
app.set("trust proxy", 1);

app.use(morgan("dev"));

/* Security headers. The API is read-only JSON and the shell is same-origin
   static files, so the policy can be strict. connect-src lists the two hosts
   the page itself calls out to (map tiles, fonts). */
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

/* Rate limits: generous for one human, hostile to a script. The journey
   planner burns CPU and Singapore vehicle lookups burn LTA key quota —
   those two get tighter buckets than plain cached reads. */
const SPECIFIC_LIMITS = ["/api/journey", "/api/rapid-bus/sg-bus/vehicles", "/api/rapid-bus/sg-bus/map", "/api/flights"];
const readLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Paths with their own limiter shouldn't also drain (and re-label) this one.
  skip: (req) => SPECIFIC_LIMITS.some((path) => req.originalUrl.startsWith(path))
});
const journeyLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
const vehicleLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
/* Flights ride on free community feeds (adsb.fi wants ~1 req/s total), so the
   scarce resource is upstream goodwill, not our CPU. Tiles need at most
   9 calls per 15 s refresh = 36/min per viewer; 120 leaves headroom without
   letting one tab starve the feed for everyone. Lookups are rarer still. */
const flightTileLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const flightLookupLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/journey", journeyLimiter);
app.use(["/api/rapid-bus/sg-bus/vehicles", "/api/rapid-bus/sg-bus/map"], vehicleLimiter);
app.use(["/api/flights/route", "/api/flights/find"], flightLookupLimiter);
app.use("/api/flights", flightTileLimiter);
app.use("/api", readLimiter);

/* The Android shell serves its pages from the app bundle, so its API calls are
   cross-origin. Everything here is read-only public transit data, so GET is
   opened up; set CORS_ORIGIN to pin it to one origin instead. */
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/* The service worker and the HTML shell must never sit in the browser's HTTP
   cache. express.static sends no Cache-Control, so browsers heuristic-cache
   both — and a browser that holds an old sw.js keeps running that worker, which
   then answers from ITS own cache. Edits to public/ never arrive and the app
   stays frozen on whatever build was loaded first, with no way to tell. These
   two files are small and must always be the server's real answer. */
app.use((req, res, next) => {
  if (req.path === "/sw.js" || req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
  }
  next();
});

/* Admin panel: aggregate usage numbers behind Basic auth. Off entirely (404)
   until ADMIN_PASS is set, so a forgotten env var fails closed, not open. */
function requireAdmin(req: express.Request, res: express.Response): boolean {
  const pass = process.env.ADMIN_PASS;
  if (!pass) {
    res.status(404).end();
    return false;
  }
  const header = req.headers.authorization ?? "";
  const expected = `Basic ${Buffer.from(`admin:${pass}`).toString("base64")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    res.setHeader("WWW-Authenticate", 'Basic realm="admin"');
    res.status(401).end();
    return false;
  }
  return true;
}

app.get("/my-admin/data", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.json(adminStats());
});

app.get("/my-admin", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(ADMIN_HTML);
});

const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PT Live — Admin</title>
<style>
:root { --bg:#f5f6f8; --card:#fff; --ink:#16202c; --ink2:#5b6b7d; --rule:#e3e8ee; --bar:#2563eb; }
@media (prefers-color-scheme: dark){ :root { --bg:#0a1018; --card:#111825; --ink:#e8f0fa; --ink2:#a9c1dd; --rule:#22304a; --bar:#7cc4ff; } }
*{box-sizing:border-box} body{background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px} .sub{color:var(--ink2);font-size:12.5px;margin:0 0 20px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:14px 16px}
.card b{display:block;font-size:24px;font-variant-numeric:tabular-nums}
.card span{color:var(--ink2);font-size:12px}
h2{font-size:14px;margin:22px 0 10px}
.bars{align-items:flex-end;background:var(--card);border:1px solid var(--rule);border-radius:12px;display:flex;gap:3px;height:120px;padding:12px}
.bars div{background:var(--bar);border-radius:3px 3px 0 0;flex:1;min-height:2px;position:relative}
.bars div:hover::after{background:var(--ink);border-radius:6px;bottom:calc(100% + 4px);color:var(--bg);content:attr(data-t);font-size:10.5px;left:50%;padding:2px 7px;position:absolute;transform:translateX(-50%);white-space:nowrap}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--rule);border-radius:12px;overflow:hidden}
td,th{border-top:1px solid var(--rule);font-size:13px;padding:8px 14px;text-align:left}
th{border:0;color:var(--ink2);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td:last-child{font-variant-numeric:tabular-nums;text-align:right}
</style></head><body>
<h1>Public Transport Live</h1><p class="sub" id="sub">Loading\u2026</p>
<div class="grid" id="cards"></div>
<h2>Visits \u2014 last 30 days</h2><div class="bars" id="bars"></div>
<h2>Minutes used \u2014 last 30 days</h2><div class="bars" id="minbars"></div>
<h2>Most opened routes</h2><table id="routes"><tr><th>Route</th><th>Opens</th></tr></table>
<script>
fetch("/my-admin/data").then((r)=>r.json()).then((d)=>{
  const days=Object.entries(d.days).sort((a,b)=>a[0]<b[0]?-1:1).slice(-30);
  const t=d.today;
  document.getElementById("sub").textContent=
    "tracking since "+d.startedTracking+" \u00b7 uptime "+Math.floor(d.uptimeSeconds/3600)+"h "+Math.floor(d.uptimeSeconds%3600/60)+"m \u00b7 rss "+d.memoryMb+" MB";
  const mins=Math.round((t.activeSec||0)/60);
  const avg=t.visits?Math.round((t.activeSec||0)/t.visits):0;
  const cards=[["Total visits",d.visits],["Visits today",t.visits],
    ["Time used today",mins+" min"],["Avg per visit",avg+" s"],
    ["Stayed 30s+",t.s30||0],["Used 3min+",t.s3m||0],["Used 10min+",t.s10m||0],
    ["Routes opened",t.routeViews],["Journeys",t.journeys],["Nearby",t.nearby],
    ["Flight loads",t.flights],["API calls",t.api]];
  document.getElementById("cards").innerHTML=cards.map(([k,v])=>"<div class=card><b>"+(typeof v==="number"?v.toLocaleString():v)+"</b><span>"+k+"</span></div>").join("");
  const max=Math.max(1,...days.map(([,v])=>v.visits));
  document.getElementById("bars").innerHTML=days.map(([k,v])=>
    "<div style=height:"+Math.max(2,Math.round(v.visits/max*100))+"% data-t='"+k.slice(5)+": "+v.visits+"'></div>").join("")||"<span style=color:var(--ink2);font-size:12px>no days yet</span>";
  const maxMin=Math.max(1,...days.map(([,v])=>Math.round((v.activeSec||0)/60)));
  document.getElementById("minbars").innerHTML=days.map(([k,v])=>{
    const m=Math.round((v.activeSec||0)/60);
    return "<div style=height:"+Math.max(2,Math.round(m/maxMin*100))+"% data-t='"+k.slice(5)+": "+m+" min'></div>";
  }).join("")||"<span style=color:var(--ink2);font-size:12px>no days yet</span>";
  document.getElementById("routes").insertAdjacentHTML("beforeend",
    d.topRoutes.map((r)=>"<tr><td>"+r.key+"</td><td>"+r.count+"</td></tr>").join("")||"<tr><td colspan=2>none yet</td></tr>");
});
</script></body></html>`;

app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", apiRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      issues: error.issues
    });
    return;
  }

  if (error instanceof UpstreamError) {
    res.status(error.statusCode).json({
      error: error.message
    });
    return;
  }

  /* Unexpected errors: log the detail, hand the client a generic line —
     internal messages (paths, upstream hostnames) are not for the public. */
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`Rapid Bus Maps Handler listening on http://${host}:${port}`);
  primeJourneyNetwork();
});

/* Building the journey network means fetching and parsing every default feed —
   sixteen of them now — which measured 26 seconds cold against 0.6 warm. Left
   lazy, that whole cost lands on whoever happens to make the first journey
   request after a restart or the daily rollover, and 26 seconds of spinner is
   indistinguishable from a broken app.

   So it is built at boot instead, in the background: the server is already
   serving routes and vehicles while this runs, and a failure only means the
   first real request rebuilds it the old way. Nothing depends on it finishing. */
function primeJourneyNetwork(): void {
  const started = Date.now();
  import("./journey.js")
    .then(({ getNetwork }) => getNetwork(DEFAULT_JOURNEY_FEEDS))
    .then((network) => {
      console.log(
        `[journey] network ready in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
          `(${network.stops.size} stops, ${network.patterns.length} patterns)`
      );
    })
    .catch((error) => {
      console.warn("[journey] priming failed, will build on first request:", error?.message ?? error);
    });
}
