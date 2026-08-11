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

Deliverables:

- [x] Create this roadmap before story implementation resumes.
- [x] Record branch, base SHA, architecture rules, workstreams, verification expectations, and run log.
- [x] Update this document during every story implementation/verification run, including failed runs.

### S1 — Recurring character messaging foundation

Status: COMPLETE ON BRANCH / CONNECTED STAGING PENDING

Target behavior:

- first-class `story` conversation subtype;
- one persistent private conversation per `(game, player, character)` across multiple story arcs;
- immutable per-message storyline/event provenance;
- stable character identity and authored body;
- idempotent server-owned delivery;
- Player sees character name rather than generic `System`;
- story conversations are initially read-only;
- Admin can inspect/moderate but cannot author fake character messages;
- story-thread membership cannot be widened through Admin participant controls;
- moderation suppression does not stall the entire storyline.

Prepared implementation package from the prior run is being reconciled and verified against this branch rather than blindly copied.

### S2 — Structured narrative response windows

Status: COMPLETE ON BRANCH / CONNECTED STAGING PENDING

Goal: give Players explicit authored choices without making free-form text authoritative.

Required contracts:

- stable public `interactionKey` for an authored decision window;
- 2–5 authored response options with stable `choiceKey` values;
- opens-at / closes-at lifecycle tied to authoritative story time or explicit event resolution;
- one authoritative selection per Player with exact idempotent replay;
- optional default/expiry outcome when a Player does not answer;
- immutable audit record of selected choice, source character, source story event, and resolved time;
- participant-scoped Player read endpoint;
- Player UI renders buttons/options only while the window is open;
- Admin read-only visibility of decision state unless a separately authorized correction contract exists.

Safety boundary:

- no free-form Player prose is converted to story state;
- no Admin ability to select a response on behalf of a Player through generic Messaging;
- choice submission must derive Player identity from the authenticated Player session.

### S3 — Relationship state

Status: COMPLETE ON BRANCH / CONNECTED STAGING PENDING

Goal: make recurring characters remember how the Player has treated them across the campaign.

Required state model:

- relationship keyed by `(game, player, characterKey)`;
- bounded dimensions such as trust, respect, affinity, obligation, suspicion, or equivalent authored metrics;
- deterministic deltas only through authoritative story effects;
- stable relationship flags/tiers usable by story conditions;
- no browser writes to relationship tables;
- Player presentation exposes only intentional narrative-facing state, not internal scoring unless explicitly designed.

Locked S3 design:

- metrics: `trust`, `respect`, `affinity`, `obligation`, `suspicion`, each bounded to `[-100, 100]`;
- derived overall standing tiers: `hostile`, `strained`, `neutral`, `trusted`, `allied`;
- authored `relationship_adjust` Story effect with stable `characterKey`, reason, and non-zero metric deltas;
- immutable relationship-adjustment history keyed to Story event + effect index for exact replay/idempotency;
- relationship state hydrated into `PlayerStoryContext` for later Story rules;
- relationship Story conditions may test one metric threshold or derived standing;
- relationship persistence is service-role authoritative with forced RLS and no browser write path;
- raw numeric metrics remain internal in S3; Player-facing relationship presentation is deferred until an explicit narrative presentation contract exists.

### S4 — Choice consequences and delayed callbacks

Status: IN PROGRESS

Goal: ensure a Player response changes later events, access, economics, or relationships.

Examples of supported consequence classes using existing systems:

- story flags;
- relationship deltas;
- cash/ledger adjustments;
- contract unlocks;
- policy effects;
- market/news consequences;
- world/travel restrictions or opportunities where an authoritative contract already exists;
- later message variants;
- later branch eligibility;
- delayed callback events.

### S5 — Narrative content saturation tranche

Status: PLANNED

Goal: fill dead periods and reduce repeated situations across a multi-week classroom campaign.

Content requirements:

