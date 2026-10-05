/* Server-rendered route pages for search engines (and for humans arriving
   from them). The app itself is a JS map — great to use, invisible to a
   crawler. These pages put every route's stops into plain HTML that matches
   what people actually search ("bus T852 route"), then hand off to the live
   app. Rendered from the same cached GTFS feeds the API serves. */
import { Router } from "express";
import { FEEDS, FEED_IDS, type FeedId, feedDefinition } from "./config.js";
import { getStaticFeed, findRoutePatterns, listRoutes } from "./gtfsStatic.js";
import { planJourney, searchStops, stopConnections, type Journey, type StopConnection } from "./journey.js";
import { DEFAULT_JOURNEY_FEEDS } from "./routes.js";
import { buildRouteStopSchedule, malaysiaClock, formatGtfsMinutes } from "./schedule.js";

export const seoRouter = Router();

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/* Monochrome, like the app (design/UI-BRIEF.md): black and white glass, colour
   only where it carries meaning — a rail line's own colour. */
const PAGE_STYLE = `<link rel="icon" href="/assets/bus.svg"><link rel="apple-touch-icon" href="/assets/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#f5f5f5;--card:rgba(255,255,255,.78);--raised:#fff;--ink:#0a0a0a;--ink2:rgba(0,0,0,.62);--ink3:rgba(0,0,0,.42);--rule:rgba(0,0,0,.08);--hover:rgba(0,0,0,.04);--inv:#0a0a0a;--invink:#fff;--live:#1f9d55;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#080808;--card:rgba(22,22,22,.78);--raised:#161616;--ink:#fff;--ink2:rgba(255,255,255,.66);--ink3:rgba(255,255,255,.42);--rule:rgba(255,255,255,.09);--hover:rgba(255,255,255,.06);--inv:#fff;--invink:#0a0a0a;--live:#3ecf7a;color-scheme:dark}}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration-color:var(--ink3);text-underline-offset:3px}
a:hover{text-decoration-color:var(--ink)}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:6px}
.top{backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);background:color-mix(in srgb,var(--bg) 82%,transparent);border-bottom:1px solid var(--rule);position:sticky;top:0;z-index:20}
.top-in{align-items:center;display:flex;gap:16px;margin:0 auto;max-width:1120px;padding:10px 16px}
.brand{align-items:center;display:flex;font-size:15px;font-weight:600;gap:10px;letter-spacing:-.01em;text-decoration:none;white-space:nowrap}
.mark{background:var(--inv);border-radius:8px;display:grid;height:30px;place-items:center;width:30px;flex:none}
.top nav{align-items:center;display:flex;gap:4px;margin-left:auto}
.top nav a{border-radius:8px;color:var(--ink2);font-size:13.5px;font-weight:500;padding:7px 10px;text-decoration:none}
.top nav a:hover,.top nav a[aria-current]{background:var(--hover);color:var(--ink)}
.top nav a.go{background:var(--inv);color:var(--invink);font-weight:600;margin-left:4px}
@media (max-width:520px){.brand .bt{display:none}.top nav a.faq{display:none}}
main{margin:0 auto;max-width:760px;padding:28px 16px 64px}
main.wide{max-width:1120px}
h1{font-size:28px;font-weight:700;letter-spacing:-.025em;line-height:1.2;margin:0 0 6px}
.sub{color:var(--ink2);font-size:14px;margin:0 0 18px}
.crumbs{color:var(--ink3);font-size:12.5px;margin:0 0 10px}
.crumbs a{color:var(--ink2);text-decoration:none}.crumbs a:hover{color:var(--ink)}
.cta{background:var(--inv);border-radius:10px;color:var(--invink);display:inline-block;font-size:14px;font-weight:600;margin:6px 12px 22px 0;padding:11px 18px;text-decoration:none}
h2{font-size:17px;letter-spacing:-.01em;margin:26px 0 8px}
ol{margin:0;padding-left:22px} li{margin:3px 0}
.foot{border-top:1px solid var(--rule);color:var(--ink3);font-size:12px;line-height:1.7;margin-top:40px;padding-top:16px}
.foot a{color:var(--ink2)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 18px}
.chips a{background:var(--card);border:1px solid var(--rule);border-radius:999px;font-size:13px;padding:7px 14px;text-decoration:none}
.chips a:hover{background:var(--raised);border-color:var(--ink3)}
.statrow{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 18px}
.statrow span{background:var(--card);border:1px solid var(--rule);border-radius:999px;color:var(--ink2);font-size:12.5px;font-weight:500;padding:6px 13px}
.statrow b{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:600}
.badge{background:var(--bc,var(--inv));border-radius:7px;color:var(--bt,var(--invink));display:inline-block;font-size:14px;font-weight:700;margin-right:10px;padding:3px 10px;vertical-align:4px}
.tt{background:var(--card);border:1px solid var(--rule);border-radius:12px;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;margin:14px 0 22px;overflow:hidden;width:100%}
.tt th{border-bottom:1px solid var(--rule);color:var(--ink3);font-size:11px;font-weight:600;letter-spacing:.06em;padding:8px 12px;text-align:left;text-transform:uppercase}
.tt td{border-top:1px solid var(--rule);font-size:13.5px;padding:7px 12px}
.tt td:first-child{color:var(--ink2);font-weight:600;width:52px}
.rail-list{list-style:none;margin:12px 0 20px;padding:0}
.rail-list li{padding:5px 0 5px 28px;position:relative}
.rail-list li::before{background:var(--bg);border:3px solid var(--lc,var(--ink));border-radius:50%;content:"";height:9px;left:4px;position:absolute;top:11px;width:9px}
.rail-list li:not(:last-child)::after{background:var(--lc,var(--ink));content:"";height:calc(100% - 8px);left:9.5px;opacity:.35;position:absolute;top:24px;width:3px}
.rail-list li:first-child::before,.rail-list li:last-child::before{background:var(--lc,var(--ink))}
</style>`;

const BUS_MARK = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-1.4 2.25v1.6a1.3 1.3 0 0 1-2.6 0v-1.1H7.5v1.1a1.3 1.3 0 0 1-2.6 0v-1.6A2.5 2.5 0 0 1 3.5 15.5v-9A2.5 2.5 0 0 1 6 4Z" fill="var(--invink)"/><rect x="5.6" y="6.4" width="12.8" height="4.9" rx="1" fill="var(--inv)"/><circle cx="7.9" cy="14.4" r="1.15" fill="var(--inv)"/><circle cx="16.1" cy="14.4" r="1.15" fill="var(--inv)"/></svg>`;

/** The bar on every server-rendered page: home, the route list, the FAQ. */
function topBar(current?: "routes" | "faq"): string {
  return `<header class="top"><div class="top-in">
<a class="brand" href="/"><span class="mark">${BUS_MARK}</span><span class="bt">Public Transport Live</span></a>
<nav aria-label="Site"><a href="/routes"${current === "routes" ? ' aria-current="page"' : ""}>Routes</a><a href="${TRAVEL_GUIDE}/">Guides</a><a class="faq" href="/faq"${current === "faq" ? ' aria-current="page"' : ""}>FAQ</a><a class="go" href="/">Live map</a></nav>
</div></header>`;
}

/* The travel guide (blog/, on Cloudflare Pages). Route pages point at the
   guides that explain their network; slugs match blog/posts/NN-<slug>.html. */
const TRAVEL_GUIDE = "https://travel-guide.kaynx1.com";
const GUIDE_TITLES: Record<string, string> = {
  "kl-train-lines-guide": "KL train lines explained",
  "kl-attractions-by-train": "KL sights by train",
  "kl-fares-and-passes": "KL fares & passes",
  "rapid-kl-bus-how-to": "Riding Rapid KL buses",
  "ktm-komuter-guide": "KTM Komuter guide",
  "ets-intercity-trains": "ETS & intercity trains",
  "klia-changi-by-public-transport": "Airports by public transport",
  "penang-by-bus": "Penang by bus",
  "melaka-by-bus": "Melaka by bus",
  "johor-bahru-to-singapore": "Johor Bahru \u2194 Singapore",
  "mybas-city-buses": "City buses across Malaysia",
  "singapore-mrt-guide": "Singapore MRT explained",
  "singapore-attractions-by-mrt": "Singapore sights by MRT",
  "singapore-buses-how-to": "Riding Singapore buses",
  "singapore-fares-and-tourist-pass": "Singapore fares & Tourist Pass"
};
function guidesFor(feedId: FeedId): string[] {
  if (feedId === "rapid-rail-kl") return ["kl-train-lines-guide", "kl-attractions-by-train", "kl-fares-and-passes"];
  if (feedId === "rapid-bus-kl" || feedId === "rapid-bus-mrtfeeder") return ["rapid-kl-bus-how-to", "kl-fares-and-passes", "kl-attractions-by-train"];
  if (feedId === "ktmb") return ["ktm-komuter-guide", "ets-intercity-trains", "johor-bahru-to-singapore"];
  if (feedId === "rapid-bus-penang") return ["penang-by-bus"];
  if (feedId === "mybas-melaka") return ["melaka-by-bus", "mybas-city-buses"];
  if (feedId === "mybas-johor") return ["johor-bahru-to-singapore", "mybas-city-buses"];
  if (feedId.startsWith("mybas-")) return ["mybas-city-buses"];
  if (feedId === "sg-rail") return ["singapore-mrt-guide", "singapore-attractions-by-mrt", "singapore-fares-and-tourist-pass"];
  if (feedId === "sg-bus") return ["singapore-buses-how-to", "singapore-fares-and-tourist-pass", "singapore-attractions-by-mrt"];
  return [];
}

