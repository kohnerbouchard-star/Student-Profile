# Econovaria Story Narrative Convergence Roadmap

Status: ACTIVE  
Working branch: `feat/story-narrative-convergence-v1`  
Authoritative base at roadmap creation: `8394595b898957676869fb3c692e96969ad0e09e`  
Created: 2026-08-10  
Last updated: 2026-08-11

## Purpose

This file is the persistent source of truth for the remaining Econovaria story/narrative work. Every implementation run on this branch must update this document before the run is considered complete.

The goal is not to add a disconnected dialogue system. The goal is to make the existing systemic storyline runtime feel like a living, authored campaign by connecting recurring characters, player-facing conversations, structured decisions, delayed consequences, relationship state, country-specific developments, economic shocks, business/contract opportunities, and multiple campaign outcomes to the authoritative simulation systems already in the repository.

## Non-negotiable architecture rules

1. Do not invent a second story scheduler. Reuse the existing authoritative storyline runner and timed services.
2. Do not create fake staff accounts for narrative characters.
3. Do not expose Player ownership UUIDs, story/event UUIDs, service-role data, or internal authorization identifiers to browsers.
4. Narrative content must use stable public/content keys. Internal UUIDs remain server-side.
5. Story consequences must flow through existing authoritative systems: ledger/banking, contracts, policies, flags, world/travel, notifications, messaging, market/news, business/economic systems where contracts already exist.
6. Do not weaken existing RLS, moderation, idempotency, privacy, retention, or security ratchets.
7. Player choice must be deterministic and auditable. No free-form AI interpretation is permitted as authoritative game state.
8. Character conversations are private per Player unless an explicitly authored future mechanic says otherwise.
9. Admin may supervise and moderate story communications but may not impersonate narrative characters.
10. New story mechanics must be added as bounded domain contracts and tested before authored content depends on them.

## Current authoritative story foundation

The repository already has a meaningful systemic story runtime:

- scheduled/condition/market-tick storyline events;
- player-rule targeting;
- story flags;
- cash credit/debit effects through the authoritative ledger;
- tax and immigration policy effects;
- contract unlocks;
- cutscene/impact notifications;
- public market-news integration;
- market status changes;
- automatic post-stock-tick story progression;
- autonomous daily country macro progression;
- world/campaign runtime with 10 countries, 50 locations, 13 routes, and Arrival-class support;
- canonical seeded economic assets, Store, Inventory, Crafting, Marketplace, Business, and Contracts foundations.

The remaining problem is primarily narrative density, continuity, player agency, and authored consequence chains rather than absence of a story engine.

## Baseline narrative assessment

Working assessment from the 2026-08-10 story audit:

- Seed/world/economic breadth: strong.
- Story engine/systemic consequences: strong.
- Authored narrative density and branching: incomplete.
- Replayability: incomplete.
- Recurring-character continuity: not yet first-class on `main`.
- Structured player decisions: not yet first-class.
- Relationship state: not yet first-class.
- Contract/policy time-based autonomous transitions: still a known broader runtime gap; do not silently invent unrelated lifecycle mechanics inside narrative work.

## Workstreams

### S0 — Persistent roadmap and convergence ledger

Status: COMPLETE

### S1 — Recurring character messaging foundation

Status: COMPLETE ON BRANCH / CONNECTED STAGING PENDING

### S2 — Structured narrative response windows

Status: COMPLETE ON BRANCH / CONNECTED STAGING PENDING

### S3 — Relationship state

Status: IN PROGRESS

Goal: make recurring characters remember how the Player has treated them across the campaign.

Required state model:

- relationship keyed by `(game, player, characterKey)`;
- bounded dimensions such as trust, respect, affinity, obligation, suspicion, or equivalent authored metrics;
- deterministic deltas only through authoritative story effects;
- stable relationship flags/tiers usable by story conditions;
- no browser writes to relationship tables;
- Player presentation exposes only intentional narrative-facing state, not internal scoring unless explicitly designed.

Locked S3 implementation design:

- canonical metrics: `trust`, `respect`, `affinity`, `obligation`, `suspicion`, each bounded to `[-100, 100]`;
- derived overall standing tiers: `hostile`, `strained`, `neutral`, `trusted`, `allied`;
- authored `relationship_adjust` Story effect with stable `characterKey`, reason, and non-zero metric deltas;
- immutable relationship-adjustment history keyed to Story event + effect index for exact replay/idempotency;
- relationship state hydrated into `PlayerStoryContext` for later Story rules;
- relationship Story conditions may test one metric threshold or derived standing;
- relationship persistence is service-role authoritative with forced RLS and no browser write path;
- raw numeric metrics remain internal in S3; Player-facing relationship presentation is deferred until an explicit narrative presentation contract exists.

### S4 — Choice consequences and delayed callbacks

Status: PLANNED

Goal: ensure a Player response changes later events, access, economics, or relationships.

### S5 — Narrative content saturation tranche

Status: PLANNED

### S6 — Campaign saturation/reachability audit

Status: PLANNED

### S7 — Full story acceptance

Status: PLANNED

## Recommended implementation order

1. Land S1 recurring character messaging foundation.
2. Implement S2 structured response windows.
3. Implement S3 relationship state.
4. Connect S4 consequence effects and delayed callbacks.
5. Author S5 narrative saturation content using only proven mechanics.
6. Run S6 reachability/saturation simulation and fill gaps.
7. Complete S7 staging/full-regression acceptance.

## Current run log

### Run 2026-08-10 — Roadmap bootstrap

Base: `8394595b898957676869fb3c692e96969ad0e09e`

Completed:

- created dedicated branch `feat/story-narrative-convergence-v1` from exact current `main`;
- created this roadmap as the first branch change;
- captured the prior character-messaging design and the remaining narrative convergence sequence.

### Run 2026-08-10 — S1 recurring character messaging landed

Result: COMPLETE ON BRANCH / CONNECTED STAGING PENDING.

### Run 2026-08-11 — S2 structured response windows landed

Workflow run: `31436272469`
Migration: `20260810215844_add_story_structured_response_windows_v1.sql`
Result: SOURCE + FOCUSED REGRESSION GREEN ON BRANCH.

Implemented:

- optional authored response windows on `character_message` story effects;
- 2–5 stable authored choices with prompt, lifecycle, and optional deterministic default;
- private immutable interaction/selection records;
- session-derived Player choice selection with replay protection;
- safe Player/Admin Messaging hydration;
- Player-terminal authored choice controls;
- Admin read-only choice visibility;
- explicit capability/rate-limit boundary;
- no free-form Player text interpreted as canonical story state.

### Run 2026-08-11 — S3 implementation launched

Source head before implementation workflow: `1dbe6ea17240673d2329dfd26082a7dec3e97b3a`

State at launch:

- S2 is fully committed and green on the story branch;
- S3 design is locked in this roadmap;
- private relationship schema body has been staged for CLI-generated migration placement;
- one-shot S3 workflow will generate the migration with Supabase CLI, apply domain/runtime source, run type and focused regression verification, update this roadmap, remove temporary transport, and commit only on success.

Next expected state: either a fail-closed S3 diagnostic recorded here or a verified S3 implementation commit followed immediately by S4 design/implementation.

## Run-completion rule

Every story implementation/verification run must update this file before the run is considered complete. Failed runs are recorded with the exact stage and blocker; successful runs record the exact migration/verification boundary and next workstream.