- recurring-character arcs that cross multiple chapters;
- country-specific developments for all 10 countries;
- economic shock chains rather than isolated alerts;
- political/geopolitical developments with simulation consequences;
- business opportunities and failures;
- contract chains;
- world/travel consequences;
- multiple ending paths;
- quiet interpersonal beats between major crises;
- authored variants conditioned on Player country, finances, contracts, choices, and relationship state.

### S6 — Campaign saturation/reachability audit

Status: PLANNED

Required analysis:

- count all seeded story events and player rules;
- enumerate trigger types;
- enumerate effect diversity;
- identify unreachable/orphaned branches;
- calculate recurring-character message/choice density;
- identify dead periods with no eligible narrative beats;
- estimate repeated-content pressure for 30–40 concurrent Players;
- verify all 10 countries receive meaningful narrative attention;
- verify at least several materially different campaign paths exist;
- verify endings are reachable and mutually coherent.

### S7 — Full story acceptance

Status: PLANNED

Minimum acceptance before declaring narrative convergence complete:

- database replay/migrations pass;
- backend typecheck and Edge checks pass;
- story contract/unit tests pass;
- Player Messaging tests pass;
- Admin Messaging moderation tests pass;
- runtime storyline-loop smoke passes;
- connected staging acceptance demonstrates automatic event -> character message -> response window -> choice -> consequence -> later callback;
- exact replay produces no duplicate messages, decisions, notifications, ledger entries, or relationship mutations;
- browser payload contains no private ownership/story UUIDs;
- Admin cannot impersonate story characters;
- story-thread membership cannot be altered through generic participant controls;
- existing game/economic/world regressions remain green.

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

### Run 2026-08-10 — S1 transport and compatibility remediation

Summary: multiple fail-closed transport/compatibility runs occurred before S1 source application. Each failure was isolated to bundle transport, workflow syntax, or exact-source anchors; no partial S1 implementation was committed during those failures.

### Run 2026-08-10 — S1 recurring character messaging landed

Commit: `3d9c150d224fdc1252554e05c6614148c3027b65`

Result: SOURCE + FOCUSED REGRESSION GREEN ON BRANCH.

Implemented persistent story threads, server-owned character identity, immutable story-message provenance, moderation-safe membership, Player/Admin projections, and stock-tick runner delivery.

### Run 2026-08-11 — S2 compatibility and verification remediation

Summary: S2 required several fail-closed exact-source compatibility repairs across Player routing, dispatch, capability manifests, Player terminal integration, Player/Admin hydration, and TypeScript narrowing. Those attempts were not treated as landed source until the complete transformation and regression suite passed.

### Run 2026-08-11 — S2 structured response windows landed

Workflow run: `31436272469`  
Commit: `25aeb0bfdc7908180dcfe20e78589b7a3091a942`  
Migration: `20260810215844_add_story_structured_response_windows_v1.sql`

Result: SOURCE + FOCUSED REGRESSION GREEN ON BRANCH.

Implemented:

- optional authored response windows on `character_message` story effects;
- 2–5 stable authored choices with prompt, open/close lifecycle, and optional deterministic default;
- private immutable interaction and Player-selection records attached to the S1 story message;
- one session-derived Player selection with exact idempotent replay and divergent-key conflict;
- before-open, expired, invalid-option, hidden-message, non-story-thread, and cross-scope paths fail closed;
- effective choice derived from explicit selection or authored default after expiry without adding a scheduler;
- Player and Admin Messaging hydrate safe response state through sidecar RPCs;
- Player terminal renders authored choice controls only while open and read-only resolved/expired state afterward;
- Admin sees response state read-only and has no choose-for-Player mutation;
- Player capability and rate-limit registries contain the explicit `messageStoryChoice` / `storyChoiceSelect` boundary;
- S1 character-message behavior remains covered when no response window is authored.

Verification completed:

- `git diff --check`;
- `npm run typecheck:all`;
- `npm run test:player-messaging`;
- `npm run test:player-security`;
- `npm run test:player-capabilities`;
- `npm run test:stock-market-calendar`;
- `npm run test:admin-api`;
- `node --test scripts/admin-v2-messages.test.mjs`;
- `node --test player-terminal/tests/story-message-choice-ui.mjs`.

