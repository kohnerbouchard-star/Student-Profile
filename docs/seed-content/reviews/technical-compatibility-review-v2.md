# Technical Compatibility and Data Safety Review v2

Review status: changes still required; documentation architecture approved
Supersedes for current status: `technical-compatibility-review-v1.md`
Scope reviewed: compatibility matrix, resolution model, classroom operation, interactions, rubrics, current backend country and stock contracts, Admin creation adapter, Player runtime audits

## Executive finding

Iteration 2 closes the documentation-level compatibility gap. The new matrix identifies authoritative current fields, narrow support, planned concepts, and blocked mechanics. It confirms that country economic snapshots and stock infrastructure can support meaningful pilot economics, while story persistence, interaction responses, collective decisions, redemption, advanced banking, progression, and several Contract behaviors remain unsupported or unverified on the audited `main` baseline.

No implementation should begin until the remaining backend and currency boundaries are resolved.

## Resolved findings

### T-01: Field-level compatibility matrix

Status: resolved for first audit

`13-current-system-compatibility-matrix.md` maps:

- countries;
- difficulty;
- country snapshots;
- event impacts;
- assignments;
- currencies;
- stocks;
- Contracts;
- Store;
- inventory and redemption;
- banking;
- progression;
- notifications;
- story state;
- interactions;
- locations;
- stable IDs;
- seed format.

### T-06: Event effect classification

Status: substantially resolved

Pilot concepts are now classified as:

- directly supported country-snapshot delta;
- supported through stock country/sector/ticker shock;
- metadata that may motivate supported deltas;
- planned narrative state;
- blocked mechanical state.

### T-07: Collective resolution

Status: resolved for first pilot operation

The Meridian model supports instructor-synthesis mode and does not require an automatic voting engine. Future deterministic aggregation uses the same conditions when persistence exists.

### T-02: Story and event persistence

Status: partially resolved

Country event-impact records support event key, name, type, summary, stat deltas, snapshots, and timestamps. This is sufficient for bounded economic event application but not a full story engine.

Remaining unsupported or unverified:

- arc instances;
- stage persistence;
- branching response persistence;
- delayed consequences;
- character relationship;
- terminal resolution;
- follow-up selection.

### T-03: Pilot Contract field mapping

Status: partially resolved

Current Admin creation supports the core instructional Contract shape. Story chain, prerequisite enforcement, event-instance binding, reputation, and grace behavior remain planned.

### T-05: Currency and ECO

Status: partially resolved

ECO is authoritative stock-trading cash. Ten local currencies are authoritative country currencies. Cross-system transaction behavior remains open.

## Remaining blockers

### T2-01: Backend reconciliation baseline

The Player runtime audit states production cutover is blocked pending the authoritative backend integration. The compatibility matrix must be rerun after PR #158 or its replacement is merged.

### T2-02: Currency flow

Attendance, Contract rewards, Store purchases, ledger accounts, conversion, and transaction snapshots require direct code and schema audit.

### T2-03: Stable content-ID persistence

Still unresolved:

- owning table or registry;
- uniqueness;
- version;
- replacement;
- metadata versus dedicated column;
- relationship to UUIDs and existing keys.

### T2-04: Event application and idempotency route

The country contracts define event-impact records, but implementation must verify:

- authoritative apply route or RPC;
- authorization;
- allowed fields;
- idempotency;
- replay protection;
- rollback or compensating behavior;
- audit reads.

### T2-05: Narrative persistence strategy

Choose one for the pilot:

1. instructor-led sequencing with content manifests and no persistent branching state;
2. minimal session story-state model;
3. full story/event/interaction model in a later backend tranche.

Do not create a client-only story engine.

### T2-06: Contract cancellation and event binding

Current Contract lifecycle must be inspected before representing:

- event-instance requirement;
- automatic close on story transition;
- accepted-work grace;
- chain unlock;
- revision preserving one reward.

### T2-07: Redemption, banking, and progression

Remain blocked or unverified until final backend capability handoff.

### T2-08: Unified content loader

Still absent. Required architecture remains domain adapters plus manifest and preflight rather than one direct cross-domain database writer.

### T2-09: Branch synchronization

The documentation branch was created before the latest `main` update and must be synchronized before merge.

## Data-safety result

Pass at documentation level.

The catalog consistently preserves:

- server-derived player and game ownership;
- no browser-submitted durable ownership UUID;
- session-scoped mutable state;
- append-only financial history;
- idempotent rewards and transactions;
- fixture separation;
- no tactical cyber content;
- fail-closed unsupported capabilities.

## Scope result

Pass.

The branch remains documentation-only and does not collide with active backend, Admin, or Player implementation work.

## Required next work

1. Re-audit after backend reconciliation merges.
2. Audit currency paths.
3. Audit event-application route and idempotency.
4. Audit pilot Contract lifecycle against current backend.
5. Decide content-ID persistence.
6. Select minimal narrative persistence strategy.
7. Design manifest and domain adapter interfaces without implementation.
8. Synchronize branch with `main`.
9. Run repository scope and reference validation.

## Approval gate

Documentation architecture is approved for continued content production. Technical seeding, migrations, or runtime integration remain blocked by T2-01 through T2-06.