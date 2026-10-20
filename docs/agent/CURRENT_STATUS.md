# Current Agent Status

Last updated: 2026-10-20 (Asia/Kuala_Lumpur)  
Last agent: Claude Code (Opus 5.5), continuing Codex's handoff  
Workstream: China and Japan expansion preparation  
Deployment status: deployed to production VPS 2026-10-20 (MY/SG only; no CN/JP feed enabled)

## Repository checkpoint

- Repository: `public-transport-live`
- Branch checked: `main`
- Baseline commit before the handoff files: `8ebf7cb`
- Baseline remote state: local `main` matched `origin/main`
- Existing working tree was clean before this handoff setup.
- The handoff files themselves are local changes until the user approves a
  commit and push.

Always rerun Git checks; this checkpoint is historical evidence, not a promise
about the current working tree.

## Verified baseline

- Backend: TypeScript 5, Express 4, Node.js, built with `tsc`.
- Frontend: dependency-free static web app in `public/`, served by the Express
  backend.
- Mobile: Capacitor Android wrapper in `mobile/`.
- Transit ingestion: static GTFS plus GTFS-Realtime parsing, with custom
  Singapore adapters under `src/sg/`.
- Current countries: Malaysia and Singapore.
- Current modes in the central feed definition: `bus` and `rail`.
- Current journey planner combines configured feeds and uses schedule-based
  departures; live positions refine route views rather than journey results.
- Current cache is application-process memory. No database or Redis dependency
  is declared in the root package.
- Protected operational diagnostics already exist under `/my-admin`.
- `.env` exists locally and is ignored. Its secret values were not copied into
  this handoff.

## Constraints discovered in the existing code

- `src/config.ts` has one global `REALTIME_SPEED_UNIT`, currently `kmh` for the
  Malaysia feeds. International GTFS-Realtime commonly reports metres/second,
  so this must become provider/feed metadata.
- Schedule logic and documentation contain Malaysia-time assumptions that must
  become provider or service-calendar timezone metadata.
- `FeedDefinition` currently models a static URL and one realtime vehicle URL;
  it does not model authentication, capabilities, attribution, licence status,
  freshness, coordinate system, arrivals, alerts, or trip updates.
- Singapore already proves that non-GTFS sources can be isolated behind an
  adapter. China providers should follow that pattern.
- Mainland China has no single verified nationwide GTFS/GTFS-Realtime source in
  prior research. Each municipal or commercial provider needs independent
  authorization and validation.

## Work completed in this handoff

- Added `AGENTS.md` as the shared Codex/Claude operating contract.
- Added `CLAUDE.md`, which imports the shared contract and this status file.
- Added the structured expansion plan in
  `docs/agent/CHINA_JAPAN_EXPANSION.md`.
- Added `scripts/continue-with-claude.sh` and the `npm run handoff:claude`
  launcher.
- Installed Claude Code `2.1.304` globally and verified that Claude Code is
  already authenticated using a Claude account.

