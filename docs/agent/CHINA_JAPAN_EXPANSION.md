# China and Japan Expansion Plan

This plan turns the supplied expansion brief into gated, handoff-friendly work.
It does not claim that any provider is currently licensed, reachable, or live.

## Mission

Extend Public Transport Live from Malaysia and Singapore to China and Japan
while retaining the existing stack and preserving truthful data labels. Cover
buses, metro/subway, urban and regional rail, high-speed rail, airport rail, and
other public transport only where usable authorized data exists.

Target initial cities:

- China: Beijing, Shanghai, Guangzhou, Shenzhen, Chengdu, Chongqing, Wuhan,
  Hangzhou, Nanjing, and Xi'an.
- Japan: Tokyo, Osaka, Kyoto, Yokohama, Nagoya, Fukuoka, Sapporo, Kobe,
  Hiroshima, and Sendai.

City support is capability-driven. A target city must not appear as fully live
until an authorized feed has been verified for that capability.

## Non-negotiable rules

- Inspect before coding; do not rebuild the application.
- Prefer official free/open data, then authorized low-cost commercial data.
- Keep provider keys on the backend.
- Do not scrape protected sites or reverse engineer a production integration.
- Do not turn timetables into moving vehicle markers.
- Do not assume routing APIs expose vehicle positions.
- Do not assume all resources from one catalogue share the same licence.
- Do not deploy, purchase, or register a paid service without user approval.
- Keep incomplete countries and providers behind feature flags.

## Delivery phases

### Phase 0 — audit and baseline

Deliver a repository investigation report covering:

- server routes and public frontend entry points;
- static GTFS and GTFS-Realtime parsing;
- Singapore custom adapters;
- cache ownership, TTLs, polling, retries, and timeouts;
- schedule/timezone and ETA logic;
- journey graph construction and feed isolation;
- operational dashboard and provider health;
- environment variables, deployment flow, and secret handling;
- current automated checks and missing test coverage.

Exit gate:

- Malaysia and Singapore baseline behavior is recorded.
- `npm run check` and `npm run build` pass.
- No unrelated edits or production mutations occurred.

### Phase 1 — provider-neutral foundation

Extend the existing model with provider-specific metadata before adding feeds:

- country and city/geographic scope;
- operator and transport modes;
- capabilities: operators, routes, stops, trips, vehicles, arrivals,
  schedules, alerts, and journey planning;
- authentication strategy and backend-only credential names;
- timezone and service-day rules;
- speed unit;
- coordinate reference system: WGS84, GCJ-02, or BD-09;
- refresh interval, freshness threshold, retry/backoff, and circuit state;
- attribution, licence status, expiry, usage restrictions, and cost notes;
- source timestamp and retrieval timestamp;
- static/realtime identifier compatibility.

Provider methods should be optional by declared capability. Unsupported methods
must fail explicitly and predictably.

Exit gate:

- Current Malaysia and Singapore providers map into the new contract without
  passenger-visible regressions.
- Timezone and speed conversion are covered by focused tests.
- Nonstandard adapters can coexist with GTFS/GTFS-Realtime adapters.

### Phase 2 — Japan official-data slice

Research and record current official evidence for:

1. ODPT developer access, resource schema, authentication, refresh rate,
   licence, attribution, and production use for each selected dataset.
2. Japan GTFS Data Repository catalogue/API, feed versions, expiry, GTFS-JP
   differences, and available GTFS-Realtime resources.
3. Iyotetsu and Tosaden vehicle positions, trip updates, and alerts.
4. JR railway and Shinkansen schedules/status; keep position data unavailable
   unless an authorized realtime resource exists.
5. NAVITIME product scope, free allowance, paid entitlement, languages, fares,
   and route geometry.

Implementation order:

- import one verified static GTFS/GTFS-JP feed;
- add version/expiry and calendar handling;
- add one authorized GTFS-Realtime bus feed;
- add ODPT resources behind backend credentials;
- add rail status/schedule data separately from vehicle position capability;
- verify Japanese text search and station numbering.

### Phase 3 — China authorized-data slice

Research and record current official evidence for:

1. Shanghai MaaS endpoint paths, methods, parameters, response fields,
   authentication/signing, coverage, freshness, and production rights.
