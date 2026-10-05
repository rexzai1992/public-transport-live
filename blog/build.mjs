/* Static guide builder — zero dependencies, same philosophy as the app.
   Posts are HTML fragments in posts/ with a <!--meta {...}--> header; this
   wraps them in the site template and emits dist/ ready for Cloudflare Pages:
   index, a hub per country, per-post pages, sitemap and RSS.

   Post meta: title, desc, date, accent (a line colour), country ("my", "sg"
   or "both") and topic (one of TOPICS). */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
const SITE = "https://travel-guide.kaynx1.com";
const APP = "https://public.kaynx1.com";
/* App links carry ?ref=guide so the admin panel can count guide→app arrivals. */
const APP_REF = `${APP}/?ref=guide`;
/* Where route figures are read from. Links always point at the live site;
   GUIDE_DATA_API lets a build read from a local server instead. */
const DATA = (process.env.GUIDE_DATA_API || APP).replace(/\/$/, "");

const TOPICS = ["Getting around", "Fares & passes", "Sights", "Cities", "Between cities", "Airports & borders"];
const COUNTRIES = {
  my: {
    name: "Malaysia",
    slug: "malaysia",
    intro: "Kuala Lumpur's rail network does most of the work in the Klang Valley — LRT, MRT, Monorail and KTM Komuter, with Rapid KL buses filling the gaps. Beyond KL, Penang, Melaka, Johor Bahru and a dozen other cities run their own bus networks, and KTM's ETS trains link them up the west coast.",
    accent: "#0a7d3c"
  },
  sg: {
    name: "Singapore",
    slug: "singapore",
    intro: "Singapore's MRT reaches almost everywhere a visitor goes, trains come every few minutes, and one tap of a bank card pays for both trains and buses. These guides cover the lines, the fares and the quickest way to the sights.",
    accent: "#d42e12"
  }
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* The same black-and-white system as the app and its /routes pages. Colour
   appears only as a line colour: each guide carries one, like a route. */
const style = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="${APP}/assets/bus.svg">
<style>
:root{--bg:#f5f5f5;--card:rgba(255,255,255,.8);--raised:#fff;--ink:#0a0a0a;--ink2:rgba(0,0,0,.64);--ink3:rgba(0,0,0,.44);--rule:rgba(0,0,0,.08);--hover:rgba(0,0,0,.04);--inv:#0a0a0a;--invink:#fff;--r:16px;color-scheme:light;
  /* Older posts style inline with the previous token names. */
  --panel:var(--card);--edge:var(--rule);--edge-strong:var(--ink3);--shadow:none;--ink-2:var(--ink2);--ink-3:var(--ink3)}
@media (prefers-color-scheme:dark){:root{--bg:#080808;--card:rgba(22,22,22,.8);--raised:#161616;--ink:#fff;--ink2:rgba(255,255,255,.68);--ink3:rgba(255,255,255,.44);--rule:rgba(255,255,255,.09);--hover:rgba(255,255,255,.06);--inv:#fff;--invink:#0a0a0a;color-scheme:dark}}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:16px/1.7 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration-color:var(--accent,var(--ink3));text-decoration-thickness:2px;text-underline-offset:3px}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:6px}
.top{backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);background:color-mix(in srgb,var(--bg) 85%,transparent);border-bottom:1px solid var(--rule);position:sticky;top:0;z-index:20}
.top-in{align-items:center;display:flex;gap:14px;margin:0 auto;max-width:1120px;padding:10px 20px}
.brand{align-items:center;display:flex;font-size:15px;font-weight:600;gap:10px;letter-spacing:-.01em;text-decoration:none;white-space:nowrap}
.brand small{color:var(--ink3);font-weight:500;margin-left:2px}
.mark{background:var(--inv);border-radius:8px;display:grid;flex:none;height:30px;place-items:center;width:30px}
.top nav{align-items:center;display:flex;gap:2px;margin-left:auto}
.top nav a{border-radius:8px;color:var(--ink2);font-size:13.5px;font-weight:500;padding:7px 10px;text-decoration:none}
.top nav a:hover,.top nav a[aria-current]{background:var(--hover);color:var(--ink)}
.top nav a.go{background:var(--inv);color:var(--invink);font-weight:600;margin-left:4px}
@media (max-width:560px){.brand .bt{display:none}.top nav a.rt{display:none}}
main{margin:0 auto;max-width:1120px;padding:0 20px 72px}
.crumbs{color:var(--ink3);font-size:12.5px;margin:22px 0 0}
.crumbs a{color:var(--ink2);text-decoration:none}
/* Hero: the night map, darkened flat (no gradients, per the design brief). */
.hero{background:#050505 url("/img/hero-banner.webp") center/cover no-repeat;border-radius:20px;margin-top:20px;overflow:hidden;position:relative}
.hero::after{background:rgba(5,5,5,.72);content:"";inset:0;position:absolute}
.hero-in{color:#fff;padding:44px 40px;position:relative;z-index:1}
.eyebrow{color:rgba(255,255,255,.6);font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.hero h1{font-size:clamp(28px,4vw,42px);font-weight:800;letter-spacing:-.03em;line-height:1.1;margin:10px 0 12px;max-width:16ch}
.hero p{color:rgba(255,255,255,.74);font-size:16.5px;margin:0 0 24px;max-width:50ch}
.btn{background:#fff;border-radius:11px;color:#0a0a0a;display:inline-block;font-size:14.5px;font-weight:650;margin:0 8px 8px 0;padding:12px 20px;text-decoration:none}
.btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.chips span{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:999px;color:rgba(255,255,255,.8);font-size:12.5px;padding:6px 13px}
.chips b{color:#fff;font-variant-numeric:tabular-nums}
.cap{align-items:baseline;display:flex;gap:12px;justify-content:space-between;margin:44px 0 14px}
.cap h2{font-size:22px;letter-spacing:-.02em;margin:0}
.cap a{color:var(--ink2);font-size:14px;font-weight:500;text-decoration:none}
.cap a:hover{color:var(--ink)}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.card{background:var(--card);border:1px solid var(--rule);border-radius:var(--r);display:flex;flex-direction:column;overflow:hidden;text-decoration:none;transition:border-color .15s,transform .15s}
.card:hover{border-color:var(--ink3);transform:translateY(-2px)}
.card::before{background:var(--accent,var(--ink));content:"";height:4px}
.card img{aspect-ratio:2/1;display:block;object-fit:cover;width:100%}
.card .cb{padding:15px 17px 17px}
.card .ct{color:var(--ink3);font-size:11.5px;font-weight:600;letter-spacing:.06em;margin-bottom:6px;text-transform:uppercase}
.card b{display:block;font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.3}
.card span{color:var(--ink2);display:block;font-size:13.5px;line-height:1.55;margin-top:6px}
.topic{margin-top:30px}
.topic h3{color:var(--ink3);font-size:12px;font-weight:700;letter-spacing:.1em;margin:0 0 10px;text-transform:uppercase}
.nets{display:flex;flex-wrap:wrap;gap:8px}
.nets a{background:var(--card);border:1px solid var(--rule);border-radius:999px;font-size:13px;padding:7px 13px;text-decoration:none}
.nets a span{color:var(--ink3);margin-left:4px}
.lead{color:var(--ink2);font-size:17px;max-width:62ch}
/* Articles: the guide's line colour runs down the headings like a route. */
article{max-width:760px}
article h1{font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-.03em;line-height:1.15;margin:14px 0 10px}
.meta{color:var(--ink3);font-size:13.5px;margin:0 0 24px}
article h2{border-left:4px solid var(--accent,var(--ink));font-size:21px;letter-spacing:-.015em;line-height:1.3;margin:38px 0 12px;padding-left:12px}
article h3{font-size:16.5px;margin:26px 0 8px}
article p,article li{max-width:70ch}
article li{margin:4px 0}
table{background:var(--card);border:1px solid var(--rule);border-collapse:separate;border-radius:var(--r);border-spacing:0;font-size:14.5px;margin:18px 0;overflow:hidden;width:100%}
th{border-bottom:1px solid var(--rule);color:var(--ink3);font-size:11.5px;font-weight:600;letter-spacing:.06em;padding:10px 14px;text-align:left;text-transform:uppercase}
td{border-top:1px solid var(--rule);font-variant-numeric:tabular-nums;padding:10px 14px;vertical-align:top}
tr:nth-child(2) td{border-top:0}
.tablewrap{overflow-x:auto}
td:last-child a{white-space:nowrap}
.bd{background:var(--bc,var(--inv));border-radius:6px;color:var(--bt,var(--invink));display:inline-block;font-size:12.5px;font-weight:700;padding:2px 8px;white-space:nowrap}
blockquote{background:var(--card);border:1px solid var(--rule);border-left:4px solid var(--accent,var(--ink));border-radius:0 12px 12px 0;color:var(--ink2);margin:18px 0;padding:12px 18px}
blockquote b{color:var(--ink)}
.tip{background:var(--card);border:1px solid var(--rule);border-radius:14px;margin:18px 0;padding:14px 18px}
.tip b:first-child{display:block;font-size:12px;letter-spacing:.08em;margin-bottom:4px;text-transform:uppercase}
figure{margin:22px 0}
figure img{border:1px solid var(--rule);border-radius:var(--r);display:block;height:auto;width:100%}
figcaption{color:var(--ink3);font-size:12px;margin-top:6px}
.gmap{background:var(--card);border:1px solid var(--rule);border-radius:var(--r);margin:22px 0;overflow:hidden;position:relative}
.gmap svg{display:block;height:auto;width:100%}
.gmap .ln path{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:4.5}
.gmap .st circle{stroke:var(--bg);stroke-width:2.5}
.gmap .lb{background:color-mix(in srgb,var(--raised) 88%,transparent);border-radius:6px;font-size:12px;font-weight:600;padding:2px 6px;position:absolute;transform:translate(10px,-50%);white-space:nowrap}
.gmap .lb.l{transform:translate(calc(-100% - 10px),-50%)}
.gmap .legend{border-top:1px solid var(--rule);display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;padding:10px 14px}
.gmap .legend span{align-items:center;display:inline-flex;gap:6px}
.gmap .legend i{border-radius:2px;display:inline-block;height:4px;width:18px}
.cta{background:var(--inv);border-radius:11px;color:var(--invink);display:inline-block;font-weight:650;margin:10px 10px 0 0;padding:12px 20px;text-decoration:none}
.more{border-top:1px solid var(--rule);margin-top:44px;padding-top:6px}
.foot{border-top:1px solid var(--rule);color:var(--ink3);font-size:12.5px;line-height:1.7;margin-top:48px;padding-top:16px}
.foot a{color:var(--ink2);text-decoration-color:var(--ink3);text-decoration-thickness:1px}
@media (max-width:640px){.hero-in{padding:32px 22px}.cap h2{font-size:19px}td,th{padding:9px 11px}.gmap .lb.minor{display:none}}
</style>`;

const BUS_MARK = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-1.4 2.25v1.6a1.3 1.3 0 0 1-2.6 0v-1.1H7.5v1.1a1.3 1.3 0 0 1-2.6 0v-1.6A2.5 2.5 0 0 1 3.5 15.5v-9A2.5 2.5 0 0 1 6 4Z" fill="var(--invink)"/><rect x="5.6" y="6.4" width="12.8" height="4.9" rx="1" fill="var(--inv)"/><circle cx="7.9" cy="14.4" r="1.15" fill="var(--inv)"/><circle cx="16.1" cy="14.4" r="1.15" fill="var(--inv)"/></svg>`;

const page = ({ title, desc, canonical, body, accent = "", current = "", head = "" }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" href="${SITE}/rss.xml">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#080808" media="(prefers-color-scheme: dark)">
${head}${style}</head><body>
<header class="top"><div class="top-in">
<a class="brand" href="/"><span class="mark">${BUS_MARK}</span><span class="bt">Public Transport Live <small>Guides</small></span></a>
<nav aria-label="Guides"><a href="/malaysia"${current === "my" ? ' aria-current="page"' : ""}>Malaysia</a><a href="/singapore"${current === "sg" ? ' aria-current="page"' : ""}>Singapore</a><a class="rt" href="${APP}/routes">Routes</a><a class="go" href="${APP_REF}">Live map</a></nav>
</div></header>
<main${accent ? ` style="--accent:${accent}"` : ""}>
${body}
<p class="foot">Public Transport Live is an independent guide built on open data, not affiliated with any operator.
Fares, rules and timetables change — check the <a href="${APP_REF}">live tracker</a> and the operator before you travel.<br>
Route figures and maps: Malaysia Open API (Prasarana, KTMB, APAD) and LTA DataMall · Map data &copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> contributors
&nbsp;·&nbsp; <a href="${APP}/download/ptlive.apk">Android app</a> &nbsp;·&nbsp; <a href="${APP}/terms.html">Terms &amp; Privacy</a></p>
</main>
<script>try{fetch("${APP}/api/guide-view?page="+encodeURIComponent(location.pathname),{mode:"no-cors"})}catch(e){}</script>
</body></html>`;

/* ------------------------------------------------------------------------ */
/* Real data, not filler. Posts embed placeholders resolved at build time    */
/* from the live tracker's own API — the same feeds the app serves:          */
/*   {{ends:category:CODE}}   "Kwasa Damansara ↔ Kajang"                     */
/*   {{stops:category:CODE}}  31                                             */
/*   {{link:category:CODE}}   URL of the route's stops & times page          */
/*   {{routes:category:A|B}}  a table of those routes with links              */
/*   {{map:category:A|B}}     a drawn map of those routes                     */
/* A guide that says "31 stations" got it from the GTFS feed.                */
/* ------------------------------------------------------------------------ */
async function fetchJson(url) {
  url = url.replace(APP, DATA);
  const response = await fetch(url, { headers: { "user-agent": "blog-builder" } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

const listCache = new Map();
async function routeList(category) {
  if (!listCache.has(category)) listCache.set(category, fetchJson(`${APP}/api/rapid-bus/${category}/routes`).then((d) => d.routes || []));
  return listCache.get(category);
}

const routeCache = new Map();
async function routeFacts(category, code) {
  const key = `${category}:${code}`;
  if (routeCache.has(key)) return routeCache.get(key);
  const route = (await routeList(category)).find(
    (r) => (r.shortName || "") === code || (r.longName || "") === code || r.routeId === code
  );
  if (!route) throw new Error(`route not found: ${key}`);
  const map = await fetchJson(`${APP}/api/rapid-bus/${category}/map?routeId=${encodeURIComponent(route.routeId)}`);
  const pattern = map.patterns?.[0];
  const features = map.geojson?.features ?? [];
  const facts = {
    code,
    route,
    ends: pattern ? `${tidy(pattern.from)} ↔ ${tidy(pattern.to)}` : "—",
    from: pattern ? tidy(pattern.from) : "",
    to: pattern ? tidy(pattern.to) : "",
    stops: features.filter((f) => f.properties.kind === "stop").length,
    stopPoints: features.filter((f) => f.properties.kind === "stop").map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: tidy(f.properties.name) })),
    shapes: features.filter((f) => f.geometry.type === "LineString").map((f) => f.geometry.coordinates.map(([lon, lat]) => ({ lon, lat }))),
    link: `${APP}/route/${category}/${encodeURIComponent(route.routeId)}`,
    colour: route.color ? `#${route.color}` : "",
    text: route.textColor ? `#${route.textColor}` : "#fff",
    rail: route.type && route.type !== "3"
  };
  routeCache.set(key, facts);
  return facts;
}

/* Feed names arrive in ALL CAPS on some networks; operator stop codes
   ("KJ461 ", "(M) ") are not names. */
function tidy(name) {
  const clean = String(name || "").replace(/^\([^)]*\)\s*/, "").replace(/^[A-Z]{1,3}\d+\s+/, "").trim();
  if (/[a-z]/.test(clean)) return clean;
  const keep = new Set(["KL", "KLCC", "KLIA", "LRT", "MRT", "KTM", "BRT", "ETS", "JB", "PJ", "UKM", "USM", "UITM", "AEON", "MBKT", "SK", "SMK", "CIQ"]);
  return clean.replace(/[A-Z0-9'’]+/g, (w) => (keep.has(w) || (/\d/.test(w) && w.length <= 6) ? w : w === "VIA" ? "via" : w[0] + w.slice(1).toLowerCase()));
}

const badge = (facts) => {
  const style = facts.rail && facts.colour ? ` style="--bc:${facts.colour};--bt:${facts.text}"` : "";
  return `<span class="bd"${style}>${esc(facts.code.replace(/\s+Line$/i, ""))}</span>`;
};

async function routesTable(category, codes) {
  const rows = [];
  for (const code of codes) {
    try {
      const f = await routeFacts(category, code);
      // Both directions run; a loop starts and ends at the same place.
      const runs = f.from === f.to ? `Loop from ${esc(f.from)}` : `${esc(f.from)} ↔ ${esc(f.to)}`;
      rows.push(`<tr><td>${badge(f)}</td><td>${runs}</td><td>${f.stops}</td><td><a href="${f.link}">Stops &amp; times</a></td></tr>`);
    } catch (error) {
      console.warn(`routes table: ${error.message}`);
    }
  }
  return rows.length
    ? `<div class="tablewrap"><table><tr><th>Route</th><th>Runs</th><th>Stops</th><th></th></tr>${rows.join("")}</table></div>`
    : "";
}

/* A drawn map of several routes: their real shapes from the feed, ends
   labelled. Buses have no line colour of their own, so they take shades of
   ink; trains keep theirs. */
const INKS = ["var(--ink)", "#6b6b6b", "#a3a3a3", "#3d3d3d", "#8a8a8a"];
async function routesMap(category, codes) {
  const list = [];
  for (const code of codes) {
    try {
      list.push(await routeFacts(category, code));
    } catch (error) {
      console.warn(`map: ${error.message}`);
    }
  }
  if (!list.length) return "";
  const W = 760, H = 430, pad = 50;
  const pts = list.flatMap((f) => [...f.shapes.flat(), ...f.stopPoints]);
  if (pts.length < 2) return "";
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of pts) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon); }
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const sx = Math.max((maxLon - minLon) * kx, 1e-4), sy = Math.max(maxLat - minLat, 1e-4);
  const scale = Math.min((W - pad * 2) / sx, (H - pad * 2) / sy);
  const ox = (W - sx * scale) / 2, oy = (H - sy * scale) / 2;
  const P = (p) => ({ x: ox + (p.lon - minLon) * kx * scale, y: oy + (maxLat - p.lat) * scale });

  let busIndex = 0;
  const colours = list.map((f) => (f.rail && f.colour ? f.colour : INKS[busIndex++ % INKS.length]));
  const paths = list.map((f, i) => {
    const lines = f.shapes.length ? f.shapes : [f.stopPoints];
    return lines.map((line) => {
      let last = null; const d = [];
      for (const point of line) {
        const at = P(point);
        if (last && Math.hypot(at.x - last.x, at.y - last.y) < 1.5) continue;
        d.push(`${d.length ? "L" : "M"}${at.x.toFixed(1)} ${at.y.toFixed(1)}`); last = at;
      }
      return `<path d="${d.join("")}" style="stroke:${colours[i]}"/>`;
    }).join("");
  }).join("");

  const placed = []; const labels = []; const dots = [];
  const label = (name, at, minor) => {
    if (!name || placed.some((p) => Math.abs(p.x - at.x) < 130 && Math.abs(p.y - at.y) < 24)) return;
    placed.push(at);
    const width = name.length * 8 + 26;
    const side = W - at.x < width && at.x > W - at.x ? " l" : "";
    labels.push(`<span class="lb${side}${minor ? " minor" : ""}" style="left:${(at.x / W * 100).toFixed(2)}%;top:${(at.y / H * 100).toFixed(2)}%">${esc(name)}</span>`);
  };
  list.forEach((f, i) => {
    const ends = [f.stopPoints[0], f.stopPoints[f.stopPoints.length - 1]].filter(Boolean);
    for (const end of ends) {
      const at = P(end);
      dots.push(`<circle cx="${at.x.toFixed(1)}" cy="${at.y.toFixed(1)}" r="5.5" style="fill:${colours[i]}"/>`);
    }
  });
  list.forEach((f) => { if (f.stopPoints[0]) label(f.from, P(f.stopPoints[0]), false); });
  list.forEach((f) => { const last = f.stopPoints[f.stopPoints.length - 1]; if (last) label(f.to, P(last), true); });

  const legend = list.map((f, i) => `<span><i style="background:${colours[i]}"></i><a href="${f.link}">${esc(f.code.replace(/\s+Line$/i, ""))}</a> ${f.from === f.to ? `loop from ${esc(f.from)}` : `${esc(f.from)} ↔ ${esc(f.to)}`}</span>`).join("");
  return `<figure class="gmap" aria-label="Map of the routes"><div style="position:relative"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="ln">${paths}</g><g class="st">${dots.join("")}</g></svg>${labels.join("")}</div><div class="legend">${legend}</div></figure>`;
}

async function resolvePlaceholders(body) {
  for (const [token, category, codes] of [...body.matchAll(/\{\{routes:([a-z-]+):([^}]+)\}\}/g)]) {
    body = body.replaceAll(token, await routesTable(category, codes.split("|")));
  }
  for (const [token, category, codes] of [...body.matchAll(/\{\{map:([a-z-]+):([^}]+)\}\}/g)]) {
    body = body.replaceAll(token, await routesMap(category, codes.split("|")));
  }
  for (const [token, kind, category, code] of [...body.matchAll(/\{\{(ends|stops|link):([a-z-]+):([^}]+)\}\}/g)]) {
    try {
      const facts = await routeFacts(category, code);
      body = body.replaceAll(token, String(facts[kind]));
    } catch (error) {
      console.warn(`unresolved ${token}: ${error.message}`);
      body = body.replaceAll(token, kind === "link" ? `${APP}/routes` : "—");
    }
  }
  return body;
}

/* ------------------------------------------------------------------------ */

const posts = readdirSync(join(here, "posts")).filter((f) => f.endsWith(".html")).sort().reverse()
  .map((file) => {
    const raw = readFileSync(join(here, "posts", file), "utf-8");
    const metaMatch = raw.match(/<!--meta\s*({[\s\S]*?})\s*-->/);
    const meta = JSON.parse(metaMatch[1]);
    const body = raw.replace(/<!--meta[\s\S]*?-->/, "").trim();
    const slug = file.replace(/^\d+-/, "").replace(/\.html$/, "");
    return { country: "my", topic: "Getting around", ...meta, slug, body };
  });

const inCountry = (post, code) => post.country === code || post.country === "both";
const thumb = (p) => (p.body.match(/\/img\/([a-z-]+\.webp)/) || [])[0] || (inCountry(p, "sg") && !inCountry(p, "my") ? "/img/singapore-mrt.webp" : "/img/klang-valley-rail.webp");
const card = (p) => `<a class="card" href="/${p.slug}" style="--accent:${p.accent || "var(--ink)"}"><img src="${thumb(p)}" alt="" loading="lazy"><div class="cb"><div class="ct">${esc(p.topic)}${p.country === "both" ? " · MY + SG" : ""}</div><b>${esc(p.title)}</b><span>${esc(p.desc)}</span></div></a>`;
const crumbsSchema = (items) => `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, ...(item ? { item } : {}) }))
}).replace(/</g, "\\u003c")}</script>`;

const stamp = new Date().toISOString().slice(0, 10);
for (const post of posts) {
  const resolved = await resolvePlaceholders(post.body);
  const ogImage = (post.body.match(/\/img\/([a-z-]+\.webp)/) || [null, "hero-banner.webp"])[1];
  const home = post.country === "sg" ? COUNTRIES.sg : COUNTRIES.my;
  const related = posts.filter((p) => p.slug !== post.slug && (inCountry(p, post.country === "both" ? "my" : post.country) || inCountry(p, post.country === "both" ? "sg" : post.country))).slice(0, 3);
  const head = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.desc,
    datePublished: post.date,
    dateModified: post.updated || stamp,
    image: `${SITE}/img/${ogImage}`,
    author: { "@type": "Organization", name: "Public Transport Live" },
    publisher: { "@type": "Organization", name: "Public Transport Live", url: APP }
  }).replace(/</g, "\\u003c")}</script>