Remaining S2 acceptance: connected staging database replay and end-to-end Player selection acceptance before merge.

### Run 2026-08-11 — S3 roadmap/design bootstrap

Result: S3 design locked before runtime implementation.

Decisions:

- use private server-authoritative relationship state rather than story flags as a surrogate;
- preserve one relationship row per `(game, Player, characterKey)`;
- maintain immutable adjustment history for replay/audit;
- hydrate relationship state into `PlayerStoryContext` so future Story conditions can branch on it;
- keep raw numeric metrics off the browser in this tranche.

### Run 2026-08-11 — S3 implementation launched

Source head before S3 implementation workflow: `1dbe6ea17240673d2329dfd26082a7dec3e97b3a`

State at launch:

- private relationship schema body staged for CLI-generated migration placement;
- one-shot S3 implementation/verification workflow staged;
- implementation target includes schema, `relationship_adjust` effect, relationship-aware conditions, Player context hydration, Supabase writer, stock-runner dependency wiring, and focused replay/type tests.

Bookkeeping correction: a transient roadmap update accidentally condensed the ledger; the ledger was restored immediately before S3 source verification. No story runtime source was affected by that bookkeeping error.

### Run 2026-08-11 — S3 verification attempt 1

Workflow run: `31447490566`  
Workflow head: `2e3f6809a73a1982ee0752d2ef52dd84f6d453fa`

Result: FAILED AT INPUT GUARD; NO S3 SOURCE OR MIGRATION WAS APPLIED.

Findings:

- exact branch/S2 ancestry guard passed;
- the guarded S3 source-transform script was present;
- the staged SQL body was missing from the checked-out head after temporary branch cleanup;
- the workflow therefore failed before Node/Deno/Supabase setup, migration generation, source application, or tests.

Correction:

- restored a coherent S3 SQL body using the locked five-metric + derived-standing contract;
- preserved service-role authority, forced RLS, immutable adjustment history, event/effect replay identity, and story-thread relationship initialization;
- no S3 runtime source was weakened or partially committed.

### Run 2026-08-11 — S3 verification attempt 2

Workflow run: `31447702764`  
Workflow head: `23ee4272a1d34bae98585c399cf2acc7e43e3842`  
Ephemeral generated migration: `20260811005632_add_story_relationship_state_v1.sql`

Result: FAILED DURING GUARDED SOURCE TRANSFORM; NO S3 IMPLEMENTATION COMMIT WAS PUBLISHED.

Passed before failure:

- exact branch/S2 ancestry and staged-input guard;
- pinned Node, Deno, and Supabase CLI setup;
- CLI-generated S3 migration filename;
- schema body placement;
- pre-normalization of current fixture/source anchors.

Failure:

- the transform attempted to create `backend/src/domains/storylines/tests/storyRelationshipMigrationContract.test.ts`;
- the parent `backend/src/domains/storylines/tests/` directory does not currently exist;
- the transform helper used `Path.write_text()` without creating parent directories and failed with `FileNotFoundError`;
- dependency install, typecheck, and focused tests did not run.

Correction:

- hardened the temporary transform `write()` helper to create parent directories with `mkdir(parents=True, exist_ok=True)`;
- preserved the existing Story architecture and S3 behavioral contract unchanged.

Next: run a fresh S3 verification from the corrected transform SHA; do not rerun the stale attempt-2 SHA.

### Run 2026-08-11 — S3 verification attempt 3

Workflow run: `31447867568`
Workflow head: `315de96898a68d04c3098427d87d1ae31dfb072e`
Ephemeral generated migration: `20260811005947_add_story_relationship_state_v1.sql`

Result: FULL S3 SOURCE TRANSFORM APPLIED EPHEMERALLY; FAILED AT TYPECHECK; NO S3 IMPLEMENTATION COMMIT WAS PUBLISHED.

Passed before failure:

- exact branch/S2 ancestry and staged-input guard;
- pinned Node, Deno, and Supabase CLI setup;
- CLI-generated migration placement;
- guarded pre-normalization, complete S3 source transform, and post-normalization;
- `git diff --check`;
- `npm ci` with zero reported vulnerabilities.

