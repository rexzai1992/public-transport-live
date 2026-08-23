/* Static blog builder — zero dependencies, same philosophy as the app.
   Posts are HTML fragments in posts/ with a <!--meta {...}--> header; this
   wraps them in the site template and emits dist/ ready for Cloudflare Pages:
   index, per-post pages, sitemap and RSS. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
const SITE = "https://travel-guide.kaynx1.com";
const APP = "https://public.kaynx1.com";
/* App links carry ?ref=guide so the admin panel can count guide→app arrivals. */
const APP_REF = `${APP}/?ref=guide`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const style = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
/* Concept: the guide IS a transit map. Line colours, station dots, departure-
   board numerals — the same design tokens as the app at public.kaynx1.com. */
:root {
  --page:#f5f5f5; --panel:#ffffff; --edge:rgba(0,0,0,0.08); --edge-strong:rgba(0,0,0,0.22);
  --ink:#0b1220; --ink-2:rgba(11,18,32,0.64); --ink-3:rgba(11,18,32,0.42); --rule:rgba(0,0,0,0.08);
  --night:#050810; --night-panel:#111825; --night-ink:#eaf2ff; --night-ink2:#a9c9ec;
  --invert-bg:#090909; --invert-ink:#fff; --r:16px; --shadow:0 10px 30px rgba(6,12,24,0.08);
}
@media (prefers-color-scheme: dark){ :root {
  --page:#050810; --panel:#111825; --edge:rgba(124,178,240,0.15); --edge-strong:rgba(124,178,240,0.35);
  --ink:#eaf2ff; --ink-2:#a9c9ec; --ink-3:#7d9cc0; --rule:rgba(124,178,240,0.14);
  --invert-bg:#7cc4ff; --invert-ink:#04121f; --shadow:0 10px 30px rgba(0,4,12,0.5);
}}
*{box-sizing:border-box}
body{background:var(--page);color:var(--ink);font:16px/1.75 Inter,-apple-system,sans-serif;margin:0}
main{margin:0 auto;max-width:1050px;padding:0 20px 72px}
main.wide{max-width:1100px}
.topbar{align-items:center;display:flex;gap:12px;margin:0 auto;max-width:1100px;padding:22px 20px 0;text-decoration:none}
.brand-mark{align-items:center;background:var(--invert-bg);border-radius:12px;display:flex;flex:none;height:40px;justify-content:center;width:40px}
.brand-copy b{color:var(--ink);display:block;font:700 16px Archivo,Inter,sans-serif;letter-spacing:-0.01em}
.brand-copy span{color:var(--ink-3);font-size:10.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase}
/* Night-map hero band */
.hero-band{aspect-ratio:2.5/1;background:var(--night) url("/img/hero-banner.webp") center/contain no-repeat;border-radius:var(--r);margin:20px auto 0;max-width:1100px;min-height:300px;overflow:hidden;position:relative}
.hero-band::after{background:linear-gradient(100deg, rgba(5,8,16,0.94) 0%, rgba(5,8,16,0.78) 42%, rgba(5,8,16,0.25) 100%);content:"";inset:0;position:absolute}
.hero-inner{padding:34px 40px;position:relative;z-index:1}
.hero-inner .eyebrow{color:#8fc4ff;font:600 11.5px "JetBrains Mono",monospace;letter-spacing:0.16em;text-transform:uppercase}
.hero-inner h1{color:var(--night-ink);font:800 clamp(26px,3.4vw,36px)/1.12 Archivo,Inter,sans-serif;letter-spacing:-0.02em;margin:8px 0 10px;max-width:15ch}
.hero-inner p{color:var(--night-ink2);font-size:16px;margin:0 0 22px;max-width:46ch}
.cta{background:#7cc4ff;border-radius:11px;color:#04121f;display:inline-block;font-weight:700;margin-right:10px;padding:13px 24px;text-decoration:none}
.cta.ghost{background:transparent;border:1.5px solid rgba(124,196,255,0.5);color:#cfe6ff}
.hero-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}
.hero-chips span{background:rgba(17,24,37,0.72);border:1px solid rgba(124,178,240,0.25);border-radius:999px;color:#cfe6ff;font:500 12.5px Inter;padding:7px 14px}
.hero-chips b{color:#fff;font-family:"JetBrains Mono",monospace}
/* Line cards: each guide is a route on the network */
.section-cap{color:var(--ink-3);font:600 11.5px "JetBrains Mono",monospace;letter-spacing:0.16em;margin:44px 0 16px;text-transform:uppercase}
.ggrid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.gcard{background:var(--panel);border:1px solid var(--edge);border-radius:var(--r);box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden;position:relative;text-decoration:none;transition:transform .18s,border-color .18s}
.gcard:hover{border-color:var(--edge-strong);transform:translateY(-3px)}
.gcard::before{background:var(--accent,#2563eb);content:"";height:4px;width:100%}
.gcard img{display:block;height:158px;object-fit:cover;width:100%}
.gcard .gbody{padding:16px 18px 18px}
.gcard b{color:var(--ink);display:block;font:700 17px/1.35 Archivo,Inter,sans-serif;letter-spacing:-0.01em}
.gcard span{color:var(--ink-2);font-size:13.5px}
.gcard .gline{align-items:center;color:var(--ink-3);display:flex;font:600 10.5px "JetBrains Mono",monospace;gap:7px;letter-spacing:0.1em;margin-bottom:8px;text-transform:uppercase}
.gcard .gline i{background:var(--accent,#2563eb);border:2.5px solid var(--panel);border-radius:99px;box-shadow:0 0 0 1.5px var(--accent,#2563eb);height:7px;width:7px}
/* Articles: the accent runs down the page like a route line */
article h1{font:800 clamp(26px,3.6vw,38px)/1.15 Archivo,Inter,sans-serif;letter-spacing:-0.02em;margin:26px 0 8px;max-width:24ch}
.sub{color:var(--ink-2);font-size:13.5px;margin:0 0 24px}
article h2{border-left:4px solid var(--accent,#2563eb);font:700 20px Archivo,Inter,sans-serif;letter-spacing:-0.01em;margin:34px 0 12px;padding-left:12px}
article h3{font:650 16px Archivo,Inter,sans-serif;margin:24px 0 8px}
a{color:var(--ink);text-decoration:underline;text-underline-offset:2.5px;text-decoration-color:var(--accent,#2563eb);text-decoration-thickness:2px}
p,li{max-width:70ch}
table{background:var(--panel);border:1px solid var(--edge);border-collapse:separate;border-spacing:0;border-radius:var(--r);box-shadow:var(--shadow);font-size:14px;margin:18px 0;overflow:hidden;width:100%}
th{color:var(--ink-3);font:600 10.5px "JetBrains Mono",monospace;letter-spacing:0.1em;padding:12px 15px 7px;text-align:left;text-transform:uppercase}
td{border-top:1px solid var(--rule);font-variant-numeric:tabular-nums;padding:10px 15px}
article .cta{background:var(--invert-bg);color:var(--invert-ink)}
figure{margin:20px 0}
figure img{border:1px solid var(--edge);border-radius:var(--r);box-shadow:var(--shadow);display:block;height:auto;width:100%}
figcaption{color:var(--ink-3);font-size:11px;margin-top:5px}
blockquote{border-left:4px solid var(--accent,#2563eb);background:var(--panel);border-radius:0 12px 12px 0;color:var(--ink-2);margin:16px 0;padding:10px 18px}
.foot{border-top:1px solid var(--rule);color:var(--ink-3);font-size:12px;margin-top:48px;padding-top:16px}
@media (max-width:640px){ .hero-inner{padding:34px 24px} }
</style>`;

const pageWide = (title, desc, canonical, body) => page(title, desc, canonical, body, true);
const page = (title, desc, canonical, body, wide = false, accent = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" href="${SITE}/rss.xml">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
${style}</head><body><a class="topbar" href="/">
  <span class="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 4h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-1.4 2.25v1.6a1.3 1.3 0 0 1-2.6 0v-1.1H7.5v1.1a1.3 1.3 0 0 1-2.6 0v-1.6A2.5 2.5 0 0 1 3.5 15.5v-9A2.5 2.5 0 0 1 6 4Z" fill="var(--invert-ink)"/><rect x="5.6" y="6.4" width="12.8" height="4.9" rx="1" fill="var(--invert-bg)"/><circle cx="7.9" cy="14.4" r="1.15" fill="var(--invert-bg)"/><circle cx="16.1" cy="14.4" r="1.15" fill="var(--invert-bg)"/></svg></span>
  <span class="brand-copy"><b>Public Transport Live</b><span>Malaysia · Singapore · Guides</span></span>
</a>
<main${wide ? ' class="wide"' : ""}${accent ? ` style="--accent:${accent}"` : ""}>
${body}
<p class="foot">Public Transport Live — independent guide built on open data. Times shown are typical and change;
always check the <a href="${APP_REF}">live tracker</a> before you travel. <a href="${APP}/terms.html">Terms &amp; Privacy</a></p>
</main>
<script>try{fetch("${APP}/api/guide-view?page="+encodeURIComponent(location.pathname),{mode:"no-cors"})}catch(e){}</script>
</body></html>`;

/* Real data, not filler: posts may embed {{ends:category:CODE}} and
   {{stops:category:CODE}} placeholders, resolved at build time from the
   live tracker's own API — the same feeds the app serves. A guide that
   states "31 stations, Kwasa Damansara ↔ Kajang" got it from the GTFS
   feed, not from a copywriter's memory. */
async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "blog-builder" } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

const routeCache = new Map();
async function routeFacts(category, code) {
  const key = `${category}:${code}`;
  if (routeCache.has(key)) return routeCache.get(key);
  const list = await fetchJson(`${APP}/api/rapid-bus/${category}/routes`);
  const route = (list.routes || []).find(
    (r) => (r.shortName || "") === code || (r.longName || "") === code || r.routeId === code
  );
  if (!route) throw new Error(`route not found: ${key}`);
  const map = await fetchJson(`${APP}/api/rapid-bus/${category}/map?routeId=${encodeURIComponent(route.routeId)}`);
  const pattern = map.patterns?.[0];
  const facts = {
    ends: pattern ? `${pattern.from} ↔ ${pattern.to}` : "—",
    stops: map.geojson.features.filter((f) => f.properties.kind === "stop").length,
    link: `${APP}/route/${category}/${encodeURIComponent(route.routeId)}`
  };
  routeCache.set(key, facts);
  return facts;
}

async function resolvePlaceholders(body) {
  const tokens = [...body.matchAll(/\{\{(ends|stops|link):([a-z-]+):([^}]+)\}\}/g)];
  for (const [token, kind, category, code] of tokens) {
    try {
      const facts = await routeFacts(category, code);
      body = body.replaceAll(token, String(facts[kind]));
    } catch (error) {
      console.warn(`unresolved ${token}: ${error.message}`);
      body = body.replaceAll(token, kind === "stops" ? "—" : "—");
    }
  }
  return body;
}

const posts = readdirSync(join(here, "posts")).filter((f) => f.endsWith(".html")).sort().reverse()
  .map((file) => {
    const raw = readFileSync(join(here, "posts", file), "utf-8");
    const metaMatch = raw.match(/<!--meta\s*({[\s\S]*?})\s*-->/);
    const meta = JSON.parse(metaMatch[1]);
    const body = raw.replace(/<!--meta[\s\S]*?-->/, "").trim();
    const slug = file.replace(/^\d+-/, "").replace(/\.html$/, "");
    return { ...meta, slug, body };
  });

const stamp = new Date().toISOString().slice(0, 10);
for (const post of posts) {
  const resolved = await resolvePlaceholders(post.body);
  const ogImage = (post.body.match(/\/img\/([a-z-]+\.webp)/) || [null, "hero-banner.webp"])[1];
  const schema = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.desc,
    datePublished: post.date,
    dateModified: stamp,
    image: `${SITE}/img/${ogImage}`,
    author: { "@type": "Organization", name: "Public Transport Live" },
    publisher: { "@type": "Organization", name: "Public Transport Live", url: APP }
  })}</script>
<meta property="og:image" content="${SITE}/img/${ogImage}">`;
  const body = `${schema}<h1>${post.title}</h1><p class="sub">${post.date} · Public Transport Live guide</p>
${resolved}
<p class="sub" style="margin-top:26px">Route figures on this page were generated on ${stamp} from the official
Prasarana / LTA open-data feeds — the same source the <a href="${APP_REF}">live tracker</a> uses. Nothing here is hand-typed.</p>
<p><a class="cta" href="${APP_REF}">Check it live before you travel — free, no login</a></p>`;
  writeFileSync(join(out, `${post.slug}.html`), page(`${post.title} | Transit Guide`, post.desc, `${SITE}/${post.slug}`, `<article>${body}</article>`, false, post.accent || ""));
}

/* Live numbers for the hero chips — same feeds, real counts. */
let routeTotal = 0;
try {
  const cats = await fetchJson(`${APP}/api/rapid-bus/categories`);
  for (const category of cats.categories || []) {
    try {
      routeTotal += (await fetchJson(`${APP}/api/rapid-bus/${category}/routes`)).routes.length;
    } catch { /* dead feed, skip */ }
  }
} catch { /* chips fall back to words */ }

const thumb = (p) => (p.body.match(/\/img\/([a-z-]+\.webp)/) || [])[0] || "/img/klang-valley-rail.webp";

writeFileSync(join(out, "index.html"), pageWide(
  "Malaysia & Singapore Public Transport Guide",
  "Schedules, line guides and how-tos for KL and Singapore buses, MRT, LRT and KTM — from the makers of the Public Transport Live tracker.",
  `${SITE}/`,
  `<div class="hero-band"><div class="hero-inner">
<div class="eyebrow">Platform 1 · Now boarding</div>
<h1>KL &amp; Singapore transit, explained</h1>
<p>Line guides, schedules and how-tos built on the official open-data feeds — paired with a free live tracker showing every bus and train moving in real time.</p>
<a class="cta" href="${APP_REF}">Open the live tracker</a>
<a class="cta ghost" href="${APP}/routes">Browse ${routeTotal ? routeTotal.toLocaleString() : "all"} routes</a>
<div class="hero-chips">
<span><b>${routeTotal ? routeTotal.toLocaleString() : "990+"}</b> routes tracked</span>
<span><b>2</b> countries</span>
<span><b>LIVE</b> GPS &amp; crowding</span>
<span><b>FREE</b> · no login</span>
</div></div></div>
<div class="section-cap">Departures — pick a guide</div>
<div class="ggrid">
${posts.map((p) => `<a class="gcard" href="/${p.slug}" style="--accent:${p.accent || "#2563eb"}"><img src="${thumb(p)}" alt="" loading="lazy"><div class="gbody"><div class="gline"><i></i>Guide</div><b>${p.title}</b><span>${p.desc}</span></div></a>`).join("")}
</div>`
));

writeFileSync(join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE}/</loc></url>\n` +
  posts.map((p) => `<url><loc>${SITE}/${p.slug}</loc></url>`).join("\n") + `\n</urlset>`);

writeFileSync(join(out, "rss.xml"),
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Malaysia & Singapore Transit Guide</title><link>${SITE}</link><description>Public transport guides for KL and Singapore</description>` +
  posts.map((p) => `<item><title>${p.title}</title><link>${SITE}/${p.slug}</link><description>${p.desc}</description></item>`).join("") +
  `</channel></rss>`);

writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(out, "_headers"), `/*\n  Cache-Control: public, max-age=3600\n  X-Content-Type-Options: nosniff\n`);

// Self-hosted map images (credited in each figure) ride along.
mkdirSync(join(out, "img"), { recursive: true });
for (const img of readdirSync(join(here, "img"))) {
  writeFileSync(join(out, "img", img), readFileSync(join(here, "img", img)));
}

console.log(`built ${posts.length} posts + ${readdirSync(join(here, "img")).length} images -> dist/`);
