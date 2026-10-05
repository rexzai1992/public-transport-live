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

/* Every photo is from Wikimedia Commons under an open licence; img/
   photo-credits.json holds title, author, source, licence and what we changed,
   which is exactly what the licences ask us to show (TASL). */
const CREDITS = JSON.parse(readFileSync(join(here, "img", "photo-credits.json"), "utf-8"));
const SITE_NAME = "Public Transport Live — Malaysia & Singapore Guides";

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
.hero{background:#080808 url("/img/hero-network.webp") 62% center/cover no-repeat;border-radius:20px;margin-top:20px;overflow:hidden;position:relative}
.hero::after{background:rgba(8,8,8,.55);content:"";inset:0;position:absolute}
@media (min-width:900px){.hero::after{background:rgba(8,8,8,.45)}.hero-in{max-width:660px}}
.hero-in{color:#fff;padding:44px 40px;position:relative;z-index:1}
.eyebrow{color:rgba(255,255,255,.6);font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.hero h1{font-size:clamp(28px,4vw,42px);font-weight:800;letter-spacing:-.03em;line-height:1.1;margin:10px 0 12px;max-width:16ch}
.hero p{color:rgba(255,255,255,.74);font-size:16.5px;margin:0 0 24px;max-width:50ch}
.btn{background:#fff;border-radius:11px;color:#0a0a0a;display:inline-block;font-size:14.5px;font-weight:650;margin:0 8px 8px 0;padding:12px 20px;text-decoration:none}
.btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff}
.gsearch{align-items:center;background:#fff;border-radius:12px;color:#555;display:flex;gap:10px;margin:4px 0 14px;max-width:560px;padding:0 14px}
.gsearch input{background:transparent;border:0;color:#0a0a0a;flex:1;font:inherit;font-size:16px;min-width:0;outline:none;padding:13px 0}
.quick{display:flex;flex-wrap:wrap;gap:8px;max-width:620px}
.quick a{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:999px;color:#fff;font-size:13px;font-weight:500;padding:7px 13px;text-decoration:none}
.quick a:hover{background:rgba(255,255,255,.2)}
.hero .herocredit{color:rgba(255,255,255,.45);font-size:10.5px;margin:0;padding:0 40px 12px;position:relative;text-align:right;z-index:1}
@media (max-width:640px){.hero .herocredit{padding:0 22px 12px;text-align:left}}
.starts{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:22px}
.feat{background:var(--card);border:1px solid var(--rule);border-radius:var(--r);display:flex;flex-direction:column;overflow:hidden;text-decoration:none;transition:border-color .15s,transform .15s}
.feat:hover{border-color:var(--ink3);transform:translateY(-2px)}
.feat img{aspect-ratio:2/1;display:block;height:auto;object-fit:cover;width:100%}
.feat .fe{color:var(--ink3);font-size:11.5px;font-weight:700;letter-spacing:.08em;padding:14px 17px 0;text-transform:uppercase}
.feat b{font-size:19px;letter-spacing:-.015em;line-height:1.3;padding:4px 17px 0}
.feat span:last-child{color:var(--ink2);font-size:14px;padding:6px 17px 17px}
.liveband{align-items:center;background:var(--inv);border-radius:var(--r);color:var(--invink);display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;margin-top:44px;padding:22px 24px}
.liveband b{display:block;font-size:20px;letter-spacing:-.01em}
.liveband span{opacity:.75;font-size:14.5px}
.btn.dark{background:var(--invink);color:var(--inv)}
.btn.line{background:transparent;border:1px solid currentColor;color:var(--invink)}
.faq{margin-top:44px;max-width:760px}
.faq h2{font-size:22px;letter-spacing:-.02em}
.faq details{border-top:1px solid var(--rule);padding:4px 0}
.faq summary{cursor:pointer;font-size:16px;font-weight:600;padding:12px 0}
.faq details p{color:var(--ink2);margin:0 0 14px}
.credits td img{border-radius:8px;display:block}
.credits small{color:var(--ink3)}
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
.card img{aspect-ratio:2/1;display:block;height:auto;object-fit:cover;width:100%}
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
.gmap .gm{position:relative}
.gm .ml-map{inset:0;opacity:0;position:absolute;transition:opacity .4s}
.gm.live .ml-map{opacity:1}
.gm.live>svg,.gm.live>.lb{visibility:hidden}
.ml-lbl{background:color-mix(in srgb,var(--raised) 90%,transparent);border-radius:6px;color:var(--ink);font:500 12px Inter,sans-serif;padding:2px 6px;white-space:nowrap}
.ml-lbl.end{font-weight:700}
.ml-lbl i{color:var(--ink3);font-size:10.5px;font-style:normal;margin-left:5px}
.photo img{aspect-ratio:3/2;height:auto}
.photo figcaption a{color:var(--ink2)}
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

const page = ({ title, desc, canonical, body, accent = "", current = "", head = "", image = "photo-kl-lrt", type = "website" }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" href="${SITE}/rss.xml">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:site_name" content="${esc(SITE_NAME)}"><meta property="og:type" content="${type}"><meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/img/${image}.webp"><meta property="og:image:width" content="1600"><meta property="og:image:height" content="1067">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/img/${image}.webp">
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
· Basemap © <a href="https://protomaps.com" rel="noopener">Protomaps</a> · Photos from Wikimedia Commons under open licences — <a href="/credits">photo credits</a>
&nbsp;·&nbsp; <a href="${APP}/download/ptlive.apk">Android app</a> &nbsp;·&nbsp; <a href="${APP}/terms.html">Terms &amp; Privacy</a></p>
</main>
${body.includes("livemap") ? `<script src="${APP}/routemap.js" defer></script>` : ""}
<script>try{fetch("${APP}/api/guide-view?page="+encodeURIComponent(location.pathname),{mode:"no-cors"})}catch(e){}</script>
</body></html>`;

/* A photo with its credit in the caption: author, title, source and licence,
   plus the change we made (a 3:2 crop and resize), as CC licences require. */
function photoFigure(name, alt, eager = false) {
  const c = CREDITS[name];
  if (!c) throw new Error(`no credit for ${name} — add it to img/photo-credits.json`);
  const licence = c.license === "CC0"
    ? `<a href="${c.licenseUrl}" rel="noopener license">CC0</a> (public domain)`
    : `<a href="${c.licenseUrl}" rel="noopener license">${esc(c.license)}</a>`;
  return `<figure class="photo"><img src="/img/${name}.webp" srcset="/img/${name}-sm.webp 800w, /img/${name}.webp 1600w" sizes="(max-width: 800px) 100vw, 760px" width="1600" height="1067" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">
<figcaption>Photo: ${esc(c.artist)}, <a href="${c.page}" rel="noopener">${esc(c.title.replace(/\.(jpe?g|png|webp)$/i, ""))}</a> (Wikimedia Commons), ${licence}; ${esc(c.modified)}.</figcaption></figure>`;
}

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

  /* The same routes for the street map (public/routemap.js, loaded from the
     app's domain): thinned points, every stop, the ends labelled. */
  const thin = (line) => {
    const pts = [];
    for (const p of line) {
      const last = pts[pts.length - 1];
      if (last && Math.abs(last[0] - p.lon) < 0.0001 && Math.abs(last[1] - p.lat) < 0.0001) continue;
      pts.push([+p.lon.toFixed(5), +p.lat.toFixed(5)]);
    }
    return pts;
  };
  const liveColour = (c) => (c.startsWith("#") ? c : null);
  const live = {
    lines: list.flatMap((f, i) => (f.shapes.length ? f.shapes : [f.stopPoints]).map((line) => ({ c: liveColour(colours[i]), p: thin(line) }))),
    stops: list.flatMap((f, i) => f.stopPoints.map((stop, j) => {
      const end = j === 0 || j === f.stopPoints.length - 1;
      return { p: [+stop.lon.toFixed(5), +stop.lat.toFixed(5)], k: end ? "e" : "", n: end ? (j === 0 ? f.from : f.to) : stop.name, ...(liveColour(colours[i]) ? { c: colours[i] } : {}), ...(end ? { l: 1 } : {}) };
    }))
  };
  // Shared ends (two routes from one terminal) are labelled once.
  const seenLabel = new Set();
  for (const stop of live.stops) {
    if (!stop.l) continue;
    const key = stop.n;
    if (seenLabel.has(key)) delete stop.l;
    seenLabel.add(key);
  }

  const legend = list.map((f, i) => `<span><i style="background:${colours[i]}"></i><a href="${f.link}">${esc(f.code.replace(/\s+Line$/i, ""))}</a> ${f.from === f.to ? `loop from ${esc(f.from)}` : `${esc(f.from)} ↔ ${esc(f.to)}`}</span>`).join("");
  return `<figure class="gmap" aria-label="Map of the routes"><div class="gm livemap" data-map='${esc(JSON.stringify(live))}'><svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="ln">${paths}</g><g class="st">${dots.join("")}</g></svg>${labels.join("")}</div><div class="legend">${legend}</div></figure>`;
}

async function resolvePlaceholders(body) {
  // {{photo:name|alt text}} — the first photo on a page loads eagerly (LCP).
  let photoCount = 0;
  body = body.replace(/\{\{photo:([a-z0-9-]+)\|([^}]*)\}\}/g, (_, name, alt) => photoFigure(name, alt, photoCount++ === 0));
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
const imageOf = (p) => (p.image && CREDITS[p.image] ? p.image : "photo-kl-lrt");
const card = (p) => `<a class="card" href="/${p.slug}" style="--accent:${p.accent || "var(--ink)"}" data-s="${esc(`${p.title} ${p.desc} ${p.topic}`.toLowerCase())}"><img src="/img/${imageOf(p)}-sm.webp" width="800" height="533" alt="" loading="lazy" decoding="async"><div class="cb"><div class="ct">${esc(p.topic)}${p.country === "both" ? " · MY + SG" : ""}</div><b>${esc(p.title)}</b><span>${esc(p.desc)}</span></div></a>`;
const crumbsSchema = (items) => `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, ...(item ? { item } : {}) }))
}).replace(/</g, "\\u003c")}</script>`;

const stamp = new Date().toISOString().slice(0, 10);
for (const post of posts) {
  const resolved = await resolvePlaceholders(post.body);
  const ogImage = imageOf(post);
  const home = post.country === "sg" ? COUNTRIES.sg : COUNTRIES.my;
  const related = posts.filter((p) => p.slug !== post.slug && (inCountry(p, post.country === "both" ? "my" : post.country) || inCountry(p, post.country === "both" ? "sg" : post.country))).slice(0, 3);
  const head = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.desc,
    datePublished: post.date,
    dateModified: post.updated || stamp,
    image: `${SITE}/img/${ogImage}.webp`,
    mainEntityOfPage: `${SITE}/${post.slug}`,
    inLanguage: "en",
    about: post.country === "sg" ? "Singapore" : post.country === "both" ? ["Malaysia", "Singapore"] : "Malaysia",
    author: { "@type": "Organization", name: "Public Transport Live", url: APP },
    publisher: { "@type": "Organization", name: "Public Transport Live", url: APP, logo: { "@type": "ImageObject", url: `${APP}/assets/icon-512.png` } }
  }).replace(/</g, "\\u003c")}</script>
${crumbsSchema([["Guides", `${SITE}/`], [home.name, `${SITE}/${home.slug}`], [post.title]])}`;
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
    head,
    image: ogImage,
    type: "article"
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
    image: code === "sg" ? "photo-sg-mrt" : "photo-kl-lrt",
    head: crumbsSchema([["Guides", `${SITE}/`], [c.name]]) + `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${c.name} public transport guides`,
      itemListElement: mine.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/${p.slug}`, name: p.title }))
    }).replace(/</g, "\\u003c")}</script>`,
    body: `<p class="crumbs"><a href="/">Guides</a> › ${c.name}</p>
<h1 style="font-size:clamp(28px,4vw,40px);letter-spacing:-.03em;margin:14px 0 10px">${c.name}</h1>
<p class="lead">${c.intro}</p>
${network[code].length ? `<p class="meta" style="margin-top:14px"><b style="color:var(--ink)">${fmt(total(code))}</b> routes on <b style="color:var(--ink)">${network[code].length}</b> networks in the live tracker</p><div class="nets">${nets}</div>` : ""}
${sections}`
  }));
}