/* Google AdSense — on the timetable pages (/routes and /route/...) only. The
   live map and the Android app carry no ads; the homepage has just the
   ownership <meta> (public/index.html). Auto ads are switched on in the AdSense
   dashboard and can only appear where this script loads. The three fixed spots
   need display ad-unit ids: ADSENSE_SLOTS="slot1,slot2,slot3" (one id is
   reused for all three). Without them the spots render nothing. */
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT?.trim() || "ca-pub-4843649883093955";
const ADSENSE_SLOTS = (process.env.ADSENSE_SLOTS ?? "").split(",").map((slot) => slot.trim()).filter((slot) => /^\d+$/.test(slot));

const AD_HEAD = `<meta name="google-adsense-account" content="${ADSENSE_CLIENT}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<style>
.ad{margin:28px 0;min-height:110px}
.ad-label{color:var(--ink3);display:block;font-size:10.5px;font-weight:600;letter-spacing:.08em;margin-bottom:6px;text-transform:uppercase}
.ad:has(ins[data-ad-status="unfilled"]){display:none}
ins.adsbygoogle[data-ad-status="unfilled"]{display:none!important}
</style>`;

/** One fixed ad spot (0, 1 or 2), or nothing until ad-unit ids are set. */
function adSpot(position: number): string {
  if (!ADSENSE_SLOTS.length) return "";
  const slot = ADSENSE_SLOTS[position % ADSENSE_SLOTS.length];
  return `<aside class="ad" aria-label="Advertisement"><span class="ad-label">Advertisement</span><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>`;
}

const AD_FOOT = `<script>document.querySelectorAll("ins.adsbygoogle").forEach(function(){(window.adsbygoogle=window.adsbygoogle||[]).push({});});</script>`;

const CREDITS = `Timetables and live positions: Malaysia Open API (Prasarana, KTMB, APAD) and LTA DataMall.
Map and place search data &copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> contributors.`;

/* Signage words that stay capitalised when an ALL-CAPS feed name is tidied. */
const KEEP_UPPER = new Set([
  "KL", "KLCC", "KLIA", "LRT", "MRT", "KTM", "BRT", "ETS", "JB", "PJ", "PJU", "SS", "USJ", "UIA", "UITM",
  "UKM", "UM", "UPM", "SK", "SMK", "PPR", "TBS", "TTDI", "MBKT", "IOI", "AEON", "PPUM", "HKL", "MRR2"
]);

/** "SHAHAB PERDANA - PENDANG VIA SIMPANG EMPAT" → "Shahab Perdana - Pendang via Simpang Empat". */
function tidyName(value: string): string {
  if (/[a-z]/.test(value)) return value;
  return value.replace(/[A-Z0-9'’]+/g, (word) => {
    // Codes like SS15 or KL2212 stay; a long word with a digit ("TERMINAL1") is a name.
    if (KEEP_UPPER.has(word) || (/\d/.test(word) && word.length <= 6)) return word;
    if (word === "VIA") return "via";
    return word.charAt(0) + word.slice(1).toLowerCase();
  });
}

/* Same naming rules as the app's route list (normalizeRoute in app.js), so a
   route reads the same on the page as on the map:
   - MRT feeders publish no short name; the code ("T117") is the long name.
   - MyBus Ipoh and Seremban repeat the long name as the short name; the code
     is the route_id ("A100", "N50").
   - Rail lines lead with their name and keep the endpoints underneath. */
export type RouteDisplay = { code: string; title: string; ends: string };

export function routeDisplay(
  route: { routeId: string; shortName?: string; longName?: string; description?: string },
  feedLabel: string,
  rail = false
): RouteDisplay {
  const rawShort = String(route.shortName ?? "").trim();
  const rawLong = String(route.longName ?? "").trim();
  const description = String(route.description ?? "").trim();
  const looksLikeCode = /^[A-Z]{0,3}\d{1,4}[A-Z]?$/i.test(rawLong);
  const usableShort = rawShort && rawShort.toLowerCase() !== rawLong.toLowerCase() ? rawShort : "";
  const code = (usableShort || (looksLikeCode ? rawLong : route.routeId)).replace(/\s+Line$/i, "");

  const split = (text: string) => {
    const parts = text.split(/\s*[~–—]\s*|\s+-\s+|\s*→\s*/).filter(Boolean);
    return parts.length >= 2 ? `${tidyName(parts[0])} → ${tidyName(parts.slice(1).join(" → "))}` : "";
  };
  // "J10: JB Sentral - Terminal Bas Kota" — the prefix repeats the code.
  const cleanDescription = description.replace(/^[A-Z0-9]+:\s*/i, "");

  if (looksLikeCode && !usableShort) {
    return { code, title: `${feedLabel} ${code}`, ends: split(cleanDescription) };
  }
  if (cleanDescription && cleanDescription !== rawLong && /[~–—]|\s-\s/.test(cleanDescription) && !split(rawLong)) {
    return { code, title: tidyName(rawLong || code), ends: split(cleanDescription) };
  }
  const ends = split(rawLong);
  /* A train's long name is one service ("KTM Butterworth - Ipoh", "Intercity
     Ekspres Rakyat Timuran Tumpat - JB Sentral"); splitting it into origin and
     destination lines broke it mid-name. Keep it whole. */
  if (rail && ends) return { code, title: ends, ends: "" };
  return { code, title: ends ? ends.split(" → ")[0] : tidyName(rawLong || code), ends: ends ? `→ ${ends.split(" → ").slice(1).join(" → ")}` : "" };
}

function isSgFeed(feedId: string): boolean {
  return feedId.startsWith("sg");
}

/** Bus or rail for one route: the feed's mode, except BRT on a rail feed. */
function routeModeOf(feedId: FeedId, route: { type?: string }): "bus" | "rail" {
  if (feedDefinition(feedId).mode === "rail") return route.type === "3" ? "bus" : "rail";
  return "bus";
}

function feedIdOf(value: string): FeedId | null {
  return (FEED_IDS as readonly string[]).includes(value) ? (value as FeedId) : null;
}

/* MRT feeders (and a few myBAS routes) name no endpoints at all, so "MRT
   Feeder T852" told nobody where it goes. The timetable does: take the first
   and last stop of its longest trip. Stop codes ("KJ461 ") are not names. */
function withTerminals(
  feed: NonNullable<Awaited<ReturnType<typeof getStaticFeed>>>,
  route: { routeId: string },
  view: RouteDisplay
): RouteDisplay {
  // Already says where it goes, as endpoints or as a whole service name.
  if (view.ends || view.title.includes("→")) return view;
  /* Only a placeholder title ("MRT Feeder T852") gives way to the first stop;
     a real line name ("MRT North South Line") stays, with endpoints under it. */
  const generic = view.title.endsWith(` ${view.code}`);
  const pattern = findRoutePatterns(feed, route.routeId)[0];
  const stops = pattern?.stops ?? [];
  if (stops.length < 2) return view;
  const name = (text: string) => tidyName(text.replace(/^\([^)]*\)\s*/, "").replace(/^[A-Z]{1,3}\d+\s+/, "").replace(/\s*\([^)]*\)\s*$/, "").trim());

  // A headsign that names both ends says it best ("MRT Semantan - Mont Kiara").
  const headParts = String(pattern?.headsign ?? "").split(/\s*[~\u2013\u2014]\s*|\s+-\s+/).filter(Boolean);
  const between = (from: string, to: string): RouteDisplay =>
    generic ? { ...view, title: from, ends: `\u2192 ${to}` } : { ...view, ends: `${from} \u2192 ${to}` };
  if (headParts.length >= 2) {
    return between(name(headParts[0]), name(headParts.slice(1).join(" - ")));
  }

  const first = stops[0];
  const last = stops[stops.length - 1];
  if (name(first.name) !== name(last.name)) {
    return between(name(first.name), name(last.name));
  }
  // A loop: name the stop it turns around at, the one farthest from the start.
  let far = first;
  let farthest = -1;
  for (const stop of stops) {
    const d = (stop.lat - first.lat) ** 2 + (stop.lon - first.lon) ** 2;
    if (d > farthest) {
      farthest = d;
      far = stop;
    }
  }
  return generic
    ? { ...view, title: name(first.name), ends: `Loop via ${name(far.name)}` }
    : { ...view, ends: `Loop from ${name(first.name)} via ${name(far.name)}` };
}

/* Network order on the page: the busiest first, the way people look for them. */
const ROUTES_PAGE_ORDER: FeedId[] = [
  "rapid-rail-kl", "ktmb", "rapid-bus-kl", "rapid-bus-mrtfeeder", "rapid-bus-penang",
  ...FEED_IDS.filter((id) => id.startsWith("mybas-")),
  "sg-rail", "sg-bus"
].filter((id, index, all): id is FeedId => (FEED_IDS as readonly string[]).includes(id) && all.indexOf(id) === index);

