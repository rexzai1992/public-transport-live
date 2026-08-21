# Rapid Bus Maps Handler

Small API service for Malaysia Open API GTFS data. It combines Prasarana Rapid Bus static GTFS route/stops/shapes with GTFS Realtime vehicle positions.

## Run

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3000`

## Endpoints

- `GET /health`
- `GET /api/rapid-bus/categories`
- `GET /api/rapid-bus/:category/routes?search=T250`
- `GET /api/rapid-bus/:category/routes/:routeId`
- `GET /api/rapid-bus/:category/vehicles?routeId=<route_id>`
- `GET /api/rapid-bus/:category/map?routeId=<route_id>&direction=<index>`
- `GET /api/stops/search?q=<text>&feeds=<a,b>`
- `GET /api/journey?fromLat=&fromLon=&toStop=<feed:stopId>` (or `toLat`/`toLon`)

Supported `category` values (`GET /api/rapid-bus/categories` describes each one,
including whether it carries live vehicles):

| category | network | live vehicles |
| --- | --- | --- |
| `rapid-bus-kl` | Rapid Bus KL | yes |
| `rapid-bus-mrtfeeder` | MRT Feeder buses | yes |
| `rapid-bus-kuantan` | Rapid Kuantan | yes |
| `rapid-bus-penang` | Rapid Penang | yes |
| `rapid-rail-kl` | LRT Ampang / Sri Petaling / Kelana Jaya, MRT Kajang / Putrajaya, Monorail, BRT | **no** |
| `ktmb` | KTM Komuter (Seremban, Port Klang, Ipoh, Padang Besar) and ETS | yes |

Two feed quirks the code accommodates:

- **Rapid Rail publishes no vehicle positions** — the realtime endpoint 404s —
  so the app presents it as timetable-only rather than as a line with no trains.
  Its schedule is headway-based (`frequencies.txt`), expanded into real
  departures rather than read literally from `stop_times.txt`.
- **KTMB ships no `shapes.txt`**, so a line with no geometry is traced between
  its own stations. The response reports `shapeSource: "stops"` when that
  happens, and the UI says the line is approximate.

The map endpoint returns GeoJSON features for route shapes, stops, and live vehicles.

It serves **one direction at a time**. A route's trips are grouped by
`direction_id` into patterns, and `direction` selects which one (default `0`);
the response lists the alternatives under `patterns`. Serving both at once made
a stop's ETA depend on whichever shape happened to match first, so a single
merged list counted down and then back up again.

Stop properties carry `nextDepartures` — the next departures at that stop across
every trip running today, resolved against `calendar.txt`/`calendar_dates.txt`
in Asia/Kuala_Lumpur.

## Journey planning

`GET /api/journey` plans a trip across every configured feed at once, so a
rail-to-rail journey with a bus first mile is one query:

```
/api/journey?fromLat=3.1587&fromLon=101.7137&fromName=KLCC&toStop=rapid-rail-kl:KG14
```

It answers with itineraries made of walk and ride legs, each ride carrying its
board/alight stops, times, intermediate stops and the full stop path so the leg
can be drawn on a map.

How it works, and the honest limits:

- The network is built from PATTERNS (route + direction), each holding its stop
  sequence, per-trip running-time offsets, and trip start times. Headway-based
  rail becomes one offsets array with many starts, so it is exact and cheap.
- Search is a RAPTOR-style round-based scan, up to 3 transfers.
- **Interchanges are inferred.** No Prasarana or KTMB feed ships
  `transfers.txt`, so stops link when they are within 400 m, or share a
  normalised station name within 1 km. A 3-minute penalty covers platform
  changes. Real interchange walking times are not published anywhere in the
  feeds.
- Departures come from today's service calendar in Malaysia time. Rail has no
  vehicle feed, so its plans are timetable-based by definition; bus plans are
  timetable-based too — live positions refine arrivals on the route view, not
  the plan.

## Android app

`mobile/` holds a Capacitor shell with on-device stop alerts and Firebase push.
See [mobile/README.md](mobile/README.md) — it needs a hosted API, your own
Firebase project, and the Android SDK.

## Platform information

Platform numbers are **not published in any of these feeds**. `rapid-rail-kl`'s
`stops.txt` has no `platform_code` and no `parent_station`, no station name
mentions a platform, and KTMB ships only `stop_id, stop_name, stop_lat,
stop_lon`. Nothing in the app invents one.

What it shows instead:

- **The station code** (`KJ14`, `KG16`, `AG18`) — the code printed on the
  signage. At an interchange this is what makes the change concrete: you arrive
  at Pasar Seni **KJ14** and board at Pasar Seni **KG16**.
- **The platform's destination** — KL rail platforms are signed by where the
  train goes ("Ke Putra Heights"), not by number, so the journey shows
  "Platform to Putra Heights". It is drawn with a dashed outline to mark it as
  inferred from direction rather than read from the feed.
- **Exact platforms and entrances where a feed does carry them**, inside the
  stop name: `KL110 PASAR SENI (PLATFORM F1 - F2)` becomes a solid
  "Platform F1–F2" chip, and `MRT SEMANTAN PINTU B` becomes "Pintu B".

### Where platform numbers could come from — and why they don't

Checked, and ruled out:

- **GTFS feeds** — no `platform_code`, no `parent_station`, no platform text in
  any rail station name.
- **OpenStreetMap** — platform numbers *do* exist (Pasar Seni has ways tagged
  `ref=1`, `ref=2`, `ref=4`), but they are not linked to a line or a direction.
  The Kelana Jaya route relation has 37 `stop` members and **zero** platform
  members, so there is no way to say which number belongs to your train.
- **Moovit** — no platform shown on the screens inspected.

So a number can only come from someone reading the sign, and
[public/platform-overrides.js](public/platform-overrides.js) is generated to
make that as small a job as possible: 761 entries across 335 rail stations,
interchanges first, each already labelled with its line and destination.

```js
window.RAPIDBUS_PLATFORMS = {
  /* ===== INTERCHANGE — wrong platform costs a walk ===== */
  // PASAR SENI  (KJL)
  "rapid-rail-kl:KJ14:KJ:0": "",  // KJL towards Gombak
  "rapid-rail-kl:KJ14:KJ:1": "2", // KJL towards Putra Heights  <- fill these in
};
```

The key is `feed:stopId:routeId:directionId` — the route is part of it because
two lines can share a station and a direction (Alor Setar is served by both the
Padang Besar Line and ETS). Regenerate after a feed update with:

```bash
node scripts-generate-platforms.mjs > public/platform-overrides.js
```

A filled value renders as a **solid** chip ("Platform 2") because it is then a
confirmed fact; a blank one falls back to the **dashed** destination chip, which
is vaguer but never wrong.

## Journey tracking

Selecting an itinerary and pressing **Start** watches the device's position and
answers the two questions you have while travelling: which step am I on, and how
far to the next one. Stops behind you dim, the next one is highlighted with a
live "355 m left" counter, and the floating bar counts down to it. When you come
within 700 m of the stop you must alight at, it fires a notification once — a
local notification in the Android shell, a web notification in a browser.

One mechanism, not two: the get-off alert falls out of the same position watch
that drives the progress display.

Positions are matched against timeline rows that carry coordinates. The timeline
also holds segment rows (the ride and walk descriptions) with none, so stepping
by raw row index would skip the next station and leave nothing marked as current
— which is exactly what happened at the first and last stop before this was
fixed.

**Foreground only.** `@capacitor/geolocation` reports position only while the
app is in the foreground, so tracking works with the app open and does not
survive a locked screen. See [mobile/README.md](mobile/README.md).

## No fares

Moovit shows a fare per leg. That is not reproducible from these feeds: none of
`rapid-bus-kl`, `rapid-rail-kl` or `ktmb` ships `fare_attributes.txt` or
`fare_rules.txt` — all three contain only agency, calendar, routes, shapes,
stop_times, stops, trips (plus frequencies for the Prasarana feeds). Showing a
price would mean inventing one, so the app shows none.