${crumbsSchema([["Guides", `${SITE}/`], [home.name, `${SITE}/${home.slug}`], [post.title]])}
<meta property="og:image" content="${SITE}/img/${ogImage}">`;
  const body = `<p class="crumbs"><a href="/">Guides</a> › <a href="/${home.slug}">${home.name}</a> › ${esc(post.topic)}</p>
<article><h1>${esc(post.title)}</h1><p class="meta">${esc(post.topic)} · updated ${post.updated || post.date}</p>
${resolved}
<p class="meta" style="margin-top:28px">Route figures and maps on this page were generated on ${stamp} from the official open-data feeds — the same source the <a href="${APP_REF}">live tracker</a> uses.</p>
<p><a class="cta" href="${APP_REF}">Check it live before you travel</a></p></article>
${related.length ? `<section class="more"><div class="cap"><h2>More guides</h2><a href="/${home.slug}">All ${home.name} guides →</a></div><div class="grid">${related.map(card).join("")}</div></section>` : ""}`;
  writeFileSync(join(out, `${post.slug}.html`), page({
    title: `${post.title} | Transit Guide`,
    desc: post.desc,
    canonical: `${SITE}/${post.slug}`,
    body,
    accent: post.accent || "",
    current: post.country === "both" ? "" : post.country,
    head
  }));
}

/* Live numbers per country for the hero chips and hubs — real counts. */
const network = { my: [], sg: [] };
try {
  const index = await fetchJson(`${APP}/api/route-index`);
  const labels = Object.fromEntries((index.feeds || []).map((f) => [f.id, f.label]));
  for (const entry of index.categories || []) {
    const code = entry.category.startsWith("sg") ? "sg" : "my";
    if ((entry.routes || []).length) network[code].push({ id: entry.category, label: labels[entry.category] || entry.category, count: entry.routes.length });
  }
} catch (error) {
  console.warn("route index unavailable, hubs without counts:", error.message);
}
const total = (code) => network[code].reduce((sum, n) => sum + n.count, 0);
const fmt = (n) => n.toLocaleString("en");

/* Hubs: everything for one country, by topic. */
for (const code of ["my", "sg"]) {
  const c = COUNTRIES[code];
  const mine = posts.filter((p) => inCountry(p, code));
  const sections = TOPICS.map((topic) => {
    const list = mine.filter((p) => p.topic === topic);
    return list.length ? `<div class="topic"><h3>${esc(topic)}</h3><div class="grid">${list.map(card).join("")}</div></div>` : "";
  }).join("");
  const nets = network[code].map((n) => `<a href="${APP}/routes#${n.id}">${esc(n.label)}<span>${n.count}</span></a>`).join("");
  writeFileSync(join(out, `${c.slug}.html`), page({
    title: `${c.name} public transport guide — trains, buses, fares & sights`,
    desc: `How to get around ${c.name} by public transport: ${mine.slice(0, 4).map((p) => p.title.split(/[—:–]/)[0].trim()).join(", ")} and more.`,
    canonical: `${SITE}/${c.slug}`,
    accent: c.accent,
    current: code,
    head: crumbsSchema([["Guides", `${SITE}/`], [c.name]]),
    body: `<p class="crumbs"><a href="/">Guides</a> › ${c.name}</p>
