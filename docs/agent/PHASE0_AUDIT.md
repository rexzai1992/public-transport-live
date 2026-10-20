# Phase 0 audit — where provider assumptions live

Checked 2026-10-20 against `main` at `8ebf7cb` plus the uncommitted provider
foundation (`src/providers/`, `tests/`). Line numbers drift; function names are
the stable reference. Everything below was read from the code, not inferred.

## 1. Caches, TTLs and timeouts (all in-process `Map`s, no Redis/DB)

| Cache | File · symbol | TTL / behaviour |
| --- | --- | --- |
| Static GTFS feed | `src/gtfsStatic.ts` `staticCache`, `inflight`, `lastFailure` | `STATIC_GTFS_TTL_MS` 24 h, stale-while-revalidate; failures cooled 5 min; empty upstream feed rejected; last good zip on disk in `data/gtfs-cache/`, retried hourly (`LAST_GOOD_RETRY_MS`) |
| GTFS-Realtime vehicles | `src/gtfsRealtime.ts` `realtimeCache` | `REALTIME_GTFS_TTL_MS` 25 s |
| Journey network | `src/journey.ts` `networkCache`, `networkBuilds` | `NETWORK_TTL_MS` 6 h; key = sorted feed ids + **one** `malaysiaClock().date` |
| SG reconstructed buses | `src/sg/vehicles.ts` `cache` | 25 s (`CACHE_TTL_MS`) |
| SG stop arrivals | `src/sg/vehicles.ts` `arrivalCache` | 20 s |
| KL rail alerts (MTREC) | `src/mtrec.ts` `cache` | 2 min, 8 s fetch timeout |
| Flights | `src/flights.ts` `positionsCache`, `routeCache` | 15 s per tile, sweep interval; 8–10 s timeouts |
| Generic fetch | `src/http.ts` `fetchArrayBuffer` | `REQUEST_TIMEOUT_MS` 15 s, no retry |

There is no central poller: upstream fetches happen on demand when a request
misses a cache. Phase 5's "centralise polling" is therefore new work.

## 2. Polling (frontend)

`public/app.js`: route view refreshes every `LIVE_REFRESH_MS` 30 s
(`LIVE_REFRESH_IDLE_MS` 60 s when nothing is live); alerts every 3 min;
flights every 15 s; app-version check every 15 min. Markers grey out after
120 s without a fix (mirrored as `MARKER_STALE_MS` in `src/providers/profiles.ts`).

## 3. Timezone — the main blocker for JP/CN

> Update 2026-10-20 (session 2): the call sites below now use per-feed clocks;
> see CURRENT_STATUS.md. Kept as the record of what was found.

Single source of server time: `malaysiaClock()` in `src/schedule.ts`
(`MY_TZ = "Asia/Kuala_Lumpur"`). Call sites that must become per-feed:

- `src/journey.ts` — `getNetwork` (also the cache key), `planJourney`,
  `nearbyDepartures`, `stopBoard`. **One clock for a multi-feed network**: a
  network mixing Tokyo (UTC+9) and Malaysia (UTC+8) feeds cannot share one
  service day or minute-of-day. Journey networks must stay single-timezone, or
  carry per-pattern offsets.
- `src/routes.ts` — route map/stop schedule handler (`withNextDepartures`,
  `buildRouteStopSchedule`).
- `src/seo.ts` — route page timetable; its browser countdown script hard-codes
  `Asia/Kuala_Lumpur`.
- `src/schedule.ts` — `activeServiceIds(feed, clock)` and
  `buildRouteStopSchedule` already take a clock argument, so they are ready.

Frontend hard-codes Malaysia time: `MY_TZ` / `formatTimeMY` in
`public/app.js` and "MYT" in several user-visible strings (stop ETAs, timetable,
offline banner, details tab). These are correct today only because Singapore is
also UTC+8.

Replacement already available: `serviceClock(timeZone)` /
`serviceClockForFeed(feedId)` in `src/providers/`, returning the same
`{date, weekday, minutes}` shape; tests prove it equals `malaysiaClock()` for
every current feed under server TZ = UTC, America/New_York and Asia/Tokyo.

## 4. Speed unit

One global `REALTIME_SPEED_UNIT = "kmh"` (`src/config.ts`), applied once in
`src/gtfsRealtime.ts` (speed conversion near the end of the file). Per-feed
replacement ready: `speedToMpsForFeed(feedId, value)`.

## 5. Ingestion paths

- Generic GTFS: `src/gtfsStatic.ts` (`getStaticFeed` → `fetchAndParseFeed` →
  `parseFeedZip`); patterns via `findRoutePatterns`.
- Generic GTFS-RT vehicles: `src/gtfsRealtime.ts` `getVehiclePositions`.
- Non-GTFS adapters (the pattern China providers should copy):
  `src/sg/busFeed.ts` `buildSgBusFeed`, `src/sg/railFeed.ts` `buildSgRailFeed`
  synthesise the same `StaticGtfsFeed` shape; `src/sg/vehicles.ts` reconstructs
  positions from arrivals (labelled "derived" in the profiles).
- Branch point: `fetchAndParseFeed` special-cases `sg-rail`/`sg-bus` by id.
  A provider registry should replace this id check.

## 6. Country selection

- Frontend: `state.region` ("my" | "sg") with `isSgCategory`, `inRegion`,
  `applyRegion` and the `.region-btn` toggle in `public/app.js`. Binary today;
  JP/CN need a country list driven by provider capabilities.
- Server: place search takes `region=my|sg` (`src/validators.ts`
  `placeSearchSchema`, `src/places.ts` `REGION_BBOX`); journey feed default
  `DEFAULT_JOURNEY_FEEDS` (`src/routes.ts`) mixes MY + SG.
- Basemap tiles cover MY + SG only (`docs/basemap.md`); JP/CN need new extracts.
  Mainland China maps also need a GCJ-02 decision (Phase 3).

## 7. Admin health

`/my-admin/api-check` (`src/server.ts`) loops `FEED_IDS`: realtime-URL feeds
are fetched and counted; `sg-bus` reports key presence only; no-realtime feeds
report "not-configured". `/my-admin/data` → `adminStats()` (`src/routes.ts`).
No per-provider last-success, error summary, quota or circuit state yet.

## 8. Checks that exist

`npm run check`, `npm run build`, `npm test` (13 node:test cases in
`tests/providerNormalization.test.ts`: timezone, speed, profile coverage).
Nothing else is automated: no API, schedule, journey or UI tests.

## 9. Malaysia/Singapore baseline (2026-10-20)

- All 17 `FEED_IDS` have a profile; `satisfies Record<FeedId, ProviderProfile>`
  makes the compiler reject a new feed without one.
- Production state at last deploy (`8ebf7cb`): five BAS.MY feeds (Kuching,
  Kangar, Kota Bharu, Kuala Terengganu, Alor Setar) were empty upstream on
  2026-10-05; not rechecked in this audit.
- No runtime behaviour was changed by the provider foundation: nothing in
  `src/` imports `src/providers/` except the tests.