/* Sections show this many routes until "Show all": the page stays scannable on
   a phone, while every link is still in the HTML for crawlers. */
const SECTION_PREVIEW = 12;

let routesPageCache: { expiresAt: number; html: string } | null = null;

seoRouter.get("/routes", async (_req, res, next) => {
  try {
    if (routesPageCache && routesPageCache.expiresAt > Date.now()) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.type("html").send(routesPageCache.html);
      return;
    }

    const feeds = (
      await Promise.all(
        [...ROUTES_PAGE_ORDER, ...FEED_IDS.filter((id) => !ROUTES_PAGE_ORDER.includes(id))].map(async (feedId) => {
          const feed = await getStaticFeed(feedId).catch(() => null);
          return feed ? { feedId, feed } : null;
        })
      )
    ).filter((entry): entry is { feedId: FeedId; feed: NonNullable<Awaited<ReturnType<typeof getStaticFeed>>> } => Boolean(entry));

    let total = 0;
    let liveNetworks = 0;
    const byCountry: Record<"my" | "sg", string[]> = { my: [], sg: [] };
    const jump: Record<"my" | "sg", string[]> = { my: [], sg: [] };

    for (const { feedId, feed } of feeds) {
      const def = feedDefinition(feedId);
      const country = isSgFeed(feedId) ? "sg" : "my";
      const routes = listRoutes(feed)
        .map((route) => ({ route, view: withTerminals(feed, route, routeDisplay(route, def.label, routeModeOf(feedId, route) === "rail")), mode: routeModeOf(feedId, route) }))
        .sort((a, b) => a.view.code.localeCompare(b.view.code, undefined, { numeric: true }));
      if (!routes.length) continue;
      total += routes.length;
      if (def.realtimeUrl) liveNetworks++;

      const modes = new Set(routes.map((entry) => entry.mode));
      const rows = routes
        .map(({ route, view, mode }) => {
          const colour = mode === "rail" && route.color ? ` style="--bc:#${esc(route.color)};--bt:#${esc(route.textColor || "fff")}"` : "";
          // Only words the row doesn't already show; the page adds the visible text.
          const shown = new Set(`${view.code} ${view.title} ${view.ends}`.toLowerCase().split(/[^a-z0-9]+/));
          const search = [...new Set(`${route.routeId} ${route.longName ?? ""} ${route.description ?? ""} ${def.label}`.toLowerCase().split(/[^a-z0-9]+/))]
            .filter((word) => word && !shown.has(word))
            .join(" ");
          return `<a class="rt" href="/route/${feedId}/${encodeURIComponent(route.routeId)}" data-m="${mode}" data-s="${esc(search)}"><span class="bd"${colour}>${esc(view.code)}</span><span class="tx"><b>${esc(view.title)}</b>${view.ends ? `<small>${esc(view.ends)}</small>` : ""}</span></a>`;
        })
        .join("");
      const more = routes.length > SECTION_PREVIEW
        ? `<button class="more" type="button" aria-expanded="false">Show all ${routes.length} routes</button>`
        : "";
      byCountry[country].push(`<section class="net" id="${feedId}" data-m="${[...modes].join(" ")}">
<div class="net-head"><h3>${esc(def.label)}</h3><span class="cnt">${routes.length} route${routes.length === 1 ? "" : "s"}</span>${def.realtimeUrl ? `<span class="live">Live positions</span>` : `<span class="sched">Timetable</span>`}</div>
<div class="grid">${rows}</div>${more}</section>`);
      jump[country].push(`<a href="#${feedId}" data-m="${[...modes].join(" ")}">${esc(def.short || def.label)} <span>${routes.length}</span></a>`);
    }

    const countryBlock = (country: "my" | "sg", name: string) =>
      byCountry[country].length
        ? `<div class="country" data-c="${country}"><h2>${name}</h2>${byCountry[country].join("")}</div>`
        : "";

    const journeys = JOURNEY_PAIRS.map((pair) =>
      `<a href="/go/${pair.slug}" data-c="${pair.lat < 2 ? "sg" : "my"}"><span>${esc(pair.fromName)}</span><span class="arr">→</span><span>${esc(pair.toName)}</span></a>`
    ).join("");

    const schema = JSON.stringify([
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Public Transport Live",
        url: "https://public.kaynx1.com/",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://public.kaynx1.com/routes?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Public Transport Live", item: "https://public.kaynx1.com/" },
          { "@type": "ListItem", position: 2, name: "All routes", item: "https://public.kaynx1.com/routes" }
        ]
      }
    ]).replace(/</g, "\\u003c");

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All bus, LRT, MRT & KTM routes — Malaysia & Singapore | Public Transport Live</title>
<meta name="description" content="Search ${total.toLocaleString("en")} bus and train routes across Malaysia and Singapore — Rapid KL, MRT Feeder, LRT, MRT, Monorail, KTM Komuter, Rapid Penang, myBAS and Singapore buses. Stops, timetables and live positions.">
<link rel="canonical" href="https://public.kaynx1.com/routes">
<meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#080808" media="(prefers-color-scheme: dark)">
<script type="application/ld+json">${schema}</script>
${PAGE_STYLE}${ROUTES_PAGE_STYLE}${AD_HEAD}</head><body>
${topBar("routes")}
<main class="wide">
<p class="crumbs"><a href="/">Live map</a> › All routes</p>
<h1>All routes</h1>
<p class="sub">Every bus and train line we track in Malaysia and Singapore — stops, timetables and live positions.</p>
<div class="statrow"><span><b>${total.toLocaleString("en")}</b> routes</span><span><b>${feeds.length}</b> networks</span><span><b>${liveNetworks}</b> with live positions</span></div>

<div class="controls" role="search">
  <label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  <input id="q" type="search" placeholder="Search a route, number or place — e.g. 851, T117, Kajang" autocomplete="off" aria-label="Search routes"><kbd>/</kbd></label>
  <div class="segs">
    <div class="seg" role="group" aria-label="Country"><button type="button" data-c="all" class="on">All</button><button type="button" data-c="my">Malaysia</button><button type="button" data-c="sg">Singapore</button></div>
    <div class="seg" role="group" aria-label="Mode"><button type="button" data-m="all" class="on">All</button><button type="button" data-m="bus">Bus</button><button type="button" data-m="rail">Rail</button></div>
  </div>
</div>
<p id="status" class="status" aria-live="polite"></p>

<div id="results" class="grid results" hidden></div>
<div id="empty" class="empty" hidden><strong>No route matches.</strong> Looking for a place rather than a route? <a href="/">Search it on the live map</a> and plan a trip there.</div>

<div id="browse">
<nav class="jump" aria-label="Networks">${jump.my.map((chip) => chip.replace("<a ", '<a data-c="my" ')).join("")}${jump.sg.map((chip) => chip.replace("<a ", '<a data-c="sg" ')).join("")}</nav>
${countryBlock("my", "Malaysia")}
${adSpot(0)}
${countryBlock("sg", "Singapore")}
</div>
${adSpot(1)}

<h2>Popular journeys</h2>
<p class="sub">Step-by-step directions from the live journey planner.</p>
<div class="trips">${journeys}</div>