<h1 style="font-size:clamp(28px,4vw,40px);letter-spacing:-.03em;margin:14px 0 10px">${c.name}</h1>
<p class="lead">${c.intro}</p>
${network[code].length ? `<p class="meta" style="margin-top:14px"><b style="color:var(--ink)">${fmt(total(code))}</b> routes on <b style="color:var(--ink)">${network[code].length}</b> networks in the live tracker</p><div class="nets">${nets}</div>` : ""}
${sections}`
  }));
}

const countryRow = (code) => {
  const c = COUNTRIES[code];
  const list = posts.filter((p) => inCountry(p, code));
  return `<div class="cap"><h2>${c.name}</h2><a href="/${c.slug}">All ${list.length} guides →</a></div><div class="grid">${list.slice(0, 6).map(card).join("")}</div>`;
};

writeFileSync(join(out, "index.html"), page({
  title: "Malaysia & Singapore public transport guide",
  desc: "How to get around Malaysia and Singapore by train and bus: line guides, fares and passes, sights by MRT, Penang, Melaka, Johor Bahru and crossing to Singapore — from the makers of the Public Transport Live tracker.",
  canonical: `${SITE}/`,
  body: `<section class="hero"><div class="hero-in">
<div class="eyebrow">Malaysia · Singapore</div>
<h1>Get around by train and bus</h1>
<p>Plain-English guides to the lines, fares and sights — built on the official open-data feeds and paired with a free live tracker that shows every bus and train moving.</p>
<a class="btn" href="/malaysia">Malaysia guides</a><a class="btn" href="/singapore">Singapore guides</a><a class="btn ghost" href="${APP_REF}">Open the live map</a>
<div class="chips">
<span><b>${total("my") + total("sg") ? fmt(total("my") + total("sg")) : "1,000+"}</b> routes tracked</span>
<span><b>${network.my.length + network.sg.length || 17}</b> networks</span>
<span><b>${posts.length}</b> guides</span>
<span><b>Free</b> · no login</span>
</div></div></section>
${countryRow("my")}
${countryRow("sg")}`
}));

const urls = [`${SITE}/`, `${SITE}/malaysia`, `${SITE}/singapore`, ...posts.map((p) => `${SITE}/${p.slug}`)];
writeFileSync(join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>`);

