# Seed Data Roadmap Progress Amendment — 2026-07-19

Status: authoritative PR #163 execution checkpoint pending consolidation into `16-seed-data-roadmap-and-tracker-v1.md`  
Owner: `agent/seed-content-foundation-v1`  
Production authorization: false

## Verified completed design-layer gates

### Market universe

- ten committed country JSONL files;
- exactly 320 records per country and 3,200 globally;
- 3,200 unique stable IDs, symbols, and display names;
- deterministic regeneration and per-country SHA-256 validation;
- all records remain fail-closed and production unauthorized.

### Active-market identity and selection

- 240 selected candidate instruments across all ten countries;
- four curated 24-instrument candidates retain canonical enriched identities;
- six universe-derived 24-instrument candidates are selection-complete and enrichment-pending;
- all 240 candidate identities match the canonical universe;
- zero missing symbols, duplicate identities, exchange mismatches, or active-ID conflicts;
- no candidate is authorized for activation.

### Simulation evidence

- Northreach, Yrethia, Thaloris, and Solvend deterministic pilots reran successfully;
- committed inputs, scripts, summaries, manifests, and checksums reconcile;
- raw Northreach, Yrethia, and Thaloris outputs are retained in GitHub Actions artifact `8436033290` with source commit, workflow run, digest, file checksums, sizes, and a 90-day retention policy;
- stale checksum, false repository-missing-file, and raw-retention blockers are closed;
- simulations remain calibration evidence, not production authorization.

### Arrival foundation

- ten arrival packages contain relative starting-cash, housing-cost, and ordinary-expense bands;
- ten arrival messages, ten tutorials, and ten stabilization Contracts are linked by stable IDs;
- every package names a support path and recovery route;
- numerical values, reward amounts, and runtime instantiation remain simulation- and capability-blocked;
- all arrival definitions remain non-executable.

### Core gameplay definition coverage

- 50 Contracts;
- 10 banking products;
- 10 levels and 20 achievements;
- 25 standalone events, 10 event chains, and 5 crisis arcs;
- 50 interactions;
- 30 news templates;
- 10 tutorials;
- 30 notification templates;
- all 11 approved machine-readable coverage targets are met with zero static record gap.

Static counts are only the definition foundation. They do not prove that a one-year game contains sufficient pacing, variation, recovery, or non-repetitive content.

## Authoritative duration and market-cadence constraints

`17-one-year-real-time-content-and-market-cadence-contract-v1.md` is a controlling seed and simulation dependency.

- one game lasts one real-world year;
- the simulation follows wall-clock time;
- each listed instrument is evaluated once per eligible exchange-open minute;
- markets close under versioned real-world-style exchange calendars, including weekends, holidays, and early closes;
- regular-session prices do not move while the relevant exchange is closed;
- accumulated closed-session information may enter through a bounded opening-gap calculation;
- orders, missed-minute replay, and realtime publication must be calendar-gated and idempotent;
- one-year content approval requires recurrence, stateful chains, seasonal scheduling, procedural variants, cooldowns, deduplication, and consequence memory.

### Seed exchange registry

- `markets/exchanges/exchange-calendar-registry-v1.json` defines ten stable country exchanges;
- the initial baseline preserves the existing runtime policy: `Asia/Seoul`, Monday-Friday, 08:00 inclusive to 17:00 exclusive;
- closed-session prices hold the last authoritative close;
- new immediate fills are rejected while closed;
- overnight information uses a bounded opening-gap policy;
- all exchange records remain activation disabled;
- the exchange audit and all nine seed-preflight tests pass;
- holiday dates, approved early closes, emergency closures, and divergent exchange timezones remain pending.

### Runtime companion

PR #204, `feat(stocks): enforce real-time exchange calendar`, is the bounded Backend runtime companion.

Implemented and branch-verified on PR #204:

- pure exchange-calendar evaluation and next-transition reporting;
- closed-session runner rejection before market-state load or persistence;
- service-role database gating for new immediate order fills;
- terminal order replay preserved across later market closure;
- dashboard market status derived from the server calendar rather than game-session activity;
- exchange-scoped UTC minute keys for future deterministic catch-up;
- 33 focused tests passing;
- all Backend and Edge typechecks passing;
- migration source audit, drift check, and whitespace check passing.

PR #204 remains draft pending repository pull-request checks and does not authorize deployment.

## Current preflight result

The latest deterministic design preflight reports:

- zero structural errors;
- sixteen blockers;
- zero warnings;
- all nine seed-preflight tests passing.

The previous blockers for missing universe files, incomplete active-country selection, incomplete arrival references, stale simulation checksums, falsely declared missing simulation files, unretained raw simulation evidence, and missing exchange definitions are closed at the design layer.

## Remaining blocker classes

1. Fifteen design domains remain definition-only or blocked while Backend capability, persistence, approved holiday data, calibration, and staging dependencies are unresolved.
2. Fifty location records still require pixel-level verification against the active map artwork before coordinates can be approved.
3. Six active markets require financial enrichment and exchange-calendar-aware simulation.
4. Numerical arrival-package viability requires a full-year simulation across country and difficulty conditions.
5. Static content counts require one-year pacing, repetition, opportunity, recovery, and notification-load analysis.
6. Queued GTC execution, deterministic missed-open-minute replay, emergency closure control, environment-restricted import, rollback rehearsal, and bounded staging activation remain incomplete.

## Map-coordinate decision

Do not invent map points from prose or inferred geography. Coordinate approval requires the active map artwork, verified country polygons, a documented coordinate system, and a retained review artifact. Until those inputs are present, locations may be referenced by stable ID in definition-only content but not rendered as verified markers or route endpoints.

## Immediate execution order

1. Complete PR #204 pull-request validation and merge the initial exchange-calendar boundary after review.
2. Add approved holiday, early-close, and emergency-closure records and deterministic missed-open-minute replay.
3. Enrich and simulate Eldoran, Valerion, Lumenor, Xalvoria, Dravenlok, and Syndalis using eligible open-market minutes only.
4. Run a complete one-year content schedule simulation covering recurrence, pacing, cooldowns, variants, inactivity recovery, and repetition.
5. Run arrival-package viability and reward-price-sink calibration over the full year.
6. Complete map artwork verification before assigning coordinates or adjacency.
7. Build the environment-restricted importer only after stable-ID storage, Backend capability mapping, calendar authority, replay, and rollback are approved.