<h2>Travel guides</h2>
<p class="sub">Fares, passes, sights by train and how each network works.</p>
<div class="trips"><a href="${TRAVEL_GUIDE}/malaysia" data-c="my"><span>Malaysia</span><span class="arr">\u2192</span><span>KL, Penang, Melaka, Johor Bahru</span></a><a href="${TRAVEL_GUIDE}/singapore" data-c="sg"><span>Singapore</span><span class="arr">\u2192</span><span>MRT, buses, fares, sights</span></a></div>
${adSpot(2)}
<p class="foot"><a href="/">Public Transport Live</a> · <a href="/faq">FAQ</a> · <a href="/terms.html">Terms &amp; Privacy</a><br>${CREDITS}</p>
</main>
<script src="/search-core.js"></script>
<script>${ROUTES_PAGE_SCRIPT}</script>
${AD_FOOT}
</body></html>`;

    routesPageCache = { expiresAt: Date.now() + 60 * 60 * 1000, html };
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});

const ROUTES_PAGE_STYLE = `<style>
.controls{background:var(--bg);display:flex;flex-wrap:wrap;gap:10px;margin:8px -16px 0;padding:10px 16px;position:sticky;top:51px;z-index:10}
.search{align-items:center;background:var(--raised);border:1px solid var(--rule);border-radius:12px;color:var(--ink3);display:flex;flex:1 1 360px;gap:10px;padding:0 12px}
.search:focus-within{border-color:var(--ink3)}
.search input{background:transparent;border:0;color:var(--ink);flex:1;font:inherit;font-size:15px;min-width:0;outline:none;padding:12px 0}
.search input::-webkit-search-cancel-button{cursor:pointer}
.search kbd{border:1px solid var(--rule);border-radius:5px;color:var(--ink3);font:600 11px Inter,sans-serif;padding:1px 6px}
.search:focus-within kbd{display:none}
.segs{display:flex;flex-wrap:wrap;gap:8px}
.seg{background:var(--card);border:1px solid var(--rule);border-radius:11px;display:flex;gap:2px;padding:3px}
.seg button{background:transparent;border:0;border-radius:8px;color:var(--ink2);cursor:pointer;font:500 13px Inter,sans-serif;padding:7px 12px}
.seg button:hover{color:var(--ink)}
.seg button.on{background:var(--inv);color:var(--invink)}
.status{color:var(--ink3);font-size:12.5px;margin:10px 0 4px;min-height:1.2em}
.jump{display:flex;gap:6px;margin:6px -16px 4px;overflow-x:auto;padding:4px 16px 8px;scrollbar-width:none}
.jump::-webkit-scrollbar{display:none}
.jump a{background:var(--card);border:1px solid var(--rule);border-radius:999px;color:var(--ink2);flex:none;font-size:12.5px;font-weight:500;padding:6px 12px;text-decoration:none;white-space:nowrap}
.jump a span{color:var(--ink3);font-variant-numeric:tabular-nums;margin-left:3px}
.jump a:hover{color:var(--ink);border-color:var(--ink3)}
.country>h2{border-bottom:1px solid var(--rule);font-size:13px;color:var(--ink3);letter-spacing:.08em;margin:30px 0 4px;padding-bottom:8px;text-transform:uppercase}
.net{scroll-margin-top:130px;padding:14px 0 6px}
.net-head{align-items:baseline;display:flex;flex-wrap:wrap;gap:4px 10px;margin-bottom:8px}
.net-head h3{font-size:17px;letter-spacing:-.01em;margin:0}
.cnt{color:var(--ink3);font-size:12.5px;font-variant-numeric:tabular-nums}
.live,.sched{border:1px solid var(--rule);border-radius:999px;color:var(--ink2);font-size:11px;font-weight:600;padding:1px 8px}
.live::before{background:var(--live);border-radius:50%;content:"";display:inline-block;height:6px;margin-right:5px;vertical-align:1px;width:6px}
.grid{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.rt{align-items:center;background:var(--card);border:1px solid var(--rule);border-radius:12px;display:flex;gap:12px;min-width:0;padding:10px 12px;text-decoration:none;transition:background .12s,border-color .12s}
.rt:hover{background:var(--raised);border-color:var(--ink3)}
.bd{background:var(--bc,var(--inv));border-radius:7px;color:var(--bt,var(--invink));flex:none;font-size:13px;font-weight:700;letter-spacing:-.01em;max-width:96px;min-width:44px;overflow:hidden;padding:4px 8px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
.tx{display:flex;flex-direction:column;min-width:0}
.tx b,.tx small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tx b{font-size:14px;font-weight:600}
.tx small{color:var(--ink2);font-size:12.5px}
.tx em{color:var(--ink3);font-size:11.5px;font-style:normal}
.rt mark{background:transparent;color:inherit;font-weight:700;text-decoration:underline;text-decoration-color:var(--ink3);text-underline-offset:2px}
.net:not(.open) .grid .rt:nth-child(n+${SECTION_PREVIEW + 1}){display:none}
.more{background:transparent;border:1px solid var(--rule);border-radius:10px;color:var(--ink2);cursor:pointer;font:500 13px Inter,sans-serif;margin-top:8px;padding:8px 14px}
.more:hover{color:var(--ink);border-color:var(--ink3)}
.results{margin-top:6px}
.empty{background:var(--card);border:1px dashed var(--rule);border-radius:12px;color:var(--ink2);font-size:14px;margin-top:8px;padding:20px;text-align:center}
.empty strong{color:var(--ink);display:block;margin-bottom:4px}
.trips{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.trips a{align-items:center;background:var(--card);border:1px solid var(--rule);border-radius:12px;display:flex;font-size:13.5px;font-weight:500;gap:8px;padding:11px 14px;text-decoration:none}
.trips a:hover{background:var(--raised);border-color:var(--ink3)}
.trips .arr{color:var(--ink3)}
[hidden]{display:none!important}
@media (max-width:520px){h1{font-size:24px}.grid{grid-template-columns:1fr}.controls{top:51px}.seg button{padding:7px 10px}}
</style>`;

/* Search, filters and "show all" for /routes. Runs on the server-rendered list:
   with no query the page is browsable by network; with one, every route is
   ranked by the same matcher the app uses (search-core.js) and the best
   matches are listed flat. State lives in the URL so a search can be shared. */
const ROUTES_PAGE_SCRIPT = `
(() => {
  const q = document.getElementById("q");
  const results = document.getElementById("results");
  const browse = document.getElementById("browse");
  const empty = document.getElementById("empty");
  const status = document.getElementById("status");
  const state = { c: "all", m: "all" };
  const rows = [...document.querySelectorAll("#browse .rt")].map((el) => ({
    el,
    m: el.dataset.m,
    c: el.closest(".country").dataset.c,
    code: compactKey(el.querySelector(".bd").textContent),
    doc: makeSearchDoc(el.textContent + " " + el.dataset.s, el.querySelector(".tx").textContent),
    net: el.closest(".net").querySelector("h3").textContent
  }));
  const total = rows.length;

  function fits(row) {
    return (state.c === "all" || row.c === state.c) && (state.m === "all" || row.m === state.m);
  }

  function score(row, words, compact) {
    if (compact) {
      if (row.code === compact) return 1000;
      if (row.code.startsWith(compact)) return 800 - row.code.length;
      if (/\\d/.test(compact) && row.code.includes(compact)) return 600 - row.code.length;
    }
    return scoreDoc(words, row.doc);
  }

  function render() {
    const text = q.value.trim();
    const words = searchWords(text);

    document.querySelectorAll(".country").forEach((block) => {
      block.hidden = state.c !== "all" && block.dataset.c !== state.c;
    });
    document.querySelectorAll(".jump a").forEach((chip) => {
      chip.hidden = (state.c !== "all" && chip.dataset.c !== state.c) || (state.m !== "all" && !chip.dataset.m.includes(state.m));
    });
    document.querySelectorAll(".net").forEach((net) => {
      net.hidden = state.m !== "all" && !net.dataset.m.includes(state.m);
    });
    rows.forEach((row) => { row.el.hidden = !fits(row); });
    document.querySelectorAll(".trips a").forEach((trip) => {
      trip.hidden = state.c !== "all" && trip.dataset.c !== state.c;
    });

    if (!words.length) {
      results.hidden = true;
      empty.hidden = true;
      browse.hidden = false;
      const shown = rows.filter(fits).length;
      status.textContent = shown === total ? "" : shown + " of " + total + " routes";
      return;
    }

    const compact = compactKey(text);
    const ranked = rows
      .filter(fits)
      .map((row) => ({ row, s: score(row, words, compact) }))
      .filter((entry) => entry.s > 0)
      .sort((a, b) => b.s - a.s || a.row.code.localeCompare(b.row.code, undefined, { numeric: true }));

    browse.hidden = true;
    results.innerHTML = "";
    for (const { row } of ranked.slice(0, 120)) {
      const card = row.el.cloneNode(true);
      card.hidden = false;
      const title = card.querySelector(".tx b");
      const ends = card.querySelector(".tx small");
      title.innerHTML = highlightMatches(title.textContent, words);
      if (ends) ends.innerHTML = highlightMatches(ends.textContent, words);
      card.querySelector(".tx").insertAdjacentHTML("beforeend", "<em>" + searchEscape(row.net) + "</em>");
      results.appendChild(card);
    }
    results.hidden = ranked.length === 0;
    empty.hidden = ranked.length !== 0;
    status.textContent = ranked.length
      ? ranked.length + " route" + (ranked.length === 1 ? "" : "s") + " match" + (ranked.length > 120 ? " \\u2014 showing the best 120" : "")
      : "";
  }

  function syncUrl() {
    const params = new URLSearchParams();
    if (q.value.trim()) params.set("q", q.value.trim());
    if (state.c !== "all") params.set("c", state.c);
    if (state.m !== "all") params.set("m", state.m);
    const next = location.pathname + (params.toString() ? "?" + params : "") + location.hash;
    history.replaceState(null, "", next);
  }

  let timer = 0;
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { render(); syncUrl(); }, 80);
  });
  q.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = (results.hidden ? browse : results).querySelector(".rt:not([hidden])");
      if (first && q.value.trim()) first.click();
    } else if (event.key === "Escape") {
      q.value = "";
      render();
      syncUrl();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== q) {
      event.preventDefault();
      q.focus();
    }
  });

  document.querySelectorAll(".seg button").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.c ? "c" : "m";
      state[key] = button.dataset[key];
      button.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === button));
      render();
      syncUrl();
    });
  });

  document.querySelectorAll(".more").forEach((button) => {
    button.addEventListener("click", () => {
      const net = button.closest(".net");
      const open = net.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Show fewer" : "Show all " + net.querySelectorAll(".rt").length + " routes";
      if (!open) net.scrollIntoView({ block: "start" });
    });
  });

  // A jump link opens its network in full.
  document.querySelectorAll(".jump a").forEach((chip) => {
    chip.addEventListener("click", () => {
      const net = document.querySelector(chip.getAttribute("href"));
      if (!net) return;
      if (q.value) { q.value = ""; render(); syncUrl(); }
      const more = net.querySelector(".more");
      if (more && !net.classList.contains("open")) more.click();
    });
  });

  const params = new URLSearchParams(location.search);
  if (params.get("q")) q.value = params.get("q");
  for (const key of ["c", "m"]) {
    const value = params.get(key);
    const button = value && document.querySelector('.seg button[data-' + key + '="' + CSS.escape(value) + '"]');
    if (button) button.click();
  }
  render();
})();
`;

/* A drawn map of the route: its shape, its stops, the ends and the main
   interchanges labelled. No tiles to load, crisp at any size, and the labels
   are HTML laid over the SVG so they stay readable on a phone. */
const MAP_W = 600;
const MAP_H = 380;

type MapStop = { name: string; lat: number; lon: number; interchange?: string; weight?: number };

function routeMapHtml(
  shapes: { lat: number; lon: number }[][],
  stops: MapStop[],
  colour: string
): string {
  const lines = shapes.filter((line) => line.length > 1);
  const geometry = lines.length ? lines : [stops];
  const points = [...geometry.flat(), ...stops];
  if (points.length < 2) return "";

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-4);
  const spanY = Math.max(maxLat - minLat, 1e-4);
  const pad = 46;
  const scale = Math.min((MAP_W - pad * 2) / spanX, (MAP_H - pad * 2) / spanY);
  const offX = (MAP_W - spanX * scale) / 2;
  const offY = (MAP_H - spanY * scale) / 2;
  const project = (p: { lat: number; lon: number }) => ({
    x: offX + (p.lon - minLon) * kx * scale,
    y: offY + (maxLat - p.lat) * scale
  });

  const paths = geometry
    .map((line) => {
      let last: { x: number; y: number } | null = null;
      const parts: string[] = [];
      for (const point of line) {
        const at = project(point);
        // Thin the line: a point every couple of pixels is plenty.
        if (last && Math.hypot(at.x - last.x, at.y - last.y) < 1.5) continue;
        parts.push(`${parts.length ? "L" : "M"}${at.x.toFixed(1)} ${at.y.toFixed(1)}`);
        last = at;
      }
      return `<path d="${parts.join("")}"/>`;
    })
    .join("");

  const placed: { x: number; y: number }[] = [];
  const labels: string[] = [];
  const label = (stop: MapStop, at: { x: number; y: number }, kind: string) => {
    if (placed.some((p) => Math.abs(p.x - at.x) < 120 && Math.abs(p.y - at.y) < 26)) return;
    placed.push(at);
    // Rough width in map units (~8.5 per character at 12px); open the label
    // towards whichever side of the dot has room for it.
    const width = (stop.name.length + (stop.interchange?.length ?? 0) * 0.8) * 8.5 + 30;
    const roomRight = MAP_W - at.x;
    const side = roomRight < width && at.x > roomRight ? " l" : "";
    labels.push(`<span class="lbl ${kind}${side}" style="left:${((at.x / MAP_W) * 100).toFixed(2)}%;top:${((at.y / MAP_H) * 100).toFixed(2)}%">${esc(stop.name)}${stop.interchange ? `<i>${esc(stop.interchange)}</i>` : ""}</span>`);
  };

  const dots = stops
    .map((stop, i) => {
      const at = project(stop);
      const end = i === 0 || i === stops.length - 1;
      const cls = end ? "end" : stop.interchange ? "x" : "";
      return `<circle class="${cls}" cx="${at.x.toFixed(1)}" cy="${at.y.toFixed(1)}" r="${end ? 6 : stop.interchange ? 5 : 3}"/>`;
    })
    .join("");

  // Ends first, then interchanges, as long as they don't collide.
  label(stops[0], project(stops[0]), "end");
  label(stops[stops.length - 1], project(stops[stops.length - 1]), "end");
  // Busiest interchanges get the space first.
  const ranked = stops.slice(1, -1).filter((s) => s.interchange).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  for (const stop of ranked.slice(0, 8)) {
    label(stop, project(stop), "minor");
  }

  return `<figure class="rmap" style="--lc:${colour}" aria-label="Map of the route">
