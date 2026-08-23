/* Server-rendered route pages for search engines (and for humans arriving
   from them). The app itself is a JS map — great to use, invisible to a
   crawler. These pages put every route's stops into plain HTML that matches
   what people actually search ("bus T852 route"), then hand off to the live
   app. Rendered from the same cached GTFS feeds the API serves. */
import { Router } from "express";
import { FEEDS, FEED_IDS, type FeedId, feedDefinition } from "./config.js";
import { getStaticFeed, findRoutePatterns, listRoutes } from "./gtfsStatic.js";
import { planJourney, searchStops, type Journey } from "./journey.js";

export const seoRouter = Router();

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function routeCode(route: { shortName?: string; longName?: string; routeId: string }): string {
  return route.shortName || route.longName || route.routeId;
}

const PAGE_STYLE = `<style>
:root { --bg:#f5f5f5; --card:#fff; --ink:#16202c; --ink2:#5b6b7d; --rule:#e3e8ee; --accent:#175fc0; }
@media (prefers-color-scheme: dark){ :root { --bg:#050810; --card:#111825; --ink:#eaf2ff; --ink2:#a9c9ec; --rule:#22304a; --accent:#7cc4ff; } }
*{box-sizing:border-box} body{background:var(--bg);color:var(--ink);font:15px/1.65 system-ui,sans-serif;margin:0;padding:28px 18px 64px}
main{margin:0 auto;max-width:720px}
main.wide{max-width:1100px}
h1{font-size:24px;line-height:1.3;margin:0 0 4px}
.sub{color:var(--ink2);font-size:13px;margin:0 0 18px}
.cta{background:var(--accent);border-radius:10px;color:#fff;display:inline-block;font-weight:600;margin:6px 12px 22px 0;padding:10px 18px;text-decoration:none}
h2{font-size:16px;margin:22px 0 8px} ol{margin:0;padding-left:22px} li{margin:2px 0}
a{color:var(--accent)} .foot{color:var(--ink2);font-size:12px;margin-top:28px}
.cols{columns:4 220px;column-gap:28px}
.filter{background:var(--card);border:1px solid var(--rule);border-radius:10px;color:var(--ink);display:block;font:inherit;margin:0 0 18px;max-width:420px;padding:11px 14px;width:100%}
.filter:focus{border-color:var(--accent);outline:none}
details{background:var(--card);border:1px solid var(--rule);border-radius:12px;margin:10px 0;padding:4px 18px 8px}
details summary{cursor:pointer;font-size:15px;font-weight:650;padding:10px 0}
details summary small{color:var(--ink2);font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 18px}
.chips a{background:var(--card);border:1px solid var(--rule);border-radius:999px;color:var(--ink);font-size:13px;padding:7px 14px;text-decoration:none}
.chips a:hover{border-color:var(--accent)}
</style>`;

function feedIdOf(value: string): FeedId | null {
  return (FEED_IDS as readonly string[]).includes(value) ? (value as FeedId) : null;
}

