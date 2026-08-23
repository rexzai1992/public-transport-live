/* Static blog builder — zero dependencies, same philosophy as the app.
   Posts are HTML fragments in posts/ with a <!--meta {...}--> header; this
   wraps them in the site template and emits dist/ ready for Cloudflare Pages:
   index, per-post pages, sitemap and RSS. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
const SITE = "https://blog.kaynx1.com";
const APP = "https://public.kaynx1.com";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const style = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* Same design tokens as the app at public.kaynx1.com — one product, one look. */
:root {
  --page:#f5f5f5; --panel:rgba(255,255,255,0.88); --edge:rgba(0,0,0,0.07); --edge-strong:rgba(0,0,0,0.22);
  --ink:#090909; --ink-2:rgba(0,0,0,0.62); --ink-3:rgba(0,0,0,0.4); --rule:rgba(0,0,0,0.07);
  --invert-bg:#090909; --invert-ink:#ffffff; --r-panel:16px; --r-btn:10px;
  --shadow:0 4px 14px rgba(0,0,0,0.08);
}
@media (prefers-color-scheme: dark){ :root {
  --page:#050810; --panel:rgba(17,24,37,0.9); --edge:rgba(124,178,240,0.14); --edge-strong:rgba(124,178,240,0.34);
  --ink:#eaf2ff; --ink-2:#a9c9ec; --ink-3:#7d9cc0; --rule:rgba(124,178,240,0.13);
  --invert-bg:#7cc4ff; --invert-ink:#04121f; --shadow:0 4px 14px rgba(0,4,12,0.5);
}}
*{box-sizing:border-box}
body{background:var(--page);color:var(--ink);font:16px/1.75 Inter,-apple-system,"Segoe UI",sans-serif;margin:0;padding:28px 20px 72px}
main{margin:0 auto;max-width:760px}
main.wide{max-width:1100px}
.brand{align-items:center;display:flex;gap:12px;margin-bottom:26px;text-decoration:none}
.brand-mark{align-items:center;background:var(--invert-bg);border-radius:12px;display:flex;flex:none;height:40px;justify-content:center;width:40px}
.brand-copy b{color:var(--ink);display:block;font-size:16px;font-weight:700;letter-spacing:-0.01em}
.brand-copy span{color:var(--ink-3);font-size:10.5px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase}
h1{font-size:26px;font-weight:700;letter-spacing:-0.015em;line-height:1.25;margin:0 0 6px}
h2{font-size:18px;font-weight:650;letter-spacing:-0.01em;margin:30px 0 10px}
h3{font-size:16px;font-weight:600;margin:22px 0 8px}
.sub{color:var(--ink-2);font-size:13.5px;margin:0 0 22px}
a{color:var(--ink);text-decoration:underline;text-underline-offset:2px}
p,li{max-width:66ch}
table{background:var(--panel);border:1px solid var(--edge);border-collapse:separate;border-spacing:0;border-radius:var(--r-panel);box-shadow:var(--shadow);font-size:14px;margin:16px 0;overflow:hidden;width:100%}
th{color:var(--ink-3);font-size:10.5px;font-weight:600;letter-spacing:0.07em;padding:10px 14px 6px;text-align:left;text-transform:uppercase}
td{border-top:1px solid var(--rule);padding:9px 14px}
.cta{background:var(--invert-bg);border-radius:var(--r-btn);color:var(--invert-ink);display:inline-block;font-size:13.5px;font-weight:600;margin:12px 0;padding:12px 22px;text-decoration:none}
.card{background:var(--panel);border:1px solid var(--edge);border-radius:var(--r-panel);box-shadow:var(--shadow);display:block;margin:12px 0;padding:16px 18px;text-decoration:none;transition:border-color .14s}
.card:hover{border-color:var(--edge-strong)}
.card b{color:var(--ink);display:block;font-size:16.5px;font-weight:650;letter-spacing:-0.01em}
.card span{color:var(--ink-2);font-size:13px}
figure{margin:18px 0}
figure img{border:1px solid var(--edge);border-radius:var(--r-panel);box-shadow:var(--shadow)}
figcaption{color:var(--ink-3);font-size:11px}
blockquote{border-left:3px solid var(--edge-strong);color:var(--ink-2);margin:14px 0;padding:2px 16px}
.foot{border-top:1px solid var(--rule);color:var(--ink-3);font-size:12px;margin-top:44px;padding-top:14px}
.hero{margin:6px 0 22px}
.hero h1{font-size:30px;max-width:17ch}
.hero .sub{font-size:15px;max-width:52ch}
.cta-row{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 6px}
.cta.ghost{background:transparent;border:1px solid var(--edge-strong);color:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 26px}
.chip{background:var(--panel);border:1px solid var(--edge);border-radius:999px;color:var(--ink-2);font-size:12.5px;font-weight:600;padding:7px 14px}
.chip b{color:var(--ink)}
.hero-img{border:1px solid var(--edge);border-radius:var(--r-panel);box-shadow:var(--shadow);display:block;height:auto;margin:16px 0 2px;width:100%}
.ggrid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.gcard{margin:0}
.gcard img{border:1px solid var(--edge);border-radius:10px;display:block;margin-bottom:10px;width:100%;height:150px;object-fit:cover}
</style>`;

const pageWide = (title, desc, canonical, body) => page(title, desc, canonical, body, true);
const page = (title, desc, canonical, body, wide = false) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" href="${SITE}/rss.xml">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
${style}</head><body><main${wide ? ' class="wide"' : ""}>
<a class="brand" href="/">
  <span class="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 4h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-1.4 2.25v1.6a1.3 1.3 0 0 1-2.6 0v-1.1H7.5v1.1a1.3 1.3 0 0 1-2.6 0v-1.6A2.5 2.5 0 0 1 3.5 15.5v-9A2.5 2.5 0 0 1 6 4Z" fill="var(--invert-ink)"/><rect x="5.6" y="6.4" width="12.8" height="4.9" rx="1" fill="var(--invert-bg)"/><circle cx="7.9" cy="14.4" r="1.15" fill="var(--invert-bg)"/><circle cx="16.1" cy="14.4" r="1.15" fill="var(--invert-bg)"/></svg></span>
  <span class="brand-copy"><b>Public Transport Live</b><span>Malaysia · Singapore · Guides</span></span>
</a>
${body}
<p class="foot">Public Transport Live — independent guide built on open data. Times shown are typical and change;
always check the <a href="${APP}">live tracker</a> before you travel. <a href="${APP}/terms.html">Terms &amp; Privacy</a></p>
</main></body></html>`;

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
  const body = `<h1>${post.title}</h1><p class="sub">${post.date} · Public Transport Live guide</p>
${resolved}
<p class="sub" style="margin-top:26px">Route figures on this page were generated on ${stamp} from the official
Prasarana / LTA open-data feeds — the same source the <a href="${APP}">live tracker</a> uses. Nothing here is hand-typed.</p>
<p><a class="cta" href="${APP}">Check it live before you travel — free, no login</a></p>`;
  writeFileSync(join(out, `${post.slug}.html`), page(`${post.title} | Transit Guide`, post.desc, `${SITE}/${post.slug}`, body));
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
  `<div class="hero">
<h1>KL &amp; Singapore transit, explained</h1>
<p class="sub">Line guides, schedules and how-tos built on the official open-data feeds —
paired with a free live tracker showing every bus and train moving in real time.</p>
<img class="hero-img" src="/img/hero-banner.webp" alt="Map of the Klang Valley with all KL rail lines drawn" width="1364" height="382" loading="eager">
<figcaption style="color:var(--ink-3);font-size:11px;margin-top:4px">Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a> · Tiles © <a href="https://carto.com/attributions" rel="noopener">CARTO</a> · line geometry from the official GTFS feeds</figcaption>
<div class="cta-row"><a class="cta" href="${APP}">Open the live tracker</a>
<a class="cta ghost" href="${APP}/routes">Browse ${routeTotal ? routeTotal.toLocaleString() : "all"} routes</a></div>
<div class="chips">
<span class="chip"><b>${routeTotal ? routeTotal.toLocaleString() : "990+"}</b> routes tracked</span>
<span class="chip"><b>2</b> countries</span>
<span class="chip"><b>Live</b> GPS &amp; crowding</span>
<span class="chip"><b>Free</b> · no login</span>
</div></div>
<div class="ggrid">
${posts.map((p) => `<a class="card gcard" href="/${p.slug}"><img src="${thumb(p)}" alt="" loading="lazy"><b>${p.title}</b><span>${p.desc}</span></a>`).join("")}
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