/* The homepage answers the questions people actually search, then lists
   every guide once: Malaysia, Singapore, and the cross-border/airport guides
   that belong to both (shown once, in their own section). */
const QUICK = [
  ["KLIA to KL city", "klia-changi-by-public-transport"],
  ["Changi to the city", "klia-changi-by-public-transport"],
  ["JB ↔ Singapore", "johor-bahru-to-singapore"],
  ["Batu Caves by train", "kl-attractions-by-train"],
  ["Penang airport to George Town", "penang-by-bus"],
  ["Sentosa by MRT", "singapore-attractions-by-mrt"],
  ["KL to Melaka", "melaka-by-bus"],
  ["Singapore Tourist Pass", "singapore-fares-and-tourist-pass"]
].filter(([, slug]) => posts.some((p) => p.slug === slug));

/* Short, checked answers (see the linked guides); also FAQPage data. */
const FAQ = [
  ["Can I tap a bank card on KL trains?", "Not on Rapid KL trains yet — the LRT, MRT, Monorail and BRT gates take a Touch 'n Go card or a token. KTM Komuter gates do accept contactless Visa, Mastercard and MyDebit cards and Apple Pay.", "kl-fares-and-passes"],
  ["How do I get from Johor Bahru to Singapore without a car?", "Take the five-minute KTM Shuttle Tebrau train from JB Sentral to Woodlands (RM5), or a cross-border bus such as Causeway Link CW1, CW2 or CW5 or SBS Transit 160, 170 or 170X. The new RTS Link train is targeted for February 2027.", "johor-bahru-to-singapore"],
  ["Is the Singapore Tourist Pass worth it?", "Usually only for busy multi-day sightseeing. A 1-day pass is S$17 and a 3-day pass S$29, while most single trips cost about S$1.30–2.60 when you tap a card. Foreign Visa and Mastercard cards pay a S$0.60 fee per day of travel.", "singapore-fares-and-tourist-pass"],
  ["How do I get to Batu Caves by train?", "Take the KTM Komuter to Batu Caves, the end of the line, about 30 minutes from KL Sentral; the station is beside the temple. Until about the end of 2026, weekday trains run only about hourly between 10am and 4pm.", "kl-attractions-by-train"],
  ["Do Penang buses take cards?", "Regular Rapid Penang buses take cash only and the driver gives no change, so carry small notes. The CAT shuttle around George Town is free.", "penang-by-bus"]
];