<svg viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-hidden="true"><g class="ln">${paths}</g><g class="st">${dots}</g></svg>
${labels.join("")}
</figure>`;
}

/* Parts of the day a passenger plans around, in minutes after midnight. A
   train every 90 seconds is "every 1–2 min in the morning peak", not forty
   numbers in an hour row; that table stays, folded, for whoever wants it. */
const DAY_PARTS: { name: string; from: number; to: number }[] = [
  { name: "Early morning", from: 0, to: 420 },
  { name: "Morning peak", from: 420, to: 570 },
  { name: "Daytime", from: 570, to: 990 },
  { name: "Evening peak", from: 990, to: 1170 },
  { name: "Night", from: 1170, to: 3000 }
];

type Frequency = { name: string; span: string; text: string; detail?: string };

/** "Every 2–3 min", or the actual times when a service is rare. */
function frequencyBands(times: number[]): Frequency[] {
  const bands: Frequency[] = [];
  for (const part of DAY_PARTS) {
    const inPart = times.filter((t) => t >= part.from && t < part.to);
    if (!inPart.length) continue;
    const span = `${formatGtfsMinutes(inPart[0])}\u2013${formatGtfsMinutes(inPart[inPart.length - 1])}`;
    // The average gap, not the median: a bus alternating 15 and 45 min is a
    // 30-minute service, however the middle gap happens to fall.
    const typical = inPart.length > 1 ? (inPart[inPart.length - 1] - inPart[0]) / (inPart.length - 1) : Infinity;
    // Every 20 min or rarer, "every 15–45 min" helps nobody: list the times.
    if (inPart.length <= 2 || typical >= 20) {
      const list = inPart.slice(0, 12).map(formatGtfsMinutes).join(" \u00b7 ");
      bands.push({
        name: part.name,
        span,
        text: `${inPart.length} departure${inPart.length === 1 ? "" : "s"}`,
        detail: inPart.length > 12 ? `${list} +${inPart.length - 12} more` : list
      });
      continue;
    }
    /* From the average too: percentiles turned bunched buses and short
       turns into "every 1–12 min", which reads as chaos. */
    if (typical >= 10) {
      bands.push({ name: part.name, span, text: `About every ${Math.round(typical)} min` });
      continue;
    }
    const lo = Math.max(1, Math.floor(typical));
    const hi = Math.max(lo, Math.ceil(typical));
    bands.push({ name: part.name, span, text: lo === hi ? `Every ${lo} min` : `Every ${lo}\u2013${hi} min` });
  }
  return bands;
}

function hhmmToMinutes(value?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

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

    const def = feedDefinition(feedId);
    const label = def.label;
    const isRail = routeModeOf(feedId, route) === "rail";
    const view = withTerminals(feed, route, routeDisplay(route, label, isRail));
    const code = view.code;
    const mode = isRail ? "train" : "bus";
    const patterns = findRoutePatterns(feed, route.routeId).filter((pattern) => pattern.stops.length);
    // Rail keeps its line colour; buses are drawn in ink, like the app.
    const lineColor = isRail && route.color ? `#${route.color}` : "";
    const badgeStyle = lineColor ? ` style="--bc:${lineColor};--bt:#${esc(route.textColor || "fff")}"` : "";

    /* Departures at each direction's first stop, from the same schedule
       expansion the app uses (today's service). */
    const clock = malaysiaClock();
    const schedule = buildRouteStopSchedule(feed, route.routeId, clock);
    const stopName = (name: string) => tidyName(name);

    /* What you can change to at each stop. The planner's network for this
       country (shared with journey planning, so usually already built); a
       feed outside it gets a small network of its own. */
    const networkFeeds: FeedId[] = (DEFAULT_JOURNEY_FEEDS as FeedId[]).includes(feedId) ? DEFAULT_JOURNEY_FEEDS : [feedId];
    const allKeys = [...new Set(patterns.flatMap((pattern) => pattern.stops.map((stop) => `${feedId}:${stop.stopId}`)))];
    let connections = new Map<string, StopConnection[]>();
    try {
      connections = await stopConnections(networkFeeds, allKeys, { feed: feedId, routeId: route.routeId });
    } catch (error) {
      console.warn("route page connections unavailable:", error instanceof Error ? error.message : error);
    }
    // Badge text and colour for every route that turns up as a connection.
    const badgeOf = new Map<string, { code: string; colour: string; text: string }>();
    for (const list of connections.values()) {
      for (const conn of list) {
        const id = `${conn.feed}:${conn.routeId}`;
        if (badgeOf.has(id)) continue;
        const other = (await getStaticFeed(conn.feed).catch(() => null))?.routes.get(conn.routeId);
        if (!other) continue;
        const otherRail = routeModeOf(conn.feed, other) === "rail";
        badgeOf.set(id, {
          code: routeDisplay(other, feedDefinition(conn.feed).label, otherRail).code,
          colour: otherRail && other.color ? `#${other.color}` : "",
          text: other.textColor ? `#${other.textColor}` : "#fff"
        });
      }
    }
    /* Rail interchanges by name; buses only as a count, or a long route's
       stop list would drown in bus numbers. */
    const railHere = (stopId: string) =>
      (connections.get(`${feedId}:${stopId}`) ?? []).filter((conn) => conn.mode === "rail" && badgeOf.has(`${conn.feed}:${conn.routeId}`));
    const busesHere = (stopId: string) => (connections.get(`${feedId}:${stopId}`) ?? []).filter((conn) => conn.mode === "bus").length;
    const connectionBadges = (stopId: string) => {
      const rail = railHere(stopId)
        .map((conn) => {
          const badge = badgeOf.get(`${conn.feed}:${conn.routeId}`)!;
          const style = badge.colour ? ` style="--bc:${badge.colour};--bt:${badge.text}"` : "";
          const walk = conn.walkMeters > 60 ? ` title="${conn.walkMeters} m walk"` : "";
          return `<a class="xb"${style}${walk} href="/route/${conn.feed}/${encodeURIComponent(conn.routeId)}">${esc(badge.code)}</a>`;
        })
        .join("");
      const buses = busesHere(stopId);
      const bus = buses ? `<span class="xbus">${buses} bus${buses === 1 ? "" : "es"}</span>` : "";
      return rail || bus ? `<span class="cx">${rail}${bus}</span>` : "";
    };

    const directions = patterns.map((pattern, index) => {
      const stops = pattern.stops;
      const origin = stops[0];
      /* Rapid Rail writes headsigns as "From Gombak to Putra Heights"; after
         "Towards" only the part past "to" belongs (as in journey.ts). */
      /* A headsign that only repeats the route ("R10") says nothing about the
         direction; the last stop does. */
      const sign = pattern.headsign?.replace(/^\s*from\s+.+?\s+to\s+/i, "").trim() ?? "";
      const repeatsRoute = [code, route.shortName, route.longName, route.routeId]
        .some((name) => name && name.trim().toLowerCase() === sign.toLowerCase());
      const towards = tidyName(sign && !repeatsRoute ? sign : stops[stops.length - 1].name);
      const times = [...new Set((schedule.get(origin.stopId) ?? []).map((entry) => entry.minutes))].sort((a, b) => a - b);

      // Minutes from the first stop, from the representative trip's times.
      const start = hhmmToMinutes(origin.scheduledDeparture ?? origin.scheduledArrival);
      const offsets = stops.map((stop) => {
        const at = hhmmToMinutes(stop.scheduledArrival ?? stop.scheduledDeparture);
        return start !== null && at !== null ? (at - start + 1440) % 1440 : null;
      });
      const endToEnd = offsets[offsets.length - 1];

      const stats = [
        times.length ? `<div class="stat"><span>First</span><b>${formatGtfsMinutes(times[0])}</b></div>` : "",
        times.length ? `<div class="stat"><span>Last</span><b>${formatGtfsMinutes(times[times.length - 1])}</b></div>` : "",
        endToEnd ? `<div class="stat"><span>End to end</span><b>~${endToEnd} min</b></div>` : "",
        `<div class="stat"><span>Stops</span><b>${stops.length}</b></div>`
      ].join("");

      const bands = frequencyBands(times);
      const bandRows = bands
        .map((band) => `<tr><th scope="row"><span class="pn">${band.name}</span><small>${band.span}</small></th><td><b>${band.text}</b>${band.detail ? `<small>${band.detail}</small>` : ""}</td></tr>`)
        .join("");

      const byHour = new Map<number, number[]>();
      for (const minutes of times) {
        const hour = Math.floor(minutes / 60);
        const bucket = byHour.get(hour);
        if (bucket) bucket.push(minutes % 60);
        else byHour.set(hour, [minutes % 60]);
      }
      const hourRows = [...byHour.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([hour, mins]) => `<div class="hr" data-h="${hour}"><span class="h">${String(hour % 24).padStart(2, "0")}</span><span class="m">${mins.map((m) => `<i>${String(m).padStart(2, "0")}</i>`).join("")}</span></div>`)
        .join("");

      const stopRows = stops
        .map((stop, i) => `<li><span class="sc"><span class="sn">${esc(stopName(stop.name))}${stop.accessible === true ? ` <span class="oku" title="Step-free access (OKU)">\u267F</span>` : ""}</span>${connectionBadges(stop.stopId)}</span>${offsets[i] !== null && i > 0 ? `<span class="so">+${offsets[i]} min</span>` : ""}</li>`)
        .join("");

      return {
        tab: `Towards ${esc(towards)}`,
        html: `<section class="dir" data-d="${index}" aria-label="Towards ${esc(towards)}">
<div class="dir-main">
  <h2 class="dir-title">Towards ${esc(towards)}</h2>
  ${times.length ? `<div class="next" data-times="${times.join(",")}">
    <div class="next-label">Next ${mode} from <b>${esc(stopName(origin.name))}</b></div>
    <div class="next-big" aria-live="polite">${formatGtfsMinutes(times[0])} <small>first today</small></div>
    <div class="next-more"></div>
  </div>` : `<div class="next"><div class="next-label">No scheduled departures today.</div></div>`}
  <div class="stats">${stats}</div>
  ${bands.length ? `<h3>How often</h3><table class="freq">${bandRows}</table>` : ""}
  ${times.length ? `<details class="full"><summary>Full timetable from ${esc(stopName(origin.name))} <span>${times.length} departures</span></summary>
    <div class="hours">${hourRows}</div></details>` : ""}
</div>
<aside class="dir-stops">
  <h3>${stops.length} stops</h3>
  <ol class="line"${lineColor ? ` style="--lc:${lineColor}"` : ""}>${stopRows}</ol>
</aside>
</section>`
      };
    });

    // One map for the route: the first direction's shape and stops.
    const mapPattern = patterns[0];
    /* Lines that run alongside most of this one (AGL and SPL share eleven
       stations) are not interchanges worth a map label at every stop. */
    const parallel = new Set<string>();
    if (mapPattern) {
      const seen = new Map<string, number>();
      for (const stop of mapPattern.stops) {
        for (const conn of railHere(stop.stopId)) {
          const id = `${conn.feed}:${conn.routeId}`;
          seen.set(id, (seen.get(id) ?? 0) + 1);
        }
      }
      for (const [id, count] of seen) {
        if (count >= 3 && count >= mapPattern.stops.length * 0.5) parallel.add(id);
      }
    }
    const changesAt = (stopId: string) => railHere(stopId).filter((conn) => !parallel.has(`${conn.feed}:${conn.routeId}`));
    const mapHtml = mapPattern
      ? routeMapHtml(
          mapPattern.shapes.map((line) => line.map((point) => ({ lat: point.lat, lon: point.lon }))),
          mapPattern.stops.map((stop) => {
            const rail = changesAt(stop.stopId).map((conn) => badgeOf.get(`${conn.feed}:${conn.routeId}`)!.code);
            return {
              // Map labels are short: no operator stop codes ("KJ461 ", "(M) ").
              name: stopName(stop.name.replace(/^\([^)]*\)\s*/, "").replace(/^[A-Z]{1,3}\d+\s+/, "")),
              lat: stop.lat,
              lon: stop.lon,
              interchange: rail.length ? rail.slice(0, 3).join(" \u00b7 ") : undefined,
              weight: rail.length
            };
          }),
          lineColor || "var(--ink)"
        )
      : "";
    const interchangeCount = mapPattern ? mapPattern.stops.filter((stop) => changesAt(stop.stopId).length).length : 0;

    const guides = guidesFor(feedId);
    const guideBlock = guides.length
      ? `<section class="guides"><h2>Travel guides</h2><div class="glist">${guides
          .map((slug) => `<a href="${TRAVEL_GUIDE}/${slug}"><b>${esc(GUIDE_TITLES[slug] ?? slug)}</b><span>Read the guide \u2192</span></a>`)
          .join("")}</div></section>`
      : "";

    const tabs = directions.length > 1
      ? `<div class="dtabs" role="tablist">${directions.map((d, i) => `<button type="button" role="tab" data-d="${i}" aria-selected="${i === 0}">${d.tab}</button>`).join("")}</div>`
      : "";

    const title = `${code} ${mode} route — stops, timetable & live tracker | ${label}`;
    const appLink = `/?area=${encodeURIComponent(feedId)}&route=${encodeURIComponent(route.routeId)}`;
    const stopCount = patterns[0]?.stops.length ?? 0;
    const firstBands = patterns[0] ? frequencyBands([...new Set((schedule.get(patterns[0].stops[0].stopId) ?? []).map((e) => e.minutes))].sort((a, b) => a - b)) : [];
    const summary = firstBands.find((band) => band.name === "Daytime")?.text ?? firstBands[0]?.text;

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(`${label} ${mode} ${code}${view.title ? ` — ${view.title}${view.ends ? ` ${view.ends}` : ""}` : ""}: ${stopCount} stops${summary ? `, ${summary.toLowerCase()} during the day` : ""}, first and last ${mode}, full timetable and live tracking. Free.`)}">
<link rel="canonical" href="https://public.kaynx1.com/route/${feedId}/${encodeURIComponent(route.routeId)}">
<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "All routes", item: "https://public.kaynx1.com/routes" },
        { "@type": "ListItem", position: 2, name: label, item: `https://public.kaynx1.com/routes#${feedId}` },
        { "@type": "ListItem", position: 3, name: code }
      ]
    }).replace(/</g, "\\u003c")}</script>${PAGE_STYLE}${ROUTE_PAGE_STYLE}${AD_HEAD}</head><body>${topBar()}<main class="wide route-page">
