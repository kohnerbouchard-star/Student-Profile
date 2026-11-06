# FND — Shared foundation and scope control

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Make seven product improvements composable without starting another platform rewrite.

## Verified starting point and limits

Planning baseline is main at the recorded SHA, freshly resolved through GitHub on the planning date. No live runtime, migration, deployment, or performance certification was performed for this roadmap. The previous audit overstated two gaps: PR #643 already provides intent/topic-aware character replies and relationship memory; installed local-control handlers already implement export, Market search, and chart-range changes.

## Ownership and integration boundaries

Retain the modular monolith, existing authenticated Player/Admin boundaries, canonical Banking/FX, Inventory, Contracts, Market, Business, World, Story, Messaging and Progression owners. This is a coordination layer, not a new service, database, event bus or universal workflow interpreter.

## Candidate records and interfaces

An evidence-backed ownership map; versioned clock policy; an integration contract; a fixture registry; an explicit source/implementation/merge/runtime evidence manifest. These are mostly documents and adapters, not necessarily new tables.

Existing domain commands remain the only economic writers. New interfaces in this pack are candidate semantic names; exact route and table names require FND-01 collision review.

## Content and fixture scope

Use synthetic identities and deterministic fixtures. Never copy actual student messages, real household data, credentials, or production records into development evidence.

## Explicit exclusions

No repository write, pull request, merge, migration execution, scheduler change, secret change or deployment is authorized by creation of this planning pack. Phase 15 remains a separate release program.

## Milestones

### FND-01 — Reconcile the live baseline and assign one owner per capability

**Dependencies:** None. **Relative size:** S. **Status:** PLANNED.

**Implementation scope.** Resolve main and the authoritative roadmap/checkpoint again at implementation time. Inventory live code paths, migrations, public contracts, existing branches and open PRs for every affected feature. Follow capture-phase handlers and installed modules rather than treating fallback strings as executed behavior. Classify each proposed item as reuse, extend, new, or remove. Reconcile the existing EXP-MKT authority rather than creating a competing market roadmap. Record all shared-file owners and the source SHA.

**Player and Admin experience.** Review existing Player routes, Admin permissions and capability publication together. Produce an as-is/to-be matrix with user-visible gaps and a concrete reproduction where a defect is claimed. Keep unsupported attachments separate from broken functionality.

**Acceptance and adversarial tests.** Every new table/route proposal has a searched existing equivalent; every claimed bug has a source trace or reproducible case; no open PR ownership conflict is unresolved; all seven tracks have a named engineering owner and product reviewer.

**Exit gate.** A reviewed scope and ownership manifest exists. The rest of the milestones remain PLANNED, and no implementation is described as complete.

### FND-02 — Define time, pause, absence and effective-date semantics

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Use the existing game IANA timezone; do not introduce a second clock authority. Define UTC storage, local display, effectiveAt, occurredAt, publishedAt, dueAt and economic-period keys. Preserve the daily 08:00 FX fixing and exchange-specific trading calendars. Specify how wages, rent, loans, story deadlines and training behave on pause/resume, weekends, school breaks and outages. Distinguish pausing a game from an individual not logging in. Document deterministic same-boundary ordering and late-input treatment.

**Player and Admin experience.** Players see local due dates, coverage periods and what continues while absent. Admin can preview the effect of a proposed calendar/pause setting before it affects unopened periods. A setting change never silently rewrites existing agreements.

**Acceptance and adversarial tests.** Exercise daylight-saving transitions, leap day, month-end, midnight and 07:59:59/08:00 boundaries; a 7/14/30-day absence; paused versus unavailable service; delayed execution. Already-earned money remains owed; paused intervals do not become surprise bill backlogs.

**Exit gate.** One clock-policy contract is approved and consumed by new features, with no change to already-certified FX behavior.

### FND-03 — Create the shared acceptance harness without replacing CI

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Extend existing tests with synthetic game/player factories, canonical account and Inventory setup commands, a controllable test clock and event trace collection. Establish unit, database, connected-browser, adversarial, economic-simulation and accessibility layers. Persist random seeds and policy/content versions. Use failure injection at actual commit boundaries. Keep a compact source-to-user-action coverage manifest; do not substitute string-search tests for database or browser outcomes.

**Player and Admin experience.** A review report separates engineering correctness, economic calibration and usability. Admin-facing diagnostics use public operation identifiers; internal trace details remain restricted. The same scenario can be rerun without production credentials.

**Acceptance and adversarial tests.** The harness proves replay, divergent-key rejection, cross-game denial, stale-state recovery, genuine simultaneous writes and post-commit lost-response recovery. Two fresh migration replays and rebuilt-schema checks remain required for schema work. Bound deadlock/serialization retries rather than claiming transactions cannot fail.

**Exit gate.** A deterministic fixture and evidence format is available to all tracks; no existing required gate or architecture ceiling is weakened.

### FND-04 — Agree minimal cross-domain consequence and access contracts

**Dependencies:** `FND-02`, `FND-03`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Specify a small versioned event envelope: event ID, aggregate/version, source owner, server-derived scope, effective time, causation/correlation, policy version and public receipt reference. Reuse the durable outbox and consumer deduplication facilities already present, extending only demonstrated gaps. Distinguish an atomic money/ownership transaction from asynchronous news, relationship and progression consequences. Define a read-only access-decision interface with eligibility, missing requirements and denial reasons; the receiving domain still authorizes the action.

**Player and Admin experience.** All material actions follow inspect, review, confirm, receipt and consequence. Display committed-but-refreshing and delayed consequence states accurately. No generic success toast may imply that an asynchronous reward or NPC reply has already completed.

**Acceptance and adversarial tests.** An at-least-once delivery creates one business effect; conflicting payloads cannot reuse a source ID; projection failure cannot reverse a successful payment; replay after pause returns the original receipt without issuing a new benefit. Unauthorized domains cannot emit trusted award events.

**Exit gate.** Only the interfaces needed by the first vertical slice are adopted. There is no parallel balance, scheduler, XP ledger, relationship store or business authority.

## Source basis

**R1 — Fresh main branch resolution.** Resolved on 2026-09-20 to 22dc9ce5023eb200a6608d5bb90a9ac30cb36c90; not a runtime certification. Source: `https://api.github.com/repos/kohnerbouchard-star/Student-Profile/branches/main`.

**R2 — Merged PR #643 — durable story-character reply engine.** Merged 2026-08-18. Metadata describes existing intent/topic classification, memory, queue, coalescing, retry and kill switch. Historical staging claims were not rerun for this plan. Source: `https://github.com/kohnerbouchard-star/Student-Profile/pull/643`.

**R3 — Installed local-controls implementation.** Export, local Market search and range handler; range limits currently expressed as sample counts; CSV amount conversion uses Number. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/features/local-controls/local-controls-flow.js`.

**R4 — Player entrypoint wiring.** Imports and installs installLocalControlsFlow; verified by current-main search excerpts. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/main.js`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.



---