writeFileSync(join(out, "rss.xml"),
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Malaysia &amp; Singapore Transit Guide</title><link>${SITE}</link><description>Public transport guides for Malaysia and Singapore</description>` +
  posts.map((p) => `<item><title>${esc(p.title)}</title><link>${SITE}/${p.slug}</link><description>${esc(p.desc)}</description><pubDate>${new Date(p.date).toUTCString()}</pubDate></item>`).join("") +
  `</channel></rss>`);

writeFileSync(join(out, "llms.txt"), `# Malaysia & Singapore Transit Guide

> Practical guides to public transport in Malaysia and Singapore: rail line guides, bus how-tos, fares and passes, sights by train, city bus networks (Penang, Melaka, Johor Bahru and more), intercity trains and crossing between Johor Bahru and Singapore — companion site to the free live tracker Public Transport Live (https://public.kaynx1.com), which shows real-time bus GPS, train times, crowding and a journey planner for both countries.

## Malaysia
${posts.filter((p) => inCountry(p, "my")).map((p) => `- [${p.title}](${SITE}/${p.slug}): ${p.desc}`).join("\n")}

## Singapore
${posts.filter((p) => inCountry(p, "sg")).map((p) => `- [${p.title}](${SITE}/${p.slug}): ${p.desc}`).join("\n")}

## The app
- [Public Transport Live](https://public.kaynx1.com/): free live tracker, no ads on the live map, no login
- [All routes with timetables](https://public.kaynx1.com/routes)
`);

writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(out, "_headers"), `/*\n  Cache-Control: public, max-age=3600\n  X-Content-Type-Options: nosniff\n`);

// Self-hosted images (credited in each figure) ride along.
mkdirSync(join(out, "img"), { recursive: true });
for (const img of readdirSync(join(here, "img"))) {
  writeFileSync(join(out, "img", img), readFileSync(join(here, "img", img)));
}

console.log(`built ${posts.length} posts + 2 hubs + ${readdirSync(join(here, "img")).length} images -> dist/`);