const myPosts = posts.filter((p) => p.country === "my");
const sgPosts = posts.filter((p) => p.country === "sg");
const both = posts.filter((p) => p.country === "both");
const feature = (href, image, eyebrow, title, text) => `<a class="feat" href="${href}"><img src="/img/${image}-sm.webp" width="800" height="533" alt="" loading="lazy" decoding="async"><span class="fe">${esc(eyebrow)}</span><b>${esc(title)}</b><span>${esc(text)}</span></a>`;
const routeTotal = total("my") + total("sg") ? fmt(total("my") + total("sg")) : "1,000+";

const homeSchema = `<script type="application/ld+json">${JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE}/`,
    inLanguage: "en",
    publisher: { "@type": "Organization", name: "Public Transport Live", url: APP, logo: `${APP}/assets/icon-512.png` }
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
  },
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: posts.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/${p.slug}`, name: p.title }))
  }
]).replace(/</g, "\\u003c")}</script>`;

writeFileSync(join(out, "index.html"), page({
  title: "Malaysia & Singapore public transport guide — trains, buses, fares & sights",
  desc: "How to get around Malaysia and Singapore by train and bus: KLIA and Changi to the city, Johor Bahru to Singapore, KL and Singapore sights by train, Penang, Melaka, fares and passes — plain-English guides with a free live tracker.",
  canonical: `${SITE}/`,
  head: homeSchema,
  image: "photo-kl-lrt",
  body: `<section class="hero"><div class="hero-in">
<div class="eyebrow">Malaysia · Singapore</div>
<h1>Malaysia &amp; Singapore by train and bus</h1>
<p>Plain-English guides to the lines, fares and sights — checked against the operators, built on the official open-data feeds, and paired with a free live tracker that shows every bus and train moving.</p>
<label class="gsearch"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="gq" type="search" placeholder="Search the guides — e.g. Penang, Tourist Pass, Batu Caves" aria-label="Search the guides" autocomplete="off"></label>
<div class="quick">${QUICK.map(([label, slug]) => `<a href="/${slug}">${esc(label)}</a>`).join("")}</div>
<div class="chips">
<span><b>${routeTotal}</b> routes in the live tracker</span>
<span><b>${posts.length}</b> guides</span>
<span><b>Free</b> · no login</span>
</div></div>
<p class="herocredit">Our rendering of the KL rail network · basemap © OpenStreetMap contributors · Protomaps</p></section>
<p id="gnone" class="lead" hidden>No guide matches that — try a place, a line or a fare word.</p>

<section class="starts" aria-label="Start here">
${feature("/malaysia", "photo-kl-lrt", "Malaysia", "Kuala Lumpur, Penang, Melaka & beyond", "LRT, MRT, KTM and city buses, the passes worth buying and the sights by train.")}
${feature("/singapore", "photo-sg-mrt", "Singapore", "The MRT, buses and fares", "Paying by card, the Tourist Pass, and the station and exit for every big sight.")}
${feature("/johor-bahru-to-singapore", "photo-causeway", "Crossing", "Johor Bahru ↔ Singapore", "The shuttle train, the buses, arrival cards and the RTS Link coming in 2027.")}
</section>

<div class="cap"><h2>Malaysia</h2><a href="/malaysia">All Malaysia guides →</a></div>
<div class="grid">${myPosts.map(card).join("")}</div>
<div class="cap"><h2>Singapore</h2><a href="/singapore">All Singapore guides →</a></div>
<div class="grid">${sgPosts.map(card).join("")}</div>
${both.length ? `<div class="cap"><h2>Airports &amp; borders</h2></div><div class="grid">${both.map(card).join("")}</div>` : ""}

<section class="liveband"><div><b>Plan it live</b><span>Every bus and train on one map, a journey planner across both countries, and timetables for ${routeTotal} routes.</span></div><div><a class="btn dark" href="${APP_REF}">Open the live map</a><a class="btn line" href="${APP}/routes">All routes &amp; timetables</a></div></section>

<section class="faq"><h2>Quick answers</h2>
${FAQ.map(([q, a, slug]) => `<details><summary>${esc(q)}</summary><p>${esc(a)} <a href="/${slug}">Read the guide →</a></p></details>`).join("")}
</section>
<script>(()=>{const q=document.getElementById("gq"),none=document.getElementById("gnone");if(!q)return;const cards=[...document.querySelectorAll("a.card")];let t=0;q.addEventListener("input",()=>{const w=q.value.toLowerCase().split(/\\s+/).filter(Boolean);let shown=0;for(const c of cards){const hit=w.every((x)=>c.dataset.s.includes(x));c.hidden=!hit;if(hit)shown++;}document.querySelectorAll(".cap").forEach((cap)=>{const grid=cap.nextElementSibling;cap.hidden=grid&&![...grid.children].some((c)=>!c.hidden);});none.hidden=!w.length||shown>0;clearTimeout(t);if(w.length)t=setTimeout(()=>document.querySelector(".starts").scrollIntoView({behavior:"smooth",block:"start"}),500);});})();</script>`
}));