Typecheck failure was limited to generated tests:

- `supabasePlayerStoryContextRepository.test.ts` accessed optional `relationships` without optional chaining;
- `supabaseStoryRelationshipWriter.test.ts` used a concrete fake RPC function that did not satisfy the writer client's generic RPC signature;
- no S3 runtime implementation file produced the reported compiler errors.

Correction:

- generated context test now uses optional chaining for the compatibility-optional relationship map;
- generated writer test casts its intentionally minimal fake client at the test boundary while preserving the runtime generic client contract.

Next: rerun full S3 verification and proceed to focused relationship/runtime tests if typecheck clears.


### Run 2026-08-11 — S3 verification attempt 4

Workflow run: `31447994052`
Workflow head: `9564f87caa44ced64424da36fd2a9e857ce72ad3`

Result: WORKFLOW PARSE FAILURE; ZERO JOBS CREATED; NO S3 SOURCE OR MIGRATION WAS APPLIED.

Failure:

- the temporary workflow embedded a multi-line Python string whose contents escaped the YAML block indentation;
- GitHub rejected the workflow before job creation (`jobs: []`);
- the S3 source/test typing corrections were therefore not exercised by this run.

Correction:

- moved prior-run roadmap text into a standalone Python helper;
- the verification workflow calls the helper instead of embedding multi-line Markdown inside YAML.

Next: launch a fresh S3 workflow from the corrected YAML and generated-test typing fixes.


### Run 2026-08-11 — S3 verification attempt 5

Workflow run: `31448062461`
Workflow head: `028227e3bd011a535625a29b676955a494f9e02e`

Result: FAILED DURING PRIOR-RUN ROADMAP PERSISTENCE; NO S3 SOURCE OR MIGRATION WAS APPLIED.

Failure:

- the standalone ledger helper produced Markdown hard-break trailing spaces on run metadata lines;
- `git diff --check` rejected those lines before the roadmap commit;
- Node/Deno/Supabase setup and all S3 implementation/test steps were skipped.

Correction:

- removed trailing-space hard breaks from all helper-generated roadmap entries;
- kept the standalone helper architecture so YAML remains simple and parse-safe.

Next: persist attempts 3–5 cleanly, then execute S3 verification from the generated-test typing fixes.

### Run 2026-08-11 — S3 verification attempt 6

Workflow run: `31448141052`
Workflow head: `1e0efc87596052be5b881b01150f85caafe8a160`
Ephemeral generated migration: `20260811010438_add_story_relationship_state_v1.sql`

Result: TYPECHECK + NEW S3 CONTRACT TESTS GREEN; FAILED IN EXISTING PLAYER STORY CONTEXT FIXTURE; NO S3 IMPLEMENTATION COMMIT WAS PUBLISHED.

Passed before failure:

- prior attempts 3–5 were successfully persisted to the roadmap in commit `292e9846b60ba6524606002824f5cc74205a1ee4`;
- exact branch/S2 guard and pinned toolchain;
- CLI migration generation and complete guarded S3 transform;
- `git diff --check` and `npm ci`;
- `npm run typecheck:all`;
- `npm run test:story-relationships` (2/2 passed);
- all 14 existing Story condition-engine tests;
- all 12 existing Story effect-engine tests.

Failure:

- one existing `supabasePlayerStoryContextRepository.test.ts` fixture expected checking cash `1250` but omitted the `currency_code` fields required by the current production repository contract;
- the repository correctly returned `0` because no valuation currency could be resolved;
- this was an inherited stale fixture exposed by the expanded S3 focused suite, not a relationship runtime defect.

Correction:

- fixture country profiles now carry canonical NRC/YRC currency codes;
- checking-balance rows now carry the matching currency codes;
- no production cash/banking logic was changed.

Next: rerun S3 from the corrected fixture normalization, then proceed through migration-contract and stock-story scheduler checks.

### Run 2026-08-11 — S3 verification attempt 7

