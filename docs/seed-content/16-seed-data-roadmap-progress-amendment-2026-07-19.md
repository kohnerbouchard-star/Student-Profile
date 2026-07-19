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

`17-one-year-real-time-content-and-market-cadence-contract-v1.md` is now a controlling seed and simulation dependency.

- one game lasts one real-world year;
- the simulation follows wall-clock time;
- each listed instrument is evaluated once per eligible exchange-open minute;
- markets close under versioned real-world-style exchange calendars, including weekends, holidays, and early closes;
- regular-session prices do not move while the relevant exchange is closed;
- accumulated closed-session information may enter through a bounded opening-gap calculation;
- orders, missed-minute replay, and realtime publication must be calendar-gated and idempotent;
- one-year content approval requires recurrence, stateful chains, seasonal scheduling, procedural variants, cooldowns, deduplication, and consequence memory.

The legacy implementation contains explicit market hours, but the current dashboard currently maps an active game session directly to `marketStatus: open`. That behavior is not adequate for the one-year runtime and must be replaced by an authoritative exchange-calendar service.

## Current preflight result

The latest deterministic design preflight reports:

- zero structural errors;
- sixteen blockers;
- zero warnings;
- all nine seed-preflight tests passing.

The previous blockers for missing universe files, incomplete active-country selection, incomplete arrival references, stale simulation checksums, falsely declared missing simulation files, and unretained raw simulation evidence are closed.

## Remaining blocker classes

1. Fifteen design domains remain definition-only or blocked while Backend capability, persistence, calendar, calibration, and staging dependencies are unresolved.
2. Fifty location records still require pixel-level verification against the active map artwork before coordinates can be approved.
3. Six active markets require financial enrichment and exchange-calendar-aware simulation.
4. Numerical arrival-package viability requires a full-year simulation across country and difficulty conditions.
5. Static content counts require one-year pacing, repetition, opportunity, recovery, and notification-load analysis.
6. No environment-restricted importer, idempotent replay proof, rollback rehearsal, or bounded staging activation exists.

## Map-coordinate decision

Do not invent map points from prose or inferred geography. Coordinate approval requires the active map artwork, verified country polygons, a documented coordinate system, and a retained review artifact. Until those inputs are present, locations may be referenced by stable ID in definition-only content but not rendered as verified markers or route endpoints.

## Immediate execution order

1. Add exchange-calendar definitions and update the simulation protocol to process only eligible open-market minutes.
2. Enrich and simulate Eldoran, Valerion, Lumenor, Xalvoria, Dravenlok, and Syndalis.
3. Run a complete one-year content schedule simulation covering recurrence, pacing, cooldowns, variants, inactivity recovery, and repetition.
4. Run arrival-package viability and reward-price-sink calibration over the full year.
5. Complete map artwork verification before assigning coordinates or adjacency.
6. Build the environment-restricted importer only after stable-ID storage, Backend capability mapping, calendar authority, replay, and rollback are approved.