seoRouter.get("/routes", async (_req, res, next) => {
  try {
    const sections = await Promise.all(
      FEED_IDS.map(async (feedId) => {
        const feed = await getStaticFeed(feedId).catch(() => null);
        if (!feed) return "";
        const rows = listRoutes(feed)
          .map((route) => ({ route, code: routeCode(route) }))
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map(
            ({ route, code }) =>
              `<li><a href="/route/${feedId}/${encodeURIComponent(route.routeId)}">${esc(code)}${
                route.longName && route.longName !== code ? ` — ${esc(route.longName)}` : ""
              }</a></li>`
          )
          .join("");
        const count = listRoutes(feed).length;
        return `<details${feedId === "rapid-bus-kl" ? " open" : ""}><summary>${esc(feedDefinition(feedId).label)} <small>· ${count} routes</small></summary><ol class="cols">${rows}</ol></details>`;
      })
    );

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All routes — Public Transport Live (Malaysia & Singapore)</title>
<meta name="description" content="Every bus, LRT, MRT, Monorail and KTM route in the Public Transport Live tracker: Rapid KL, MRT Feeder, Rapid Penang, Rapid Rail, KTM Komuter and Singapore buses and trains.">
<link rel="canonical" href="https://public.kaynx1.com/routes">${PAGE_STYLE}</head><body><main class="wide">
<h1>All routes</h1>
<p class="sub">Malaysia &amp; Singapore public transport — live positions, stops and timetables.</p>
<a class="cta" href="/">Open the live map</a>
<h2>Popular journeys</h2>
<div class="chips">${JOURNEY_PAIRS.map((p) => `<a href="/go/${p.slug}">${esc(p.fromName)} → ${esc(p.toName)}</a>`).join("")}</div>
<input class="filter" type="search" placeholder="Filter routes… (e.g. 851, Kajang, T117)" oninput="
  const q=this.value.trim().toLowerCase();
  document.querySelectorAll('details').forEach(d=>{
    let any=false;
    d.querySelectorAll('li').forEach(li=>{const hit=!q||li.textContent.toLowerCase().includes(q);li.style.display=hit?'':'none';if(hit)any=true;});
    d.style.display=any?'':'none'; if(q)d.open=true;
  });">
${sections.join("")}
<p class="foot"><a href="/">Public Transport Live</a> · <a href="/terms.html">Terms &amp; Privacy</a></p>
</main></body></html>`);
  } catch (error) {
    next(error);
  }
});

seoRouter.get("/route/:feedId/:routeId", async (req, res, next) => {
  try {
    const feedId = feedIdOf(req.params.feedId);
    if (!feedId) {
      res.status(404).type("html").send("Unknown area");
      return;
    }
    const feed = await getStaticFeed(feedId);
    const route = feed.routes.get(req.params.routeId);
    if (!route) {
      res.status(404).type("html").send("Unknown route");
      return;
    }

    const code = routeCode(route);
    const label = feedDefinition(feedId).label;
    const mode = feedDefinition(feedId).mode === "rail" ? "train" : "bus";
    const patterns = findRoutePatterns(feed, route.routeId);

    const directions = patterns
      .map((pattern, index) => {
        const stops = pattern.stops;
        if (!stops.length) return "";
        const heading = pattern.headsign
          ? `Towards ${esc(pattern.headsign)}`
          : `${esc(stops[0].name)} → ${esc(stops[stops.length - 1].name)}`;
        return `<h2>${heading} (${stops.length} stops)</h2>
<ol>${stops.map((stop) => `<li>${esc(stop.name)}</li>`).join("")}</ol>`;
      })
      .join("");

    const title = `${code} ${mode} route — stops & live tracker | ${label}`;
    const appLink = `/?area=${encodeURIComponent(feedId)}&route=${encodeURIComponent(route.routeId)}`;
    const stopCount = patterns[0]?.stops.length ?? 0;

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(`${label} ${mode} ${code}${route.longName ? ` (${route.longName})` : ""}: all ${stopCount} stops, route map and real-time ${mode} positions. Track it live, free.`)}">
<link rel="canonical" href="https://public.kaynx1.com/route/${feedId}/${encodeURIComponent(route.routeId)}">${PAGE_STYLE}</head><body><main>
<h1>${esc(code)}${route.longName && route.longName !== code ? ` — ${esc(route.longName)}` : ""}</h1>
<p class="sub">${esc(label)} · live positions and arrival estimates in the app</p>
<a class="cta" href="${esc(appLink)}">Track ${esc(code)} live on the map</a>
${directions || "<p>Stop list unavailable right now.</p>"}
<p class="foot"><a href="/routes">All routes</a> · <a href="/">Public Transport Live</a> · times are estimates — <a href="/terms.html">Terms</a></p>
</main></body></html>`);
  } catch (error) {
    next(error);
  }
});