2. Chelaile partnership access, cities, identifiers, rate limits, data fields,
   pricing, licence, and public-display rights.
3. Code410 upstream source, reliability, rate limits, and licence; keep it
   experimental until authorized.
4. Baidu and Amap routing/search capabilities and required map-coordinate
   conversions. Do not infer live GPS capability.
5. Authorized China Railway information for schedules, delays, platforms, and
   high-speed rail. Never bypass 12306 protections.

Implementation order:

- implement tested WGS84/GCJ-02/BD-09 conversion at provider boundaries;
- add disabled provider adapters when credentials or approval are required;
- enable one city/capability only after a successful authorized request and
  licence check;
- keep rail schedule/status separate from live position data.

### Phase 4 — product integration

Preserve the current design while adding capability-aware controls for:

- country, city, operator, route, station/stop, and train-number search;
- bus, metro, train, high-speed rail, and airport rail modes;
- English, Simplified Chinese, Japanese, and existing languages;
- original and translated names when supplied by a feed;
- route shapes, stops, stations, entrances, and real vehicle markers;
- next arrivals, service status, delays, freshness, and attribution;
- multimodal journeys only across deliberately compatible datasets.

The UI must show one of the shared data-truth statuses and the last update time.
Country or provider selection must not imply capabilities that are unavailable.

### Phase 5 — operations and release readiness

Centralize upstream polling so frontend traffic does not produce one upstream
request per user. Reuse the existing cache initially, then introduce Redis or a
database only when measured requirements justify it.

Operational controls must include:

- provider enable/disable and priority;
- country/city coverage and capability inventory;
- refresh and freshness settings;
- health, last successful sync, error summary, quota/rate-limit state;
- usage count and estimated monthly cost;
- safe stale-data behavior and circuit-breaker state.

Release gate:

- provider is verified and authorized for public production display;
- required attribution is visible;
- credentials are in secret management;
- invalid credentials, quota exhaustion, outages, missing vehicles, stale data,
  duplicates, coordinates, timezones, switching, and mobile layout are tested;
- Malaysia and Singapore regressions pass;
- the user explicitly approves deployment.

## Provider verification ledger format

Create one entry per provider/dataset. Never group distinct datasets under one
unqualified claim.

| Field | Required evidence |
| --- | --- |
| Provider and dataset | Official name and resource identifier |
| Official documentation | Direct current source URL and checked date |
| Access | Open, registration, paid approval, or unavailable |
| Authentication | Scheme and backend-only environment variable names |
| Geography | Confirmed countries/cities/operators |
| Capabilities | Static, vehicle GPS, arrivals, trip updates, alerts, routing |
| Actual response | Successful authorized request and sanitized sample/fixture |
| Freshness | Source timestamp, observed update rate, stale threshold |
| Coordinates | WGS84, GCJ-02, BD-09, or documented alternative |
| Identifiers | Route/trip/stop stability and static/realtime matching |
| Licence | Display, caching, redistribution, attribution, expiry |
| Limits and cost | Rate/quota and estimated monthly spend |
| Production state | Authorized, licence pending, registration required, paid approval required, experimental, or unavailable |

## Test matrix

At minimum, cover:

- per-provider timezone and service-day rollover;
- speed-unit normalization;
- coordinate conversion and no repeated conversion drift;
- GTFS/GTFS-JP calendar exceptions and feed expiry;
- GTFS-Realtime vehicle, trip-update, and alert decoding;
- static/realtime identifier mismatch;
- duplicate station handling across feeds/operators;
- Unicode, Chinese names, Japanese names, and station numbers;
- authentication failure, quota limit, timeout, retry, and circuit opening;
- stale, empty, and unavailable responses;
- capability-aware country/city switching;
- Malaysia and Singapore regression behavior.

## Final report structure

The eventual delivery report must separate implementation proof from provider,
licensing, UI, production, and deployment proof. Include:

1. existing architecture;
2. implemented changes;
3. China and Japan provider results;
4. verified live GPS and live ETA feeds;
5. static timetable integrations;
6. supported cities/operators/modes;
7. licences and attribution;
8. pricing and estimated operating cost;
9. missing credentials or approvals;
10. environment variables;
11. tests and build results;
12. known issues and deployment readiness;
13. a per-country capability table for live GPS, live ETA, scheduled data, and
    service alerts.