Files changed by this handoff:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`
- `docs/agent/CURRENT_STATUS.md`
- `docs/agent/CHINA_JAPAN_EXPANSION.md`
- `scripts/continue-with-claude.sh`

## Verification performed

- `npm run verify` (`npm run check` plus `npm run build`): passed on
  2026-10-20 after the handoff-file edits.
- `bash -n scripts/continue-with-claude.sh`: passed.
- `git diff --check`: passed.
- `claude --version`: reported `2.1.304 (Claude Code)`.
- `claude doctor`: reported no installation issues.
- A read-only `claude -p` smoke test loaded the project context and returned the
  exact current workstream and first next action from this file.
- No China or Japan transit integration code was added.
- No upstream provider, browser UI, mobile app, production endpoint, deployment,
  licence, or paid plan was verified by this handoff setup.

## Provider state

| Provider | Country | Intended capability | Current state |
| --- | --- | --- | --- |
| ODPT | Japan | Rail/bus static and selected realtime resources | Registration and dataset-by-dataset licence verification required |
| GTFS Data Repository | Japan | GTFS/GTFS-JP and some GTFS-Realtime feeds | Catalogue/API and individual feed verification required |
| JR East challenge data | Japan | Limited train location data | Time-limited/licence-constrained; do not enable by default |
| NAVITIME | Japan | Commercial multimodal routing | Product entitlement and cost verification required |
| Shanghai MaaS | China | Shanghai bus/metro information | Docs, signing, credentials, fields, and licence verification required |
| Chelaile | China | Realtime bus arrivals/locations | Commercial authorization required; unofficial API is not production-safe |
| Code410 | China | Experimental bus data | Source, licence, freshness, and reliability unverified |
| Baidu Maps | China | Routing/search/map services | Licensed optional adapter; do not assume raw live GPS |
| Amap | China | Routing/search/map services | Licensed optional adapter; do not assume raw live GPS |
| China Railway 12306 | China | Rail schedules/status | Use only an authorized interface; no protection bypass |

## Current blockers

- No ODPT key or dataset entitlement has been verified.
- No authorized China realtime provider credential has been verified.
- Provider licences, attribution, rate limits, pricing, and production-display
  rights are not yet recorded from current official sources.
- The current feed model must be normalized before adding international feeds.

## Claude Code session — 2026-10-20

Checked `main` at `8ebf7cb` (matches `origin/main`). Working tree held
Codex's uncommitted handoff files plus provider work not recorded above:
`src/providers/contract.ts`, `src/providers/normalization.ts`,
`src/providers/profiles.ts`, `tests/providerNormalization.test.ts`,
`tsconfig.test.json`, and `test`/`verify` scripts in `package.json`.

Verified (rerun, not assumed):

- `npm run check`: pass. `npm run build`: pass. `git diff --check`: pass.
- `npm test`: 13/13 pass; also 13/13 under `TZ=UTC`,
  `TZ=America/New_York` and `TZ=Asia/Tokyo`.
- Nothing in `src/` outside `src/providers/` imports the provider modules, so
  runtime behaviour is unchanged.

Added this session:

- `docs/agent/PHASE0_AUDIT.md` — Phase 0 map of caches/TTLs, polling,
  timezone call sites, speed unit, ingestion paths, country selection, admin
  health, existing checks and the MY/SG baseline (step 1 of the previous next
  task).

Step status for the previous next task: 1 done (audit file); 2 done by Codex
(`src/providers/contract.ts`, `profiles.ts`), reviewed; 3 done by Codex
(tests), verified; 4 partly — build/type/unit checks pass, but there is no
automated API/journey regression suite, so no MY/SG behavioural regression
check exists to rerun.

Not done / not verified: no browser, upstream, production, licence or device
check; nothing committed, pushed or deployed (needs user approval).

Key finding for Phase 1: journey networks share one `malaysiaClock()` across
all feeds (cache key and service day). Mixing UTC+8 and UTC+9 feeds in one
network would be wrong; see audit §3.

## Claude Code session 2 — 2026-10-20: per-feed time and speed wired in

User asked for times to follow each place's own clock ("if in Japan, follow
Japan time"). Done without changing Malaysia/Singapore output.

Files changed:

- `src/providers/normalization.ts` — `partitionByClock()` (feeds share a
  journey network only while their wall clocks agree).
- `src/providers/profiles.ts` — `feedTime()` (zone + passenger label by
  country: MYT, SGT, JST, CST; Johor's Asia/Singapore zone still shows MYT);
  header comment updated.
- `src/journey.ts` — `Network.timeZone`; `getNetwork` keeps only same-clock
  feeds (warns about the rest) and keys its cache by zone + local date;
  `networkClock()` replaces `malaysiaClock()` in `planJourney`,
  `nearbyDepartures`, `stopBoard`.
- `src/routes.ts` — route map schedule uses `serviceClockForFeed(category)`;
  feed lists (`/rapid-bus/categories`, `/route-index`) now include `timeZone`
  and `timeLabel`.
- `src/seo.ts` — route page schedule uses the feed clock; `<main data-tz>`
  drives the browser countdown (was hard-coded Asia/Kuala_Lumpur).
- `src/gtfsRealtime.ts` — speed via `speedToMpsForFeed` (global
  `REALTIME_SPEED_UNIT` no longer read at runtime; still the source value
  for Malaysian profiles in `src/config.ts`).
- `public/app.js` — `feedTz()` / `feedTzLabel()`; `formatTimeMY` →
  `formatTimeLocal`, `nowMinutesMY` → `nowMinutesLocal`; the six "MYT"
  labels now show the open route's own label (Singapore routes now say SGT).
- `tests/providerNormalization.test.ts` — 7 new tests (clock partition,
  labels). Total 20.

Verified:

- `npm run verify`: exit 0. `git diff --check`: pass.
- `npm test`: 20/20 under local TZ, `UTC`, `America/New_York`, `Asia/Tokyo`.
- No runtime caller of `malaysiaClock()` remains (only its definition).
- Behavioural regression, local new code vs production old code, same
  moment, same requests: identical next departures for every stop on
  rapid-rail-kl AG (18), rapid-bus-kl U4500 (51), sg-rail NSL (27); identical
  journeys KL Sentral→KLCC and Orchard→Changi; identical `/stops/nearby` (KL)
  and `/stops/board` (Pasar Seni). Script: compare JSON of the same URLs.
- Browser (headless Chrome, local server): viewer in New York on SG NSL sees
  "SGT" and a countdown in Singapore time; viewer in Tokyo on KL AG sees
  "MYT" and KL time. No page errors.

Not verified: no Japan/China feed exists, so JST/CST paths are covered only by
unit tests with made-up feed ids. Nothing committed, pushed or deployed.

## Claude Code session 3 — 2026-10-20: CJK/romanized search, service day, abnormal input

User asked for China/Japan search (including Latin letters), multi-agent
testing, abnormal-input testing, then approved push and deploy.

Files changed:

- `src/search.ts`, `public/search-core.js` (kept in parity) — CJK-aware
  normalization (駅/站/车站 → "station", no typo matching for CJK, 2-char CJK
  substrings), `kanaToRomaji`/`romajiForms`, multi-spelling docs.
- `src/types.ts`, `src/gtfsStatic.ts` — `altNames` from `translations.txt`
  (GTFS standard and legacy GTFS-JP layouts, tolerant parsing); feeds zipped
  inside a subfolder load; CSV parsing tolerates stray quotes and ragged rows;
  blank/out-of-range/hex coordinates and blank `stop_sequence` drop the row;
  headways under 30 s are rejected.
- `src/journey.ts`, `public/app.js`, `src/seo.ts` — stop/route search uses
  alt names; `/routes` filter text is Unicode and includes alt names.
- `src/places.ts` — 2-char CJK place queries allowed.
- `src/schedule.ts` — after-midnight service (yesterday's 24:xx trips),
  no repeated clock times, strict GTFS time parsing (minutes ≤ 59, hour < 48),
  `notRunningToday`: a route with no trip today (while other services run)
  shows no next departures; its route page says so and keeps the usual
  timetable for reference.
- `src/providers/normalization.ts` — negative speed → undefined.
- `src/server.ts` — client errors marked 4xx by Express/body-parser (bad
  %-encoding, bad JSON, oversized body) return 400/413, not 500.
- Tests: `tests/translations.test.ts`, `tests/serviceDay.test.ts`,
  `tests/abnormal.test.ts` (new); 192 total.

Verified:

- `npm run verify` exit 0; `git diff --check` pass.
- `npm test`: 190 pass, 0 fail, 2 todo, under local TZ, `UTC`,
  `America/New_York`, `Asia/Tokyo`.
- MY/SG regression (local vs production, same moment, 64 requests): 62
  identical, 0 different, 2 invalid test stop keys 404 on both. Rerun after
  deploy: same.
- Abnormal HTTP sweep (271 requests): no crash, no stack trace leak, no
  response > 3 s; the six 500s found are now 400/413 (rechecked live).
- Real Nagano/Kumamoto GTFS-JP zips parsed by a QA agent (not enabled).

Deployed: backup `/opt/rapidbus-backups/rapidbus-20261020-190509.tgz`,
rsync `src dist public docs`, `pm2 restart rapidbus`, health ok, live checks
pass (route pages, `data-tz`, feed `timeLabel`, 400 on bad encoding).

Known, not fixed (2 todo tests): an entire feed with an expired calendar
still shows its timetable (needs a STALE label); repeated query words inflate
search scores (HTTP `q` capped at 80 chars). MY/SG QA backlog from the search
agents (network cache key, Penang stop search, SG abbreviations, MRT/LRT chip
counts, region-switch stop cache, places SKIP_VALUES) is still open.

Japan blockers found on real GTFS-JP feeds: unstable date-suffixed route ids,
GTFS-JP route naming, `agency_timezone` ignored, Shift_JIS, CC BY attribution
not modelled. Kanji without a feed translation cannot be romanised; no pinyin.

ODPT: the user asked Claude to register. The signup form
(https://developer.odpt.org/signup) needs the user's real name, kana, age,
address, phone, password and acceptance of the terms; Claude opened it
prefilled (email, occupation, source) in a visible browser for the user to
complete. Approval takes up to 2 business days by email. The key must go in
`.env` as `ODPT_CONSUMER_KEY`, never in source or chat.

## Next concrete task

Make GTFS-JP feeds production-correct behind a disabled flag, using Nagano
(gtfs-data.jp, CC BY 4.0 per its catalogue — recheck from the official
source): stable route ids/names from GTFS-JP fields, `agency_timezone`,
attribution display, then add the feed with `productionEnabled: false` and
the capability-driven country switch. Then record the result here.