/* The sitemap grows with the network instead of being a hand-kept file. */
seoRouter.get("/sitemap.xml", async (_req, res, next) => {
  try {
    const urls: string[] = [
      "https://public.kaynx1.com/",
      "https://public.kaynx1.com/routes",
      "https://public.kaynx1.com/terms.html",
      ...JOURNEY_PAIRS.map((p) => `https://public.kaynx1.com/go/${p.slug}`)
    ];
    for (const feedId of FEED_IDS) {
      const feed = await getStaticFeed(feedId).catch(() => null);
      if (!feed) continue;
      for (const route of feed.routes.values()) {
        urls.push(`https://public.kaynx1.com/route/${feedId}/${encodeURIComponent(route.routeId)}`);
      }
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((url) => `<url><loc>${url}</loc></url>`).join("\n") +
        `\n</urlset>`
    );
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------------- */
/* Journey landing pages: /go/<slug> answers "how to get from X to Y" with a  */
/* real plan from the same engine the app uses — steps, duration, transfers — */
/* then hands off to the live planner pre-filled. Pairs are curated to ones   */
/* the open feeds genuinely cover (KLIA, notably, is not: the airport rail    */
/* is a private operator outside the open data).                              */
/* ------------------------------------------------------------------------- */

type JourneyPair = {
  slug: string;
  fromName: string;
  lat: number;
  lon: number;
  toQuery: string;
  toName: string;
};

export const JOURNEY_PAIRS: JourneyPair[] = [
  { slug: "kl-sentral-to-klcc", fromName: "KL Sentral", lat: 3.1338, lon: 101.6869, toQuery: "KLCC", toName: "KLCC" },
  { slug: "kl-sentral-to-bukit-bintang", fromName: "KL Sentral", lat: 3.1338, lon: 101.6869, toQuery: "Bukit Bintang", toName: "Bukit Bintang" },
  { slug: "kl-sentral-to-batu-caves", fromName: "KL Sentral", lat: 3.1338, lon: 101.6869, toQuery: "Batu Caves", toName: "Batu Caves" },
  { slug: "tbs-to-kl-sentral", fromName: "TBS (Terminal Bersepadu Selatan)", lat: 3.0763, lon: 101.7118, toQuery: "KL Sentral", toName: "KL Sentral" },
  { slug: "kl-sentral-to-kajang", fromName: "KL Sentral", lat: 3.1338, lon: 101.6869, toQuery: "Kajang", toName: "Kajang" },
  { slug: "klcc-to-batu-caves", fromName: "KLCC", lat: 3.1578, lon: 101.7119, toQuery: "Batu Caves", toName: "Batu Caves" },
  { slug: "kl-sentral-to-putrajaya", fromName: "KL Sentral", lat: 3.1338, lon: 101.6869, toQuery: "Putrajaya Sentral", toName: "Putrajaya Sentral" },
  { slug: "bukit-bintang-to-klcc", fromName: "Bukit Bintang", lat: 3.1466, lon: 101.7107, toQuery: "KLCC", toName: "KLCC" },
  { slug: "changi-to-orchard", fromName: "Changi Airport", lat: 1.3573, lon: 103.9887, toQuery: "Orchard", toName: "Orchard" },
  { slug: "changi-to-marina-bay", fromName: "Changi Airport", lat: 1.3573, lon: 103.9887, toQuery: "Marina Bay", toName: "Marina Bay" },
  { slug: "woodlands-to-raffles-place", fromName: "Woodlands", lat: 1.437, lon: 103.7865, toQuery: "Raffles Place", toName: "Raffles Place" },
  { slug: "jurong-east-to-changi", fromName: "Jurong East", lat: 1.3329, lon: 103.7422, toQuery: "Changi Airport", toName: "Changi Airport" },
  { slug: "tampines-to-city-hall", fromName: "Tampines", lat: 1.3546, lon: 103.9451, toQuery: "City Hall", toName: "City Hall" },
  { slug: "orchard-to-harbourfront", fromName: "Orchard", lat: 1.3040, lon: 103.8320, toQuery: "HarbourFront", toName: "HarbourFront (Sentosa)" }
];

const goCache = new Map<string, { expiresAt: number; html: string }>();

function legHtml(leg: Journey["legs"][number]): string {
  if (leg.kind === "walk") {
    return `<li><b>Walk</b> ${leg.meters} m (~${leg.minutes} min) to ${esc(leg.to.name)}</li>`;
  }
  const badge = `<span style="background:#${esc(leg.routeColor || "1c2c44")};border-radius:6px;color:#fff;font-size:12px;font-weight:700;padding:2px 8px">${esc(leg.routeName)}</span>`;
  return `<li>${badge} ${leg.mode === "rail" ? "train" : "bus"} from <b>${esc(leg.from.name)}</b> to <b>${esc(leg.to.name)}</b> — ${leg.stopCount} stops, ~${leg.minutes} min${leg.headsign ? ` (towards ${esc(leg.headsign)})` : ""}</li>`;
}

seoRouter.get("/go/:slug", async (req, res, next) => {
  try {
    const pair = JOURNEY_PAIRS.find((p) => p.slug === req.params.slug);
    if (!pair) {
      res.status(404).type("html").send("Unknown journey");
      return;
    }
    const cached = goCache.get(pair.slug);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("Cache-Control", "public, max-age=600");
      res.type("html").send(cached.html);
      return;
    }

    const stops = await searchStops(pair.toQuery, [...FEED_IDS]);
    const to = stops[0];
    let journeys: Journey[] = [];
    if (to) {
      const plan = await planJourney({
        from: { lat: pair.lat, lon: pair.lon, name: pair.fromName },
        to: { stopKey: to.key },
        feeds: [...FEED_IDS]
      });
      journeys = plan.journeys ?? [];
    }

    const best = journeys[0];
    const title = `${pair.fromName} to ${pair.toName} by public transport`;
    const appLink = to
      ? `/?jf=${pair.lat.toFixed(5)},${pair.lon.toFixed(5)}&jfn=${encodeURIComponent(pair.fromName)}&jt=${encodeURIComponent(to.key)}&jtn=${encodeURIComponent(pair.toName)}`
      : "/";

    const body = best
      ? `<p class="sub">Typically <b>~${best.totalMinutes} minutes</b> · ${best.transfers} transfer${best.transfers === 1 ? "" : "s"} · ${best.walkMeters} m walking. Generated just now by the live journey planner; exact times shift through the day.</p>
<h2>Step by step</h2>
<ol>${best.legs.map(legHtml).join("")}</ol>
${journeys.length > 1 ? `<p>${journeys.length - 1} alternative${journeys.length > 2 ? "s" : ""} available in the app, including later departures.</p>` : ""}
<a class="cta" href="${esc(appLink)}">Plan this trip live — real-time positions &amp; alerts</a>`
      : `<p class="sub">The live planner could not produce this journey right now.</p>
<a class="cta" href="/">Open the live tracker</a>`;

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — route, time &amp; steps</title>
<meta name="description" content="${esc(`How to get from ${pair.fromName} to ${pair.toName}: step-by-step public transport directions${best ? `, typically ~${best.totalMinutes} minutes` : ""}, with live tracking. Free, no login.`)}">
<link rel="canonical" href="https://public.kaynx1.com/go/${pair.slug}">${PAGE_STYLE}</head><body><main>
<h1>${esc(pair.fromName)} → ${esc(pair.toName)}</h1>
${body}
<h2>More journeys</h2>
<ol>${JOURNEY_PAIRS.filter((p) => p.slug !== pair.slug).slice(0, 6).map((p) => `<li><a href="/go/${p.slug}">${esc(p.fromName)} → ${esc(p.toName)}</a></li>`).join("")}</ol>
<p class="foot"><a href="/routes">All routes</a> · <a href="/">Public Transport Live</a> · times are estimates — <a href="/terms.html">Terms</a></p>
</main></body></html>`;

    goCache.set(pair.slug, { expiresAt: Date.now() + 10 * 60 * 1000, html });
    res.setHeader("Cache-Control", "public, max-age=600");
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});