/* Photo credits: every image on the site, with what its licence asks for. */
const creditRows = Object.entries(CREDITS).map(([name, c]) => `<tr><td><img src="/img/${name}-sm.webp" width="160" height="107" alt="" loading="lazy"></td><td><a href="${c.page}" rel="noopener">${esc(c.title.replace(/\.(jpe?g|png|webp)$/i, ""))}</a><br><small>${esc(c.artist)}</small></td><td><a href="${c.licenseUrl}" rel="noopener license">${esc(c.license)}</a></td><td>${esc(c.modified)}</td></tr>`).join("");
writeFileSync(join(out, "credits.html"), page({
  title: "Photo & map credits | Transit Guide",
  desc: "Sources and licences for the photos, maps and data used in the Public Transport Live travel guides.",
  canonical: `${SITE}/credits`,
  body: `<p class="crumbs"><a href="/">Guides</a> › Credits</p>
<article><h1>Photo &amp; map credits</h1>
<p>Every photo on this site comes from <a href="https://commons.wikimedia.org" rel="noopener">Wikimedia Commons</a> under an open licence and is used on that licence's terms. We cropped each to 3:2 and resized it; our adaptations of CC BY-SA photos are shared under the same licence.</p>
<div class="tablewrap"><table class="credits"><tr><th></th><th>Photo &amp; author</th><th>Licence</th><th>Changes</th></tr>${creditRows}</table></div>
<h2>Maps &amp; data</h2>
<p>Route lines, stops and timetables come from the official open-data feeds: the Malaysia Open API (Prasarana, KTMB, APAD) and LTA DataMall (Singapore). Street maps are drawn from <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> data (© OpenStreetMap contributors, ODbL) with a <a href="https://protomaps.com" rel="noopener">Protomaps</a> basemap we host ourselves, rendered with MapLibre. The homepage map is our own rendering of the same data.</p>
<h2>Something of yours?</h2>
<p>If you think something here is used incorrectly, email <a href="mailto:izzulfitreee@gmail.com">izzulfitreee@gmail.com</a> and we'll fix or remove it.</p></article>`
}));