<p class="crumbs"><a href="/routes">All routes</a> \u203a <a href="/routes#${feedId}">${esc(label)}</a> \u203a ${esc(code)}</p>
<div class="rtop${mapHtml ? "" : " nomap"}">
<header class="rhead">
  <h1><span class="badge"${badgeStyle}>${esc(code)}</span>${esc(view.ends.startsWith("\u2192") ? `${view.title} ${view.ends}` : view.title)}</h1>
  ${view.ends && !view.ends.startsWith("\u2192") ? `<p class="rends">${esc(view.ends)}</p>` : ""}
  <p class="sub">${esc(label)} \u00b7 ${def.realtimeUrl ? `<span class="live">Live positions</span>` : "Timetable only \u2014 this operator publishes no live positions"}</p>
  <a class="cta" href="${esc(appLink)}">${def.realtimeUrl ? `Track ${esc(code)} live on the map` : `Open ${esc(code)} on the map`}</a>
  ${interchangeCount ? `<p class="xsum">${isRail
    ? `${interchangeCount} interchange${interchangeCount === 1 ? "" : "s"} with other lines`
    : `Connects with trains at ${interchangeCount} stop${interchangeCount === 1 ? "" : "s"}`} \u2014 marked in the stop list</p>` : ""}
</header>
${mapHtml}
</div>
${adSpot(0)}
${tabs}
${directions.map((d) => d.html).join("") || "<p>Stop list unavailable right now.</p>"}
${adSpot(1)}
${guideBlock}
${adSpot(2)}
<p class="note">Times are today\u2019s published schedule from the operator\u2019s official feed. Trains and buses can run early or late${def.realtimeUrl ? " \u2014 the live map shows where they actually are" : ""}.</p>
<p class="foot"><a href="/routes">All routes</a> · <a href="/">Public Transport Live</a> · <a href="/terms.html">Terms</a><br>${CREDITS}</p>
</main>
<script>${ROUTE_PAGE_SCRIPT}</script>
${AD_FOOT}
</body></html>`);
  } catch (error) {
    next(error);
  }
});

const ROUTE_PAGE_STYLE = `<style>
.route-page{max-width:1120px}
.rhead h1{font-size:30px}
.rends{color:var(--ink);font-size:16px;font-weight:500;margin:0 0 6px}
.rhead .sub{margin-bottom:6px}
.live{border:1px solid var(--rule);border-radius:999px;color:var(--ink2);font-size:12px;font-weight:600;padding:1px 9px}
.live::before{background:var(--live);border-radius:50%;content:"";display:inline-block;height:6px;margin-right:6px;vertical-align:1px;width:6px}
.dtabs{background:var(--card);border:1px solid var(--rule);border-radius:12px;display:inline-flex;flex-wrap:wrap;gap:3px;margin:4px 0 6px;padding:3px}
.dtabs button{background:transparent;border:0;border-radius:9px;color:var(--ink2);cursor:pointer;font:500 14px Inter,sans-serif;padding:9px 14px}
.dtabs button[aria-selected="true"]{background:var(--inv);color:var(--invink)}
.tabbed .dir:not(.on){display:none}
.tabbed .dir-title{display:none}
.dir{display:grid;gap:20px 36px;grid-template-columns:minmax(0,1fr) 340px;align-items:start;padding:14px 0 10px}
.dir+.dir{border-top:1px solid var(--rule)}
.tabbed .dir+.dir{border-top:0}
.dir-title{font-size:18px;margin:0 0 12px}
.next{background:var(--raised);border:1px solid var(--rule);border-radius:16px;padding:18px 20px}
.next-label{color:var(--ink2);font-size:13.5px}
.next-label b{color:var(--ink);font-weight:600}
.next-big{font-size:38px;font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:-.03em;line-height:1.15;margin:4px 0 2px}
.next-big small{color:var(--ink2);font-size:15px;font-weight:500;letter-spacing:0;margin-left:6px}
.next-more{color:var(--ink2);display:flex;flex-wrap:wrap;font-size:14px;font-variant-numeric:tabular-nums;gap:6px 14px}
.next-more span b{color:var(--ink);font-weight:600}
.stats{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin:12px 0 4px}
.stat{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:10px 14px}
.stat span{color:var(--ink3);display:block;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.stat b{font-size:18px;font-variant-numeric:tabular-nums;font-weight:650}
.dir h3{font-size:15px;margin:22px 0 8px}
.freq{background:var(--card);border:1px solid var(--rule);border-collapse:separate;border-radius:12px;border-spacing:0;overflow:hidden;width:100%}
.freq th,.freq td{border-top:1px solid var(--rule);padding:11px 16px;text-align:left;vertical-align:top}
.freq tr:first-child th,.freq tr:first-child td{border-top:0}
.freq th{font-size:14px;font-weight:600;width:42%}
.freq td b{font-size:14.5px;font-weight:600}
.freq small{color:var(--ink3);display:block;font-size:12px;font-variant-numeric:tabular-nums;font-weight:500;margin-top:1px}
.freq tr.now th,.freq tr.now td{background:var(--hover)}
.freq tr.now .pn::after{background:var(--inv);border-radius:999px;color:var(--invink);content:"Now";font-size:10px;font-weight:700;margin-left:8px;padding:1px 7px;vertical-align:1px}
.full{background:var(--card);border:1px solid var(--rule);border-radius:12px;margin-top:14px}
.full summary{cursor:pointer;font-size:14px;font-weight:600;list-style:none;padding:13px 16px}
.full summary::-webkit-details-marker{display:none}
.full summary::before{content:"\\25B8";display:inline-block;margin-right:8px;transition:transform .15s}
.full[open] summary::before{transform:rotate(90deg)}
.full summary span{color:var(--ink3);font-weight:500;margin-left:6px}
.hours{border-top:1px solid var(--rule);padding:6px 10px 12px}
.hr{align-items:baseline;border-radius:8px;display:grid;gap:10px;grid-template-columns:34px 1fr;padding:6px 6px}
.hr.now{background:var(--hover)}
.hr .h{color:var(--ink2);font-size:13px;font-variant-numeric:tabular-nums;font-weight:700}
.hr .m{display:flex;flex-wrap:wrap;gap:2px 0}
.hr i{color:var(--ink);font-size:13px;font-style:normal;font-variant-numeric:tabular-nums;width:2.6em}
.hr i.past{color:var(--ink3)}
.dir-stops{background:var(--card);border:1px solid var(--rule);border-radius:16px;max-height:calc(100vh - 90px);overflow:auto;padding:14px 16px;position:sticky;top:70px}
.dir-stops h3{font-size:13px;color:var(--ink3);letter-spacing:.06em;margin:0 0 8px;text-transform:uppercase}
.line{list-style:none;margin:0;padding:0}
.line li{align-items:baseline;display:flex;gap:10px;justify-content:space-between;padding:6px 0 6px 26px;position:relative}
.line li::before{background:var(--bg);border:3px solid var(--lc,var(--ink));border-radius:50%;content:"";height:8px;left:3px;position:absolute;top:11px;width:8px}
.line li:not(:last-child)::after{background:var(--lc,var(--ink));content:"";height:calc(100% - 6px);left:8px;opacity:.3;position:absolute;top:24px;width:3px}
.line li:first-child::before,.line li:last-child::before{background:var(--lc,var(--ink))}
.line li:first-child .sn,.line li:last-child .sn{font-weight:600}
.sn{font-size:14px;min-width:0}
.so{color:var(--ink3);flex:none;font-size:12px;font-variant-numeric:tabular-nums}
.note{color:var(--ink3);font-size:12.5px;margin-top:24px}
.rtop{align-items:center;display:grid;gap:12px 36px;grid-template-columns:minmax(0,1fr) minmax(0,480px)}
.rtop.nomap{grid-template-columns:1fr}
.xsum{color:var(--ink2);font-size:13px;margin:-10px 0 18px}
.rmap{aspect-ratio:${MAP_W}/${MAP_H};background:var(--card);border:1px solid var(--rule);border-radius:18px;margin:0;overflow:hidden;position:relative}
.rmap svg{display:block;height:100%;width:100%}
.rmap .ln path{fill:none;stroke:var(--lc);stroke-linecap:round;stroke-linejoin:round;stroke-width:5}
.rmap .st circle{fill:var(--bg);stroke:var(--lc);stroke-width:2}
.rmap .st circle.x{fill:var(--bg);stroke:var(--ink);stroke-width:2.5}
.rmap .st circle.end{fill:var(--lc);stroke:var(--bg);stroke-width:2.5}
.lbl{background:color-mix(in srgb,var(--raised) 88%,transparent);border-radius:6px;color:var(--ink);font-size:12px;font-weight:600;line-height:1.25;max-width:46%;overflow:hidden;padding:2px 6px;position:absolute;text-overflow:ellipsis;transform:translate(10px,-50%);white-space:nowrap}
.lbl.l{transform:translate(calc(-100% - 10px),-50%)}
.lbl.minor{color:var(--ink2);font-weight:500}
.lbl i{color:var(--ink3);font-size:10.5px;font-style:normal;font-weight:600;margin-left:5px}
.sc{display:flex;flex-direction:column;gap:3px;min-width:0}
.cx{display:flex;flex-wrap:wrap;gap:4px}
.xb{background:var(--bc,var(--inv));border-radius:5px;color:var(--bt,var(--invink));font-size:10.5px;font-weight:700;line-height:1;padding:3px 6px;text-decoration:none}
.xb:hover{filter:brightness(1.1)}
.xbus{border:1px solid var(--rule);border-radius:5px;color:var(--ink3);font-size:10.5px;font-weight:600;line-height:1;padding:2px 6px}
.oku{color:var(--ink3);font-size:12px}
.guides h2{font-size:17px;margin:34px 0 10px}
.glist{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.glist a{background:var(--card);border:1px solid var(--rule);border-radius:12px;display:flex;flex-direction:column;padding:13px 15px;text-decoration:none}
.glist a:hover{background:var(--raised);border-color:var(--ink3)}
.glist b{font-size:14.5px;font-weight:600}
.glist span{color:var(--ink3);font-size:12.5px}
@media (max-width:900px){
  .rtop{grid-template-columns:1fr}
  .rmap{margin-bottom:8px}
  .dir{grid-template-columns:1fr}
  .dir-stops{max-height:none;position:static}
  .rhead h1{font-size:25px}
  .next-big{font-size:32px}
  .freq th{width:46%}
}
@media (max-width:520px){.lbl.minor{display:none}.lbl{font-size:11px}.dtabs{display:flex}.dtabs button{flex:1 1 auto}.freq th,.freq td{padding:10px 12px}}
</style>`;

/* Live parts of a route page: the countdown to the next departure, the part
   of the day and the hour we are in. Runs in the browser so a cached page is
   never stale; all times are Malaysia/Singapore time (both UTC+8). */
const ROUTE_PAGE_SCRIPT = `
(() => {
  const tabs = [...document.querySelectorAll(".dtabs button")];
  const dirs = [...document.querySelectorAll(".dir")];
  if (tabs.length) {
    document.body.classList.add("tabbed");
    const show = (i) => {
      tabs.forEach((t, j) => t.setAttribute("aria-selected", String(i === j)));
      dirs.forEach((d, j) => d.classList.toggle("on", i === j));
    };
    tabs.forEach((t, i) => t.addEventListener("click", () => show(i)));
    show(0);
  }

  const parts = [[0, 420], [420, 570], [570, 990], [990, 1170], [1170, 3000]];
  const wait = (m) => (m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : ""));
  const fmt = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

  function nowMinutes() {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    return Number(p.find((x) => x.type === "hour").value) * 60 + Number(p.find((x) => x.type === "minute").value);
  }

  function tick() {
    const now = nowMinutes();
    document.querySelectorAll(".next[data-times]").forEach((box) => {
      const times = box.dataset.times.split(",").map(Number);
      // Departures after midnight are stored as 24:xx+, so 00:20 also matches 24:20.
      const upcoming = [...new Set(times.flatMap((t) => [t, t - 1440]))].filter((t) => t >= now && t < now + 1440).sort((a, b) => a - b);
      const big = box.querySelector(".next-big");
      const more = box.querySelector(".next-more");
      if (!upcoming.length) {
        big.innerHTML = "Finished <small>for today</small>";
        more.innerHTML = "<span>First tomorrow is usually <b>" + fmt(times[0]) + "</b></span>";
        return;
      }
      const first = upcoming[0] - now;
      big.innerHTML = (first <= 0 ? "Now" : first < 60 ? first + " min" : fmt(upcoming[0])) + " <small>" + (first < 60 ? "at " + fmt(upcoming[0]) : "next departure, in " + wait(first)) + "</small>";
      more.innerHTML = upcoming.slice(1, 6).map((t) => "<span><b>" + fmt(t) + "</b> \\u00b7 " + wait(t - now) + "</span>").join("");
    });

    const part = parts.findIndex(([a, b]) => now >= a && now < b);
    document.querySelectorAll(".freq").forEach((table) => {
      table.querySelectorAll("tr").forEach((row) => {
        const name = row.querySelector(".pn").textContent;
        const index = ["Early morning", "Morning peak", "Daytime", "Evening peak", "Night"].indexOf(name);
        row.classList.toggle("now", index === part);
      });
    });

    const hour = Math.floor(now / 60);
    document.querySelectorAll(".hr").forEach((row) => {
      // data-h runs past 23 for after-midnight trips: those are tonight, not past.
      const h = Number(row.dataset.h);
      row.classList.toggle("now", h === hour);
      row.querySelectorAll("i").forEach((m) => {
        m.classList.toggle("past", h < hour || (h === hour && Number(m.textContent) < now % 60));
      });
    });
  }

  tick();
  setInterval(tick, 30000);
})();
`;

/* FAQ: crisp factual answers with FAQPage schema — the shape both search
   engines and AI assistants quote directly when recommending tools. */
const FAQS: [string, string][] = [
  ["How can I track Rapid KL buses in real time?",
   "Public Transport Live (public.kaynx1.com) shows the actual GPS position of every Rapid KL bus, MRT feeder bus and Rapid Penang bus on a live map, refreshed every 30 seconds from Prasarana's official open-data feed. Open the app, pick a route, and watch the bus move."],
  ["Is there a free app for KL public transport without ads?",
   "Yes — the Public Transport Live map and Android app are completely free, with no advertising, no account and no tracking. (The route timetable pages on the website carry Google ads, which help keep the service free.) It runs on Malaysian and Singaporean government open data, so there is nothing to pay for and nothing being sold."],
  ["Does it cover Singapore buses and MRT?",
   "Yes. Every Singapore public bus shows live arrival times including how crowded the bus is (seats available, standing, or crowded), and MRT lines show real-time platform crowding from LTA. A journey planner works across both buses and trains."],
  ["Can I plan a journey with transfers?",
   "Yes — enter any origin and destination and the planner chains buses and trains with walking transfers, shows total duration, and can plan for a departure time later in the day. It covers both Kuala Lumpur and Singapore."],
  ["Are the arrival times accurate?",
   "Bus positions in Malaysia and bus arrivals in Singapore are live from the operators' own feeds. Where no live data exists (KL LRT/MRT trains publish no positions), the app shows scheduled times and clearly labels them as schedule, never disguising estimates as live data."],
  ["Does it work offline or as an app?",
   "It installs to the home screen as a web app on Android and iPhone, and previously viewed routes and timetables keep working offline. Live positions require a connection."],
  ["Does it show train service disruptions?",
   "Yes — disruption alerts for Klang Valley rail lines (LRT, MRT, Monorail, KTM Komuter) and Singapore MRT appear as a banner and are marked on the affected line itself."]
];

seoRouter.get("/faq", (_req, res) => {
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a }
    }))
  });
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FAQ — Public Transport Live (KL & Singapore transit tracker)</title>
<meta name="description" content="How to track Rapid KL buses live, plan journeys across KL and Singapore, check MRT crowding, and use the free Public Transport Live app.">
<link rel="canonical" href="https://public.kaynx1.com/faq">
<script type="application/ld+json">${schema}</script>${PAGE_STYLE}</head><body>${topBar("faq")}<main>
<h1>Frequently asked questions</h1>
<p class="sub">Public Transport Live — free live tracker for Malaysia &amp; Singapore public transport</p>
${FAQS.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join("")}
<a class="cta" href="/">Open the live tracker</a>
<p class="foot"><a href="/routes">All routes</a> · <a href="/terms.html">Terms &amp; Privacy</a><br>${CREDITS}</p>
</main></body></html>`);
});