Workflow run: `31448314256`
Workflow head: `5e3104f3f70dd9d1820c1a9d78c0958fe8b21010`
Ephemeral generated migration: `20260811010738_add_story_relationship_state_v1.sql`

Result: TYPECHECK + ALL FOCUSED S3 RUNTIME TESTS GREEN; FAILED ONLY AT MIGRATION-CONTRACT FILE PATH; NO S3 IMPLEMENTATION COMMIT WAS PUBLISHED.

Passed before failure:

- attempt 6 evidence persisted to the roadmap in commit `452acab1a14c84eb361daa414497ee22ac5503b2`;
- exact branch/S2 guard and pinned Node/Deno/Supabase toolchain;
- CLI migration generation and complete guarded S3 transform;
- `git diff --check` and `npm ci`;
- `npm run typecheck:all`;
- `npm run test:story-relationships` (2/2 passed);
- Player Story context repository tests (3/3 passed);
- Story condition-engine tests (14/14 passed);
- Story effect-engine tests (12/12 passed), for 29/29 in the combined focused step.

Failure:

- the migration-contract step runs with `working-directory: backend` but passed `$MIGRATION`, whose value already began with `backend/`;
- the test therefore attempted to read `backend/backend/supabase/migrations/...` and failed with `NotFound` before checking migration contents;
- the story-scheduler regression was skipped only because this path-only test step failed.

Correction:

- migration-contract invocation now passes `supabase/migrations/$MIGRATION_NAME` relative to the `backend` working directory;
- no schema, Story runtime, relationship logic, or existing system behavior is changed by this correction.

Next: rerun the complete S3 verification; if the migration contract and stock-story scheduler pass, land S3 and move to S4.

### Run 2026-08-11 — S3 relationship state landed

Workflow run: `31448458526`
Source head verified by runner: `6690a467b6b3c84b553cfca1eb12f8e5922aff27`
Migration: `20260811011033_add_story_relationship_state_v1.sql`

Result: SOURCE + FOCUSED REGRESSION GREEN ON BRANCH.

Implemented: private relationship state keyed by `(game, Player, characterKey)`; bounded trust/respect/affinity/obligation/suspicion metrics; derived standing tiers; immutable adjustment history; authored `relationship_adjust` Story effect; relationship metric/standing conditions; `PlayerStoryContext` hydration; existing Story runner wiring through `SupabaseStoryRelationshipWriter`; no browser write surface and no raw numeric Player relationship meter.

Verification: `git diff --check`, `npm run typecheck:all`, S3 contract/writer/context/condition/effect/migration tests, and `npm run test:stock-market-calendar`.

Remaining S3 acceptance: connected staging database replay plus one event -> relationship mutation -> later condition match before merge.

Next: S4 authoritative choice consequences and delayed callbacks.

### Run 2026-08-11 — S4 choice callback implementation launched

Workflow run: `31448825105`
Source head: `9e623a198bfe081496edecfda37d9e2d02d3d28b`

Locked S4 design:

- S2 remains the sole authority for Player selections and authored defaults;
- `PlayerStoryContext` will hydrate only effective choices: an explicit selection at or before Story evaluation time, or the authored default after the response window closes;
- effective choice state records whether it came from `selected` or `default`, so silence can have different consequences from an explicit answer;
- Story rules gain `player_story_choice_is` with optional source matching;
- consequential response windows should use a finite close time;
- delayed callbacks are normal scheduled Story events placed after the response window closes, then branched per Player with `player_story_choice_is`;
- callback branches reuse existing Story effects such as relationship adjustment, cash/ledger, contract unlock, policy, flags, messages, and later content variants;
- no per-Player consequence timer, second scheduler, browser-written consequence state, or free-form interpretation is introduced.

Acceptance target for this run: demonstrate a due Story event consuming an authoritative prior choice and applying an existing effect only to the matching Player branch.

## Run-completion rule

Every story implementation/verification run must update this file before the run is considered complete. Failed runs are recorded with the exact stage and blocker; successful runs record the exact migration/verification boundary and next workstream.