writeFileSync(join(out, "404.html"), page({
  title: "Page not found | Transit Guide",
  desc: "This page doesn't exist — browse the Malaysia and Singapore public transport guides instead.",
  canonical: `${SITE}/`,
  body: `<article><h1>That page isn't here</h1><p class="lead">It may have moved. Try the <a href="/malaysia">Malaysia</a> or <a href="/singapore">Singapore</a> guides, or <a href="/">all guides</a>.</p></article>`
}).replace('<meta name="robots" content="index, follow, max-image-preview:large">', '<meta name="robots" content="noindex">'));

/* Sitemap with last-modified dates and each page's photo, for image search. */
const urlEntry = (loc, lastmod, image, caption) => `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod>${image ? `<image:image><image:loc>${SITE}/img/${image}.webp</image:loc>${caption ? `<image:caption>${esc(caption)}</image:caption>` : ""}</image:image>` : ""}</url>`;
writeFileSync(join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
  [
    urlEntry(`${SITE}/`, stamp, "hero-network"),
    urlEntry(`${SITE}/malaysia`, stamp, "photo-kl-lrt"),
    urlEntry(`${SITE}/singapore`, stamp, "photo-sg-mrt"),
    ...posts.map((p) => urlEntry(`${SITE}/${p.slug}`, p.updated || p.date, imageOf(p), p.title)),
    urlEntry(`${SITE}/credits`, stamp)
  ].join("\n") + `\n</urlset>`);

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

/* IndexNow (Bing, Yandex, Naver, Seznam): the key file proves we own the
   host; indexnow.mjs pings the sitemap's URLs after a deploy. */
const INDEXNOW_KEY = readFileSync(join(here, "indexnow-key.txt"), "utf-8").trim();
writeFileSync(join(out, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);

writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(out, "_headers"), `/*\n  Cache-Control: public, max-age=3600\n  X-Content-Type-Options: nosniff\n`);

// Self-hosted images (credited in each figure) ride along.
mkdirSync(join(out, "img"), { recursive: true });
for (const img of readdirSync(join(here, "img"))) {
  writeFileSync(join(out, "img", img), readFileSync(join(here, "img", img)));
}

console.log(`built ${posts.length} posts + 2 hubs + ${readdirSync(join(here, "img")).length} images -> dist/`);
