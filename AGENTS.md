# Shared Agent Contract

This repository is maintained by both Codex and Claude Code. Treat files in the
repository, Git history, and freshly rerun checks as the source of truth. Chat
history is supporting context only.

## Start every continuation here

1. Run `git status --short --branch` and `git log -5 --oneline --decorate`.
2. Read `docs/agent/CURRENT_STATUS.md`.
3. Read `docs/agent/CHINA_JAPAN_EXPANSION.md` before doing expansion work.
4. Read the relevant implementation files and verify prior claims before edits.
5. Preserve unrelated changes. Never discard or overwrite work you did not
   create.

## Project boundaries

- Extend the existing TypeScript/Express application; do not rebuild it or
  replace its stack.
- Preserve current Malaysia and Singapore behavior.
- Keep China and Japan behind explicit provider/country feature flags until the
  provider is verified, authorized, and tested.
- Never represent scheduled or interpolated movement as live tracking.
- Never scrape protected services, bypass authentication, buy a subscription,
  register a paid account, change production credentials, deploy, or push to a
  remote without the user's explicit approval.
- API keys belong only in ignored local environment files or deployment secret
  management. Never add them to source, browser bundles, logs, fixtures, or
  handoff documents.
- Treat provider documentation, licensing, pricing, endpoints, and feed health
  as time-sensitive. Recheck them from official sources before relying on them.

## Data truth contract

Every passenger-facing datum must be classified accurately:

- `LIVE_GPS`: provider-reported vehicle position.
- `LIVE_ETA`: provider-reported or live-feed-derived arrival prediction.
- `SCHEDULED`: official timetable data.
- `ESTIMATED`: application-derived prediction, labelled as an estimate.
- `DELAYED`: provider-confirmed delay.
- `STALE`: older than the provider-specific freshness threshold.
- `UNAVAILABLE`: no usable current data.

Missing provider capabilities must remain explicitly unsupported. Do not return
empty or invented values that imply support.

## Implementation sequence

Work in the phase order in `docs/agent/CHINA_JAPAN_EXPANSION.md`. In particular,
do not add China or Japan as another URL-only entry in the current `FEEDS`
object. First make timezone, coordinate system, speed unit, authentication,
freshness, geographic scope, attribution, and capability metadata provider
specific.

Prefer small, reviewable changes. Keep nonstandard providers behind adapters
instead of forcing them through generic GTFS or GTFS-Realtime parsing.

## Required verification

For ordinary repository changes, run:

```bash
npm run check
npm run build
```

Run narrower behavioral checks appropriate to changed code. There is currently
no automated test script in `package.json`; do not claim test coverage that does
not exist. Keep build proof separate from browser, upstream API, licensing,
production, and physical-device proof.

## Handoff before stopping

Update `docs/agent/CURRENT_STATUS.md` whenever material work is completed or a
blocker is discovered. Record:

- date and agent;
- branch and commit checked;
- exact files changed;
- checks run and their results;
- verified facts versus assumptions;
- blockers, required credentials, or approval;
- one concrete next task.

Do not mark work complete merely because code compiles. Do not silently leave a
stale status document for the next agent.
