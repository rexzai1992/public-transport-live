import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "node:path";
import { ZodError } from "zod";
import { apiRouter, adminStats, sendAdminPush, DEFAULT_JOURNEY_FEEDS } from "./routes.js";
import { seoRouter } from "./seo.js";
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
app.use(express.json({ limit: "16kb" }));

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
/* The web app is one pinned origin, but the Android/iOS shell runs at
   Capacitor's own origins (https://localhost, capacitor://localhost). Those
   must be allowed too or every API call from the APK is CORS-blocked and the
   app wrongly shows "Offline". Reflect the request origin when it is on the
   allow-list; fall back to the pinned web origin otherwise. */
const pinnedOrigin = process.env.CORS_ORIGIN ?? "*";
const allowedOrigins = new Set([pinnedOrigin, "https://localhost", "capacitor://localhost", "http://localhost"]);

app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (pinnedOrigin === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", pinnedOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

app.get("/my-admin/push", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  const title = String(req.query.title ?? "").slice(0, 80).trim();
  const body = String(req.query.body ?? "").slice(0, 300).trim();
  if (!title || !body) {
    res.status(400).json({ error: "title and body required" });
    return;
  }
  try {
    const result = await sendAdminPush(title, body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/my-admin", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(ADMIN_HTML);
});

const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PT Live \u2014 Admin</title>
<style>
:root { --bg:#f5f6f8; --card:#fff; --ink:#16202c; --ink2:#5b6b7d; --rule:#e3e8ee;
  --line:#2563eb; --line2:#0ea5e9; --good:#16a34a; --warn:#d97706; --bad:#dc2626; }
@media (prefers-color-scheme: dark){ :root { --bg:#0a1018; --card:#111825; --ink:#e8f0fa; --ink2:#a9c1dd; --rule:#22304a;
  --line:#7cc4ff; --line2:#5eead4; --good:#4ade80; --warn:#fbbf24; --bad:#f87171; } }
*{box-sizing:border-box} body{background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;max-width:980px;margin-inline:auto}
h1{font-size:20px;margin:0 0 4px} .sub{color:var(--ink2);font-size:12.5px;margin:0 0 20px}
h2{font-size:14px;margin:24px 0 10px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.card{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:13px 15px}
.card b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
.card span{color:var(--ink2);font-size:11.5px}
.panel{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:16px}
svg text{fill:var(--ink2);font:10.5px system-ui}
.gauge{margin:10px 0 2px}
.gauge .glabel{display:flex;font-size:12.5px;justify-content:space-between;margin-bottom:5px}
.gauge .glabel b{font-variant-numeric:tabular-nums}
.gtrack{background:linear-gradient(to right,
    color-mix(in srgb,var(--good) 22%, transparent) 0 70%,
    color-mix(in srgb,var(--warn) 30%, transparent) 70% 85%,
    color-mix(in srgb,var(--bad) 30%, transparent) 85% 100%);
  border:1px solid var(--rule);border-radius:99px;height:14px;overflow:hidden;position:relative}
.gfill{border-radius:99px;height:100%;transition:width .4s}
.gfill.ok{background:var(--good)} .gfill.warn{background:var(--warn)} .gfill.bad{background:var(--bad)}
.zones{color:var(--ink2);display:flex;font-size:10.5px;justify-content:space-between;margin-top:3px}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--rule);border-radius:12px;overflow:hidden}
td,th{border-top:1px solid var(--rule);font-size:13px;padding:8px 14px;text-align:left}
th{border:0;color:var(--ink2);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td:last-child{font-variant-numeric:tabular-nums;text-align:right}
.legend{color:var(--ink2);font-size:11.5px;margin:6px 2px 0}
.legend i{border-radius:2px;display:inline-block;height:3px;margin:0 5px 3px 12px;width:18px;vertical-align:middle}
</style></head><body>
<h1>Public Transport Live</h1><p class="sub" id="sub">Loading\u2026</p>

<h2>System health</h2>
<div class="panel" id="health"></div>

<h2>Today</h2>
<div class="grid" id="cards"></div>

<h2>Last 30 days</h2>
<div class="panel"><div id="chart"></div>
<div class="legend"><i style="background:var(--line)"></i>visits <i style="background:var(--line2)"></i>minutes used</div></div>

<h2 id=fbh>Feedback</h2>
<table id="fb"><tr><th>When (MYT)</th><th>Stars</th><th>Suggestion</th></tr></table>

<h2>Send announcement</h2>
<div class="panel">
  <input id="pt" placeholder="Title (e.g. Service update)" maxlength="80" style="width:100%;margin-bottom:8px;padding:9px 12px;border:1px solid var(--rule);border-radius:8px;background:var(--card);color:var(--ink);font:inherit">
  <textarea id="pb" placeholder="Message to all push devices…" maxlength="300" rows="2" style="width:100%;padding:9px 12px;border:1px solid var(--rule);border-radius:8px;background:var(--card);color:var(--ink);font:inherit"></textarea>
  <button id="ps" style="margin-top:8px;background:var(--bar);border:0;border-radius:8px;color:#fff;cursor:pointer;font:inherit;font-weight:600;padding:9px 18px">Send to all devices</button>
  <span id="pr" style="margin-left:10px;color:var(--ink2);font-size:12.5px"></span>
</div>
<script>
document.getElementById("ps").addEventListener("click",async()=>{
  const t=document.getElementById("pt").value.trim(),b=document.getElementById("pb").value.trim();
  if(!t||!b){document.getElementById("pr").textContent="title + message needed";return;}
  document.getElementById("pr").textContent="sending…";
  try{const r=await fetch("/my-admin/push?title="+encodeURIComponent(t)+"&body="+encodeURIComponent(b));const j=await r.json();
    document.getElementById("pr").textContent=r.ok?("sent to "+j.sent+", failed "+j.failed):("error: "+(j.error||r.status));
    if(r.ok){document.getElementById("pt").value="";document.getElementById("pb").value="";}
  }catch(e){document.getElementById("pr").textContent="failed";}
});
</script>

<h2>Guide pages — most read</h2>
<table id="gp"><tr><th>Page</th><th>Views</th></tr></table>

<h2>Most opened routes</h2>
<table id="routes"><tr><th>Route</th><th>Opens</th></tr></table>

<script>
function gauge(label, value, max, unit, note){
  const pct=Math.min(100, value/max*100);
  const cls=pct>=85?"bad":pct>=70?"warn":"ok";
  return "<div class=gauge><div class=glabel><span>"+label+"</span><b>"+value.toLocaleString()+" / "+max.toLocaleString()+" "+unit+"</b></div>"+
    "<div class=gtrack><div class='gfill "+cls+"' style='width:"+pct.toFixed(1)+"%'></div></div>"+
    "<div class=zones><span>ok</span><span>warn \u2265 70%</span><span>"+note+"</span></div></div>";
}

function chart(days){
  const W=900,H=220,P={l:44,r:14,t:12,b:26};
  const iw=W-P.l-P.r, ih=H-P.t-P.b;
  const vis=days.map(([,v])=>v.visits||0);
  const min=days.map(([,v])=>Math.round((v.activeSec||0)/60));
  const maxY=Math.max(4,...vis,...min);
  const step=Math.ceil(maxY/4);
  const x=(i)=>P.l+(days.length<2?iw/2:i*(iw/(days.length-1)));
  const y=(v)=>P.t+ih-(v/(step*4))*ih;
  const path=(arr)=>arr.map((v,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)).join(" ");
  let g="";
  for(let t=0;t<=4;t++){const yy=y(step*t);
    g+="<line x1="+P.l+" y1="+yy+" x2="+(W-P.r)+" y2="+yy+" stroke=var(--rule) stroke-width=1 />"+
       "<text x="+(P.l-8)+" y="+(yy+3.5)+" text-anchor=end>"+(step*t)+"</text>";}
  const lx=Math.max(1,Math.floor(days.length/6));
  days.forEach(([k],i)=>{ if(i%lx===0||i===days.length-1)
    g+="<text x="+x(i)+" y="+(H-8)+" text-anchor=middle>"+k.slice(5)+"</text>";});
  const dots=(arr,col)=>arr.map((v,i)=>"<circle cx="+x(i).toFixed(1)+" cy="+y(v).toFixed(1)+" r=2.6 fill="+col+"><title>"+days[i][0].slice(5)+": "+v+"</title></circle>").join("");
  return "<svg viewBox='0 0 "+W+" "+H+"' style='width:100%;height:auto'>"+g+
    "<path d='"+path(vis)+"' fill=none stroke=var(--line) stroke-width=2.2 />"+
    "<path d='"+path(min)+"' fill=none stroke=var(--line2) stroke-width=2 stroke-dasharray='5 4' />"+
    dots(vis,"var(--line)")+dots(min,"var(--line2)")+"</svg>";
}

fetch("/my-admin/data").then((r)=>r.json()).then((d)=>{
  const days=Object.entries(d.days).sort((a,b)=>a[0]<b[0]?-1:1).slice(-30);
  const t=d.today;
  document.getElementById("sub").textContent=
    "tracking since "+d.startedTracking+" \u00b7 uptime "+Math.floor(d.uptimeSeconds/3600)+"h "+Math.floor(d.uptimeSeconds%3600/60)+"m";
  document.getElementById("health").innerHTML=
    gauge("Memory (RSS)", d.memoryMb, d.memoryLimitMb, "MB", "pm2 restarts at 100%")+
    gauge("API calls today", t.api||0, d.apiSoftBudget, "calls", "soft budget");
  const mins=Math.round((t.activeSec||0)/60);
  const avg=t.visits?Math.round((t.activeSec||0)/t.visits):0;
  const cards=[["Total visits",d.visits],["Visits today",t.visits],
    ["Time used",mins+" min"],["Avg / visit",avg+" s"],
    ["Stayed 30s+",t.s30||0],["Used 3min+",t.s3m||0],["Used 10min+",t.s10m||0],
    ["Routes opened",t.routeViews],["Journeys",t.journeys],["Nearby",t.nearby],["Flights",t.flights],
    ["PWA devices (all time)",d.pwaDevices||0],["APK devices (all time)",d.apkDevices||0],
    ["PWA installs seen",d.pwaInstalls||0],["PWA visits today",t.pwa||0],["APK visits today",t.apk||0],
    ["Browser visits today",Math.max(0,(t.visits||0)-(t.pwa||0)-(t.apk||0))],
    ["Guide views today",t.guideViews||0],["Came from guide",t.fromGuide||0],
    ["Push devices (app)",d.pushDevices||0],["Push devices (web)",d.webPushDevices||0]];
  document.getElementById("cards").innerHTML=cards.map(([k,v])=>"<div class=card><b>"+(typeof v==="number"?v.toLocaleString():v)+"</b><span>"+k+"</span></div>").join("");
  document.getElementById("chart").innerHTML=days.length?chart(days):"<span style=color:var(--ink2);font-size:12px>no days yet</span>";
  document.getElementById("fbh").textContent="Feedback"+(d.feedbackCount?" \u2014 "+d.feedbackAvg+"\u2605 avg \u00b7 "+d.feedbackCount+" total":"");
  document.getElementById("fb").insertAdjacentHTML("beforeend",
    (d.feedback||[]).map((f)=>"<tr><td>"+f.at+"</td><td>"+"\u2605".repeat(f.stars)+"</td><td>"+(f.msg?f.msg.replace(/[<>&]/g,(c)=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c])):"\u2014")+"</td></tr>").join("")||"<tr><td colspan=3>none yet</td></tr>");
  document.getElementById("gp").insertAdjacentHTML("beforeend",
    (d.guidePages||[]).map((g)=>"<tr><td>"+g[0]+"</td><td>"+g[1]+"</td></tr>").join("")||"<tr><td colspan=2>none yet</td></tr>");
  document.getElementById("routes").insertAdjacentHTML("beforeend",
    d.topRoutes.map((r)=>"<tr><td title='"+r.key+"'>"+(r.name||r.key)+"</td><td>"+r.count+"</td></tr>").join("")||"<tr><td colspan=2>none yet</td></tr>");
});
</script></body></html>`;

/* Route landing pages + dynamic sitemap, registered before the static dir so
   /sitemap.xml here beats the old hand-written file. */
app.use(seoRouter);

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