/* The sitemap grows with the network instead of being a hand-kept file. */
seoRouter.get("/sitemap.xml", async (_req, res, next) => {
  try {
    const urls: string[] = [
      "https://public.kaynx1.com/",
      "https://public.kaynx1.com/routes",
      "https://public.kaynx1.com/terms.html",
      "https://public.kaynx1.com/faq",
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
  const colour = leg.mode === "rail" && leg.routeColor ? `--bc:#${esc(leg.routeColor)};--bt:#fff;` : "";
  const badge = `<span class="badge" style="${colour}font-size:12px;margin:0;padding:2px 8px;vertical-align:1px">${esc(leg.routeName)}</span>`;
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
<link rel="canonical" href="https://public.kaynx1.com/go/${pair.slug}">${PAGE_STYLE}</head><body>${topBar()}<main>
<p class="crumbs"><a href="/routes">All routes</a> \u203a Journeys</p>
<h1>${esc(pair.fromName)} → ${esc(pair.toName)}</h1>
${body}
<h2>More journeys</h2>
<ol>${JOURNEY_PAIRS.filter((p) => p.slug !== pair.slug).slice(0, 6).map((p) => `<li><a href="/go/${p.slug}">${esc(p.fromName)} → ${esc(p.toName)}</a></li>`).join("")}</ol>
<p class="foot"><a href="/routes">All routes</a> · <a href="/">Public Transport Live</a> · times are estimates — <a href="/terms.html">Terms</a><br>${CREDITS}</p>
</main></body></html>`;

    goCache.set(pair.slug, { expiresAt: Date.now() + 10 * 60 * 1000, html });
    res.setHeader("Cache-Control", "public, max-age=600");
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});
