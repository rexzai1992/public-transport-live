/* Server-rendered route pages for search engines (and for humans arriving
   from them). The app itself is a JS map — great to use, invisible to a
   crawler. These pages put every route's stops into plain HTML that matches
   what people actually search ("bus T852 route"), then hand off to the live
   app. Rendered from the same cached GTFS feeds the API serves. */
import { Router } from "express";
import { FEEDS, FEED_IDS, type FeedId, feedDefinition } from "./config.js";
import { getStaticFeed, findRoutePatterns, listRoutes } from "./gtfsStatic.js";

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
main{margin:0 auto;max-width:640px} h1{font-size:22px;line-height:1.3;margin:0 0 4px}
.sub{color:var(--ink2);font-size:13px;margin:0 0 18px}
.cta{background:var(--accent);border-radius:10px;color:#fff;display:inline-block;font-weight:600;margin:6px 0 22px;padding:10px 18px;text-decoration:none}
h2{font-size:15px;margin:22px 0 8px} ol{margin:0;padding-left:22px} li{margin:2px 0}
a{color:var(--accent)} .foot{color:var(--ink2);font-size:12px;margin-top:28px}
.cols{columns:2 260px;column-gap:28px}
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
        return `<h2>${esc(feedDefinition(feedId).label)}</h2><ol class="cols">${rows}</ol>`;
      })
    );

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All routes — Public Transport Live (Malaysia & Singapore)</title>
<meta name="description" content="Every bus, LRT, MRT, Monorail and KTM route in the Public Transport Live tracker: Rapid KL, MRT Feeder, Rapid Penang, Rapid Rail, KTM Komuter and Singapore buses and trains.">
<link rel="canonical" href="https://public.kaynx1.com/routes">${PAGE_STYLE}</head><body><main>
<h1>All routes</h1>
<p class="sub">Malaysia &amp; Singapore public transport — live positions, stops and timetables.</p>
<a class="cta" href="/">Open the live map</a>
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
      "https://public.kaynx1.com/terms.html"
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
