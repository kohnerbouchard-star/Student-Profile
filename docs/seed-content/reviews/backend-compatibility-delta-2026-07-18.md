# Backend Compatibility Delta — 2026-07-18

Status: active coordination record
Seed-content branch: `agent/seed-content-foundation-v1`
Backend branch: `agent/player-backend-reconciliation-v2`
Backend PR: #158
Authority rule: unmerged PR behavior is not treated as available on `main`

## Purpose

Record changes in Backend PR #158 that materially affect seeded-content integration planning after the initial compatibility audit.

This file is a delta, not a replacement for the full compatibility matrix. It prevents the content catalog from either ignoring active backend progress or prematurely depending on unmerged contracts.

## Main-branch movement

`main` advanced from the Player runtime-audit merge to the merged Admin shape-accurate skeleton tranche.

The new main commit changes Admin-owned paths and does not overlap `docs/seed-content/**`.

The seed-content branch is currently behind `main` and must be synchronized before merge, but there is no identified content-path conflict from the Admin merge.

## Backend PR #158 progress

The Backend reconciliation PR now reports the following completed or active tranches.

### Completed: authenticated player request scope

The Backend derives:

- immutable player UUID;
- game scope;
- active player-session scope;
- ownership and authorization context.

It rejects missing, expired, revoked, inactive, wrong-game, structurally mismatched, and ownership-injected requests.

Seed implication:

- Player-facing content records must never select ownership UUIDs;
- assignments, holdings, notifications, redemptions, and decisions remain server scoped;
- stable content IDs are definition references, not ownership identifiers.

### Completed on the Backend branch: World country list

Reported route:

`GET /players/me/world/countries`

Seed implication after merge and contract verification:

- the ten country definitions can map to a browser-safe country-list read model;
- country ordering, stable public identifier, display name, currency, and summary fields must be checked against the final DTO;
- no country content should assume every catalog field is returned in the list response;
- player assignment remains authoritative and separate from the reusable country definition.

Current status:

- available only on the Backend PR branch;
- not authority for production content until merged and re-audited.

### Completed on the Backend branch: World country detail

Reported route:

`GET /players/me/world/countries/:countryId`

Seed implication after merge and contract verification:

- country briefings, indicators, strategic strengths, vulnerabilities, and current event summaries may have a connected read path;
- the final public `countryId` representation must be used rather than guessed from database UUIDs;
- reusable lore and current session economics must remain separate in the DTO;
- unsupported catalog sections should remain omitted or visibly unavailable rather than fabricated.

Current status:

- available only on the Backend PR branch;
- response mapping must be compared field by field after merge.

### Completed on the Backend branch: World news

Reported route:

`GET /players/me/world/news`

Seed implication after merge and contract verification:

- Meridian announcement, capacity warnings, corrections, crises, and terminal outcome reports may map to a connected Player news surface;
- fact status, publication time, country scope, event linkage, correction lineage, and source labels must be checked against the final DTO;
- a reusable news template still requires a game-session publication instance;
- news remains read-only evidence and is not authority to mutate economic state.

Current status:

- available only on the Backend PR branch;
- publication creation and event-to-news orchestration remain unverified.

### Active checkpoint: Market asset list

Reported route work:

- authenticated Market asset-list route;
- parser, service, repository, DTO, dispatcher, and focused tests;
- browser-facing `assetId` uses normalized ticker rather than internal stock-asset UUID.

Seed implication after checkpoint verification and merge:

- existing template enrichments for AURA, XFIN, and IRST can map through public ticker identity;
- content must not expose internal stock UUIDs;
- company narrative enrichment must remain separate from authoritative price and settlement state;
- Market detail, bounded history, order integration, and watchlists remain later tranches;
- no seeded interaction should imply a Player can trade merely because asset listing is available.

Current status:

- checkpoint in progress;
- not yet treated as completed in the seed compatibility matrix.

## Capability status

The authoritative capability manifest remains later in PR #158's sequence.

Therefore:

- content cannot infer support from a visible Player route;
- executable manifest records must remain blocked until capabilities and versions are merged;
- definition-only catalog records may continue to be authored;
- frontend visibility and backend operability remain separate concepts;
- unsupported actions must fail closed.

## Contract status

Atomic Player Contract acceptance remains later in the Backend sequence.

Therefore the Meridian five-Contract chain remains:

- fully specified as authored content;
- suitable for manual classroom operation;
- not mechanically executable as a Player chain;
- blocked on prerequisite, acceptance, assignment, event-instance, revision, cancellation, and outcome mapping.

## Inventory and redemption status

Inventory read and redemption remain later Backend tranches.

Therefore:

- Store and item concepts can be definition-only;
- no redemption interaction may be marked connected;
- Admin fulfillment workload remains a design estimate;
- donor PR #143 is reference evidence only and does not establish current-main support.

## Narrative persistence status

PR #158's current published sequence does not yet establish:

- story-arc instance persistence;
- interaction-response persistence;
- collective decision aggregation;
- delayed narrative consequence scheduling;
- terminal story outcome persistence.

The Meridian resolution model therefore remains manual-compatible by design and must not be represented as automated.

## Event-application status

Country and news reads do not establish an event-application mutation.

The seed-content event-application contract remains blocked until the Backend proves or implements:

- authorized event-instance transition;
- bounded country effects;
- idempotent application;
- concurrency control;
- recovery and correction;
- audit and replay.

## Updated readiness classification

| Domain | Current-main status | Backend PR status | Seed-content status |
|---|---|---|---|
| Countries list | not yet reconciled on main | completed on PR branch | mapping candidate; re-audit after merge |
| Country detail | not yet reconciled on main | completed on PR branch | mapping candidate; re-audit after merge |
| World news read | not yet reconciled on main | completed on PR branch | publication-template mapping candidate |
| Market asset list | current stock foundations exist | implementation checkpoint in progress | enrichment candidate by ticker |
| Market detail/history | not authoritative for Player integration | planned | blocked |
| Watchlists | not authoritative | planned | blocked |
| Contract acceptance | current Admin lifecycle exists; Player acceptance unresolved | planned | blocked |
| Inventory read | current inventory foundations exist | planned | blocked for Player connected content |
| Redemption | donor implementation only | planned reconciliation | blocked |
| Capability manifest | not authoritative | planned | blocks executable pack gating |
| Narrative state | unsupported or unverified | not in current completed tranche | manual-compatible only |
| Event application | data structures partially exist | unverified | specification only |

## Required re-audit trigger

Run a field-level compatibility re-audit when any of the following occurs:

1. PR #158 merges;
2. World DTO contracts change;
3. Market asset-list checkpoint is marked green;
4. capability manifest lands;
5. Contract acceptance lands;
6. Inventory or redemption lands;
7. final Player runtime integration begins.

The re-audit must use merged code and tests as authority, not the PR description alone.

## Coordination conclusion

The Backend is progressing in the correct sequence for the content catalog.

The content branch should continue definition, validation, and manifest design work, but should not create executable seed mappings until the relevant Backend tranches merge and their DTOs and mutation contracts are verified.