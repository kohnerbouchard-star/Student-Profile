# Econovaria Complete Development Roadmap

**Document ID:** ECON-BETA-ROADMAP-V1  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Authoritative path:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Program state:** Active; beta scope is not locked until the product owner explicitly locks it  
**Last baseline audit:** 2026-07-18  
**Current audited main baseline:** `14adbc525995cc931998244c442a23b542f43c7a`

---

## 1. Purpose

This document is the authoritative completion ledger and execution roadmap for Econovaria.

Every future ChatGPT, Codex, human developer, or other implementation agent working on Econovaria must:

1. Read this file before claiming a feature is complete.
2. Audit the current repository, active branches, pull requests, migrations, tests, and deployed runtime against this file.
3. Update this file whenever implementation status, sequencing, blockers, scope, or acceptance criteria change.
4. Provide evidence for every completion claim.
5. Continue through the roadmap in dependency order unless the product owner changes priorities.
6. Treat new product ideas as scope intake until the product owner explicitly locks the beta scope.

This file records completion status. The source code, migrations, tests, immutable commits, staging evidence, and approved runtime evidence remain the proof that a status is true.

---

## 2. Status vocabulary

Use only these statuses in roadmap updates.

| Status | Meaning |
|---|---|
| `VERIFIED_COMPLETE` | Merged into `main`, required tests pass, and any required staging/runtime evidence exists. |
| `IMPLEMENTED_NOT_MERGED` | Code or documentation exists on an active branch or PR but is not authoritative on `main`. |
| `IN_PROGRESS` | Active work exists but acceptance criteria are not yet satisfied. |
| `PLANNED` | Approved work is defined but implementation has not started. |
| `BLOCKED` | Work cannot proceed safely until a named dependency is completed. |
| `RE_AUDIT_REQUIRED` | Prior implementation exists, but its current correctness or authority must be reverified. |
| `DEFERRED_BY_OWNER` | The product owner explicitly deferred the item. Agents may not assign this status themselves. |
| `REMOVED_BY_OWNER` | The product owner explicitly removed the item from the product. |
| `NOT_FOUND` | An audit found no implementation or approved plan. |

### Completion evidence required

A feature may be marked `VERIFIED_COMPLETE` only when the roadmap entry includes, as applicable:

- merged pull request number;
- immutable commit SHA;
- implementation file paths;
- migration version;
- route or RPC contract;
- automated test names and passing workflow;
- desktop, compact, narrow, or mobile browser evidence;
- staging deployment evidence;
- migration replay and lint evidence;
- security and cross-game isolation evidence;
- idempotency evidence for economic writes;
- rollback or recovery evidence for release-critical work;
- product-owner approval when acceptance is subjective.

A feature that exists only in preview fixtures, design documents, an unmerged branch, a donor branch, or an undeployed migration is not `VERIFIED_COMPLETE`.

---

## 3. Scope and change-control rules

1. **Beta scope is not locked.** New requested capabilities remain eligible for this roadmap until the product owner explicitly announces a scope lock.
2. New ideas must be added to the `Scope Intake` section with an impact assessment before implementation.
3. Do not silently move requested work into post-beta scope.
4. Do not silently remove, shrink, or replace accepted product behavior.
5. Once the product owner locks beta scope, new noncritical ideas move to the post-beta sequence unless required for security, data integrity, legal compliance, accessibility, or release reliability.
6. Do not create a replacement branch when an active branch already owns the capability.
7. Donor branches are evidence sources, not automatic merge targets.
8. No manual production schema edits are allowed as a normal implementation path.
9. Every economic write must remain transactional, game-scoped, server-authoritative, and idempotent.
10. The accepted Admin v606 and Player Terminal visual systems must not be redesigned during backend, security, or release work unless the product owner requests a redesign.

---

## 4. Base-game definition

The base Econovaria game loop is:

> An administrator creates and configures a game. A player joins as a new immigrant, receives a country and starting package, earns money through attendance and Contracts, buys Store items, owns or redeems inventory, follows news and story events, trades financial assets, builds wealth and reputation, and experiences the economic consequences of rivalry, war, adaptation, and reconstruction while the administrator supervises, corrects, and audits the simulation.

The first beta must prove this loop end to end with authoritative persistence.

---

## 5. Current program snapshot

### Active authoritative development

| Program | Current status | Authority |
|---|---|---|
| Backend player reconciliation | `IN_PROGRESS` | PR #158, branch `agent/player-backend-reconciliation-v2` |
| Seed-content foundation | `IN_PROGRESS` | PR #163, branch `agent/seed-content-foundation-v1` |
| Player safe session-expiry exit | `VERIFIED_COMPLETE` | PR #165 merged as `4e20a5993da925463887bc23cc707be5679ccd20`; suspended-session correction PR #167 merged as `14adbc525995cc931998244c442a23b542f43c7a` |
| Admin safe session-expiry exit | `VERIFIED_COMPLETE` | PR #166 merged as `c2b3f315901698359a4bfb3dc0eb3e63c719d8a5` |
| Admin shape-accurate skeletons | `VERIFIED_COMPLETE` | PR #162 merged |
| Player Terminal skeleton hardening | `VERIFIED_COMPLETE` | merged on `main` |
| Player Terminal capability tranche | `VERIFIED_COMPLETE` for frontend behavior only | PR #156 merged |
| Contracts, attendance rewards, and Admin stabilization | `VERIFIED_COMPLETE` | PR #138 merged |
| Store quote/purchase flow | `VERIFIED_COMPLETE` for frontend behavior | PR #145 merged |
| Production integration donor | `IMPLEMENTED_NOT_MERGED`; donor only | PR #141 |
| Inventory-redemption donor | `IMPLEMENTED_NOT_MERGED`; donor only | PR #143 or successor donor work |

### 2026-07-18 repository reconciliation

- `main` is `14adbc525995cc931998244c442a23b542f43c7a`, which includes merged session-expiry PRs #165, #166, and #167 and supersedes the original `c7c949482b78c5960173e25e487f3aba2448d10e` roadmap baseline.
- PR #158 remains the only active Backend reconciliation authority. Its audited remote head before the current capability-manifest tranche was `67cc25cced3000fae9a624c71e8c1093879867a2`; it had green Backend Typecheck #970, Repository Quality #306, Admin API Check #584, and Database Replay #112 evidence. Commit `7d068bf31a67614bf31bc0ae45f564f4a18556a3` synchronized the existing branch with `14adbc525995cc931998244c442a23b542f43c7a` and published the capability-manifest tranche for PR verification.
- PR #163 remains the only seed-content authority. It is still design/documentation work and does not yet provide an executable importer, an applied migration, a reproducible simulation run, or staging activation evidence.
- PR #165 merged the Player proactive expiry exit with Player Terminal Verify #107 and Repository Quality #325 passing.
- PR #166 merged the Admin expiry exit as `c2b3f315901698359a4bfb3dc0eb3e63c719d8a5`; head `5c66b23eddee12203caa932b61bcf28e93b07cae` passed Repository Quality #329, Admin Shell Smoke #594, and Branch Hygiene #15.
- PR #167 merged the Player suspended/background-resume correction as `14adbc525995cc931998244c442a23b542f43c7a`; head `de486c402ca9512fc31c7841378b1b31c247c7f2` passed Repository Quality #342, Player Terminal Verify #109, and Branch Hygiene #16.
- PRs #141 and #143 remain donor/reference work only. Their branches do not become authority through direct merge.
- No isolated staging deployment, restore rehearsal, or current runtime-cutover evidence was found during this audit; all staging-dependent items remain open.

### Current release condition

The application is not yet approved for beta or production runtime cutover because the following remain unresolved:

- authoritative backend reconciliation;
- Player Terminal runtime adapter installation;
- capability manifest validation;
- Contract acceptance;
- inventory redemption;
- executable seed content;
- migration-history reconciliation;
- legacy runtime containment;
- isolated staging;
- backup and restore rehearsal;
- final end-to-end beta verification.

---

# PART I — CURRENT CAPABILITY LEDGER

## 6. Identity, authentication, and game sessions

**Overall status:** `VERIFIED_COMPLETE`, with logout/runtime integration still active under Backend reconciliation.

### Complete

- [x] Administrator Supabase authentication.
- [x] Transferred Admin session handling.
- [x] Admin refresh and expiry handling.
- [x] Fifteen-minute Admin idle sign-out.
- [x] Safe Admin redirect after session expiry.
- [x] Player session bootstrap and profile read.
- [x] Game/session code generation.
- [x] Game/session code copy.
- [x] Game/session code reset.
- [x] Player creation.
- [x] Generated or custom Player ID.
- [x] Separate Access Code.
- [x] Hash-only Access Code persistence after issuance.
- [x] Player Access Code reset.
- [x] Player-facing identity editing.
- [x] Player soft archival.
- [x] Immutable internal player UUID.
- [x] Mutable browser-facing Player ID/RFID.
- [x] Game ownership enforcement for Admin routes.
- [x] Cross-game isolation.
- [x] Balanced player-country assignment.
- [x] Country-assignment lock.
- [x] Stale Player Terminal session-work rejection.
- [x] Invalid-session fail-closed behavior.

### Remaining

- [ ] `BETA-AUTH-001` Merge authoritative player logout route. `IMPLEMENTED_NOT_MERGED` on PR #158 as `POST /players/me/session/logout` at `67cc25cced3000fae9a624c71e8c1093879867a2`.
- [ ] `BETA-AUTH-002` Connect Player Terminal Logout to the reviewed host revocation lifecycle.
- [x] `BETA-AUTH-003` Verify both Player and Admin session expiry return safely to login. `VERIFIED_COMPLETE` through merged PRs #165, #166, and #167 with Player Terminal Verify #109, Admin Shell Smoke #594, Repository Quality #342/#329, and Branch Hygiene #16/#15.
- [ ] `BETA-AUTH-004` Add final brute-force, replay, revoked-session, expired-session, and cross-game authorization matrix.
- [ ] `BETA-AUTH-005` Add shared rate limiting by IP, identity, game, and action.
- [ ] `BETA-AUTH-006` Verify no credentials, token hashes, session tokens, or internal UUIDs appear in browser output, logs, fixtures, artifacts, or errors.

### Authoritative capability manifest

- [ ] `BETA-CAP-001` Publish authenticated `GET /players/me/capabilities` from PR #158. `IMPLEMENTED_NOT_MERGED` on PR #158 at `7d068bf31a67614bf31bc0ae45f564f4a18556a3`.
- [ ] `BETA-CAP-002` Version the manifest schema and capability mapping independently. `IMPLEMENTED_NOT_MERGED` with schema `1` and manifest `2026-07-18.1`.
- [ ] `BETA-CAP-003` Advertise only reviewed, implemented Backend operations and represent unsupported operations as unavailable. `IMPLEMENTED_NOT_MERGED`; legacy UUID-bearing routes, market orders, Contract acceptance, redemption, and Store writes remain unavailable.
- [ ] `BETA-CAP-004` Keep the manifest private/no-store, session-scoped, game-isolated, and free of internal UUIDs. `IMPLEMENTED_NOT_MERGED` with focused security coverage.
- [ ] `BETA-CAP-005` Add exact route, method, malformed-path, unsupported-method, expired, revoked, wrong-game, UUID-injection, and response-contract tests. `IMPLEMENTED_NOT_MERGED` at `7d068bf31a67614bf31bc0ae45f564f4a18556a3`; eight focused tests and 45 market-regression tests pass locally, with PR CI evidence pending.
- [ ] `BETA-CAP-006` Reconcile the manifest after every later Phase 1 tranche and before PR #158 merges.

---

## 7. Administrator console

**Overall status:** `VERIFIED_COMPLETE` for primary classroom operations; beta hardening remains.

### Complete pages

- [x] Overview.
- [x] Players.
- [x] Contracts.
- [x] Store.
- [x] Marketplace read-only page.
- [x] Attendance.
- [x] Logs.
- [x] Settings.
- [x] Account Profile.
- [x] Preferences.
- [x] Notifications settings surface.
- [x] Security.
- [x] Help.
- [x] Games.

### Complete reads and writes

- [x] Dashboard metrics and recent activity.
- [x] Player roster, details, history, flags, and settings.
- [x] Add Player, identity edit, Access Code reset, and archive.
- [x] Player ledger adjustment.
- [x] Attendance scanning, correction, notes, reward adjustments, and day locking.
- [x] Contract create, publish, review, revision, rejection, approval, duplication, archive, and reward audit.
- [x] Store create, edit, status, restock, reprice, and archive.
- [x] Settings presets, custom settings, grouped reset, and explicit Save.
- [x] Audit log flagging, related-record reads, and export jobs.
- [x] Responsive desktop, compact, and narrow layouts.
- [x] Route-accurate structural loading skeletons.
- [x] Unsupported-operation fail-closed states.

### Remaining beta work

- [ ] `BETA-ADMIN-001` Complete keyboard-only navigation coverage.
- [ ] `BETA-ADMIN-002` Complete focus trap, Escape, and focus restoration for every major modal and drawer.
- [ ] `BETA-ADMIN-003` Remove remaining obsolete credential-dialog renderer if still present.
- [ ] `BETA-ADMIN-004` Remove the first global request interception layer and lower the architecture ratchet.
- [ ] `BETA-ADMIN-005` Replace broad session mount observation with an explicit mounted event.
- [ ] `BETA-ADMIN-006` Add explicit loading, loaded, refreshing, stale, empty, and failed data-state contracts.
- [ ] `BETA-ADMIN-007` Add staging-backed Admin smoke after isolated staging exists.
- [ ] `BETA-ADMIN-008` Add the inventory-redemption review queue after Backend handoff.
- [ ] `BETA-ADMIN-009` Add emergency game mutation pause/resume controls.
- [ ] `BETA-ADMIN-010` Verify start, pause, resume, end, archive, session revoke, and join-code reset lifecycle.

---

## 8. Attendance and classroom economy

**Overall status:** `VERIFIED_COMPLETE`.

### Complete

- [x] Present, late, absent, and excused attendance states.
- [x] Configurable present and late base rewards.
- [x] Difficulty income modifier.
- [x] Player-country exchange-index conversion.
- [x] Local player-currency reward.
- [x] Server-owned reward arithmetic.
- [x] Ledger issuance.
- [x] Duplicate-scan prevention.
- [x] Idempotent attendance reward.
- [x] Manual correction and notes.
- [x] Reward adjustment.
- [x] Attendance-day lock and unlock.
- [x] History filtering, search, pagination, and export.
- [x] Scanner auto-rearm.
- [x] Name-first identity.
- [x] Compact timestamp.
- [x] Game-isolated Settings drafts and saves.

### Remaining beta verification

- [ ] `BETA-ATT-001` Run staging evidence with a non-`1.0000` exchange index.
- [ ] `BETA-ATT-002` Verify one reward and no duplicate ledger entry after repeated scan.
- [ ] `BETA-ATT-003` Verify attendance behavior under game pause, ended game, network retry, and session expiry.
- [ ] `BETA-ATT-004` Verify scanner burst behavior under rate limiting.

---

## 9. Contracts

**Overall status:** `VERIFIED_COMPLETE` except authoritative Contract acceptance and final connected runtime verification.

### Complete

- [x] Contract templates and game-session Contracts.
- [x] Teacher, system-seeded, and story-created source model.
- [x] Objectives, instructions, materials, links, forms, quizzes, submission requirements, scheduling, and targeting.
- [x] Cash rewards.
- [x] Store-item rewards.
- [x] Available, scheduled, active, submitted, revision-required, approved, completed, rejected, and expired states.
- [x] Evidence submission and draft preservation.
- [x] Quiz answer-key redaction.
- [x] Admin review, revision, resubmission, rejection, and approval.
- [x] Atomic cash and inventory reward issuance.
- [x] Idempotent repeated approval.
- [x] Reward audit.
- [x] Committed-success handling when refresh fails.

### Remaining

- [ ] `BETA-CONTRACT-001` Implement atomic `POST /players/me/contracts/:contractId/accept`.
- [ ] `BETA-CONTRACT-002` Reject acceptance for unavailable, expired, non-targeted, already-active, or completed Contracts.
- [ ] `BETA-CONTRACT-003` Make acceptance retry-idempotent.
- [ ] `BETA-CONTRACT-004` Connect Player Terminal accept action to the authoritative route.
- [ ] `BETA-CONTRACT-005` Verify full connected flow: available → accept → submit → revision → resubmit → approve → reward.
- [ ] `BETA-CONTRACT-006` Add introductory tutorial Contract chain.
- [ ] `BETA-CONTRACT-007` Expand seeded Contract library by country, difficulty, economic system, and story phase.
- [ ] `EXP-CONTRACT-001` Add safely executable attendance, stock, inventory, player-state, and story-flag requirements.
- [ ] `EXP-CONTRACT-002` Add story-runner Contract creation and progression integration.

---

## 10. Store and purchasing

**Overall status:** `VERIFIED_COMPLETE` for core purchase flow.

### Complete

- [x] Store catalog and metadata.
- [x] Country-aware price foundation.
- [x] Exchange-index conversion.
- [x] Stock quantity.
- [x] Item availability and status.
- [x] Admin create, edit, restock, reprice, status, and archive.
- [x] Player quantity selection.
- [x] Authoritative quote.
- [x] Quote expiration.
- [x] Purchase review and explicit confirmation.
- [x] Idempotent settlement.
- [x] Ledger debit.
- [x] Inventory credit.
- [x] Purchase receipt.
- [x] Post-purchase authoritative refresh.
- [x] Committed-success preservation.

### Remaining

- [ ] `BETA-STORE-001` Verify connected catalog, quote, purchase, receipt, ledger, and inventory flow.
- [ ] `BETA-STORE-002` Verify insufficient funds, insufficient stock, expired quote, duplicate request, game pause, and ended-game behavior.
- [ ] `BETA-STORE-003` Load a bounded approved Store catalog for all ten countries.
- [ ] `BETA-STORE-004` Define Store item scarcity and difficulty rules.
- [ ] `EXP-STORE-001` Add scheduled availability, regional restrictions, event-driven scarcity, and restock policies.
- [ ] `EXP-STORE-002` Add capability-aware Store pause only if separate from the global game mutation pause.

---

## 11. Inventory, item use, equipment, materials, and redemption

**Overall status:** `IN_PROGRESS`.

### Complete

- [x] Inventory persistence.
- [x] Owned, reserved, and available quantities.
- [x] Inventory value summary.
- [x] Store metadata enrichment.
- [x] Contract item reward grants.
- [x] Inventory display in existing dashboard models.
- [x] Player Terminal inventory read model.
- [x] UUID-private browser model.
- [x] Capability-controlled item actions.

### Active Backend work

- [ ] `BETA-INV-001` Merge authenticated `GET /players/me/inventory`. `IMPLEMENTED_NOT_MERGED` on PR #158.
- [ ] `BETA-INV-002` Preserve bounded reads, public item keys, no per-item query loops, and explicit empty/unavailable states. Implemented on PR #158; merge and connected evidence remain.

### Required beta redemption workflow

- [ ] `BETA-INV-003` Define redemption state machine.
- [ ] `BETA-INV-004` Add migration for redemption request, transition, and audit history.
- [ ] `BETA-INV-005` Add atomic request/reserve RPC.
- [ ] `BETA-INV-006` Add Player redemption request route.
- [ ] `BETA-INV-007` Add Player redemption history/status read.
- [ ] `BETA-INV-008` Add Admin pending and historical queue.
- [ ] `BETA-INV-009` Add approve action.
- [ ] `BETA-INV-010` Add reject-with-reason action.
- [ ] `BETA-INV-011` Add fulfill action.
- [ ] `BETA-INV-012` Prevent invalid transitions and repeated consumption.
- [ ] `BETA-INV-013` Preserve committed success if refresh fails.
- [ ] `BETA-INV-014` Verify full connected Store → Inventory → Redemption lifecycle.

### Full item-system expansion

- [ ] `EXP-ITEM-001` Define canonical item taxonomy: consumables, materials, equipment, tools, collectibles, quest items, licenses, documents, and real-world rewards.
- [ ] `EXP-ITEM-002` Define effect contracts, duration, stacking, cooldown, scope, and audit.
- [ ] `EXP-ITEM-003` Implement safe automated consumable effects.
- [ ] `EXP-ITEM-004` Implement equipment slots and bonuses.
- [ ] `EXP-ITEM-005` Implement durability and repair if approved.
- [ ] `EXP-ITEM-006` Implement item scarcity by country, difficulty, events, and production.
- [ ] `EXP-ITEM-007` Implement materials and recipe requirements.
- [ ] `EXP-ITEM-008` Implement item-use and effect-history UI.
- [ ] `EXP-ITEM-009` Simulate balance and exploit resistance for every item effect.

---

## 12. Stock market and investments

**Overall status:** `VERIFIED_COMPLETE` for common-equity market orders and portfolio accounting; broader financial universe remains planned.

### Complete

- [x] Deterministic stock-price engine.
- [x] Game-session stock assets.
- [x] Price tick history.
- [x] Country and macroeconomic factors.
- [x] Market regimes and shocks.
- [x] Stock-market events.
- [x] Seed/copy initializer.
- [x] Stock runner and atomic tick application.
- [x] Duplicate tick prevention.
- [x] Public stock-tick realtime publication.
- [x] Market board.
- [x] Asset detail and price history.
- [x] Market news foundation.
- [x] Market buy and sell.
- [x] Ledger cash settlement.
- [x] Holdings and average cost.
- [x] Realized and unrealized profit/loss.
- [x] Order and trade history.
- [x] Portfolio totals.
- [x] Short-selling prevention.
- [x] Idempotent order execution.
- [x] Player-safe portfolio reads.
- [x] Player Terminal review, confirmation, receipt, and refresh-failure behavior.

### Active reconciliation

- [ ] `BETA-MKT-001` Merge bounded market collection and asset-detail routes. `IMPLEMENTED_NOT_MERGED` on PR #158.
- [ ] `BETA-MKT-002` Merge watchlist list/add/remove. `IMPLEMENTED_NOT_MERGED` on PR #158.
- [ ] `BETA-MKT-003` Resolve public ticker to internal runtime asset at the order boundary.
- [ ] `BETA-MKT-004` Publish capability manifest for market reads, watchlist, and market orders. Reads and watchlist are implemented on PR #158; market orders remain explicitly unavailable until `BETA-MKT-003` is satisfied.
- [ ] `BETA-MKT-005` Connect Player Terminal to authoritative market and portfolio routes.
- [ ] `BETA-MKT-006` Schedule or safely trigger market ticks in staging and beta.
- [ ] `BETA-MKT-007` Verify market closed, paused, stale price, insufficient funds, insufficient shares, duplicate order, and refresh-failure states.
- [ ] `BETA-MKT-008` Select a calibrated active subset of approximately 20–30 instruments per country.

### Full financial-market expansion

- [ ] `EXP-MKT-001` Ingest and editorially review the full 3,200-instrument library.
- [ ] `EXP-MKT-002` Build issuer master registry.
- [ ] `EXP-MKT-003` Build exchanges, sectors, industries, commodities, and reference benchmarks.
- [ ] `EXP-MKT-004` Add calibrated issuer financial statements and event exposure.
- [ ] `EXP-MKT-005` Implement corporate bonds.
- [ ] `EXP-MKT-006` Implement sovereign and agency bonds.
- [ ] `EXP-MKT-007` Implement preferred and convertible equity behavior.
- [ ] `EXP-MKT-008` Implement ETFs and holdings.
- [ ] `EXP-MKT-009` Implement listed trusts.
- [ ] `EXP-MKT-010` Implement indexes and methodologies.
- [ ] `EXP-MKT-011` Implement commodity and sector benchmarks.
- [ ] `EXP-MKT-012` Add yield curves, coupons, maturity, accrued interest, and default behavior.
- [ ] `EXP-MKT-013` Add limit orders, open-order reservations, cancellation, expiry, and fill-at-tick behavior.
- [ ] `EXP-MKT-014` Add partial fills only after the reservation and order lifecycle is proven.
- [ ] `EXP-MKT-015` Add fees, market rules, and exchange hours if approved.
- [ ] `EXP-MKT-016` Keep short selling, derivatives, and real-world feeds disabled until separately approved and modeled.

---

## 13. Banking, ledger, savings, transfers, loans, and credit

**Overall status:** `VERIFIED_COMPLETE` for cash and ledger reads; expansion remains planned.

### Complete

- [x] Append-only ledger.
- [x] Account-balance projection.
- [x] Cash balances.
- [x] Multi-currency entries.
- [x] Attendance rewards.
- [x] Contract rewards.
- [x] Store debits.
- [x] Stock settlement.
- [x] Admin adjustments.
- [x] Banking summary.
- [x] Posted transaction history.
- [x] Per-entry currency preservation.
- [x] Fake unsupported savings, credit, and transfer behavior removed from connected Player UI.

### Remaining beta work

- [ ] `BETA-BANK-001` Merge authoritative ledger route.
- [ ] `BETA-BANK-002` Connect Player Terminal Banking read model.
- [ ] `BETA-BANK-003` Verify cross-currency display, pagination, stale state, and empty state.
- [ ] `BETA-BANK-004` Verify every economic mutation produces exactly one expected ledger outcome.

### Expansion

- [ ] `EXP-BANK-001` Define player-to-player transfer contract using server-side Player ID resolution.
- [ ] `EXP-BANK-002` Implement atomic transfers and audit.
- [ ] `EXP-BANK-003` Implement savings accounts and transfers.
- [ ] `EXP-BANK-004` Implement savings interest.
- [ ] `EXP-BANK-005` Define loan products, eligibility, and disclosures.
- [ ] `EXP-BANK-006` Implement loan application and approval.
- [ ] `EXP-BANK-007` Implement repayment, interest, delinquency, and default.
- [ ] `EXP-BANK-008` Implement creditworthiness without sensitive demographic data.
- [ ] `EXP-BANK-009` Implement business loans after Business system authority exists.
- [ ] `EXP-BANK-010` Simulate inflation, exchange, interest, and difficulty interactions.

---

## 14. Story, news, notifications, war, and campaign

**Overall status:** `IN_PROGRESS`.

### Complete foundation

- [x] Storyline schema.
- [x] Event definition and activation.
- [x] Condition evaluation engine.
- [x] Effect execution foundation.
- [x] Player story context.
- [x] Story flags.
- [x] Player impacts.
- [x] Policy records.
- [x] Idempotent event resolution.
- [x] Notification and delivery persistence.
- [x] Cutscene delivery foundation.
- [x] Mark cutscene seen, dismissed, and acknowledged.
- [x] Story-triggered Contract foundation.
- [x] Story-triggered ledger-effect foundation.
- [x] Stock-market-event integration foundation.

### Active notification work

- [ ] `BETA-NOTIF-001` Merge notification list. `IMPLEMENTED_NOT_MERGED` on PR #158.
- [ ] `BETA-NOTIF-002` Merge mark-read. `IMPLEMENTED_NOT_MERGED` on PR #158.
- [ ] `BETA-NOTIF-003` Add unread count and pagination to Player Terminal.
- [ ] `BETA-NOTIF-004` Render player-safe notification categories.
- [ ] `BETA-NOTIF-005` Connect story cutscene modal.
- [ ] `BETA-NOTIF-006` Preserve purpose-built story payload delivery without exposing generic raw payload JSON.

### Beta campaign

- [ ] `BETA-STORY-001` Implement one complete playable campaign arc.
- [ ] `BETA-STORY-002` Begin with the player arriving as a new immigrant.
- [ ] `BETA-STORY-003` Establish the Meridian boom and economic opportunity.
- [ ] `BETA-STORY-004` Introduce rivalry, shortages, and political hostility.
- [ ] `BETA-STORY-005` Trigger a Meridian attack with uncertain attribution.
- [ ] `BETA-STORY-006` Escalate to open war and civilian economic adaptation.
- [ ] `BETA-STORY-007` Introduce loyalty, residency, and relationship pressure.
- [ ] `BETA-STORY-008` Resolve through ceasefire, continued conflict, or reconstruction paths.
- [ ] `BETA-STORY-009` Keep the player economically influential but not automatically a national leader or military commander.
- [ ] `BETA-STORY-010` Add bounded news, events, Contracts, Store scarcity, market shocks, and notifications for every campaign phase.
- [ ] `BETA-STORY-011` Implement runner HTTP/scheduler integration.
- [ ] `BETA-STORY-012` Add replay-safe and idempotent event execution.
- [ ] `BETA-STORY-013` Add Admin observability and emergency disable for story activation.

### Expansion

- [ ] `EXP-STORY-001` Expand campaign chapters, branches, and country variants.
- [ ] `EXP-STORY-002` Add relationships, trust, reputation, and factions.
- [ ] `EXP-STORY-003` Add evidence discovery and attribution mechanics.
- [ ] `EXP-STORY-004` Add policy enforcement and long-term consequences.
- [ ] `EXP-STORY-005` Add story history and replay endpoints.
- [ ] `EXP-STORY-006` Add Admin story authoring and review tools.
- [ ] `EXP-STORY-007` Add localization-ready content contracts.

---

## 15. Player Terminal

**Overall status:** `VERIFIED_COMPLETE` as a hardened standalone frontend; `BLOCKED` for production connection until Backend PR #158 is authoritative.

### Complete frontend surfaces

- [x] Dashboard.
- [x] News.
- [x] Market.
- [x] Portfolio.
- [x] Business.
- [x] Contracts.
- [x] Store.
- [x] Marketplace.
- [x] Inventory.
- [x] Crafting.
- [x] Banking.
- [x] Loans.
- [x] Messages.
- [x] Progression.
- [x] Profile.
- [x] Interactive world map.
- [x] Responsive desktop and mobile layout.
- [x] Route-specific skeletons.
- [x] Session handoff and replacement.
- [x] Request IDs and idempotency keys.
- [x] Resource freshness and invalidation.
- [x] Offline, timeout, 401, and 429 handling.
- [x] Capability-based fail-closed controls.
- [x] Server-authoritative economic mutation behavior.
- [x] Accessible transaction modals.
- [x] Browser and zoom hardening.
- [x] UUID privacy controls.

### Runtime integration

- [ ] `BETA-PLAYER-001` Install the Student-Profile adapter before `PlayerApi` construction.
- [ ] `BETA-PLAYER-002` Select `/functions/v1/classroom-api` explicitly.
- [ ] `BETA-PLAYER-003` Prohibit `/api/player` fallback in Student-Profile connected mode.
- [ ] `BETA-PLAYER-004` Consume authoritative capability manifest and version.
- [ ] `BETA-PLAYER-005` Validate advertised capability-to-adapter coverage at startup.
- [ ] `BETA-PLAYER-006` Fail closed before execution when capability and route mappings disagree.
- [ ] `BETA-PLAYER-007` Preserve approved product surfaces with truthful Integration Pending or Unavailable states.
- [ ] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile.
- [ ] `BETA-PLAYER-009` Connect Store, Contract, Market, watchlist, notification, redemption, and logout writes.
- [ ] `BETA-PLAYER-010` Verify desktop and mobile connected bootstrap.
- [ ] `BETA-PLAYER-011` Verify session replacement abort and stale-result rejection.
- [ ] `BETA-PLAYER-012` Verify no ownership UUID appears in URLs, payloads, models, fixtures, logs, or rendered output.
- [ ] `BETA-PLAYER-013` Verify committed-success behavior for every economic write.
- [ ] `BETA-PLAYER-014` Verify offline, timeout, ambiguous write, 429, and session-expiry recovery.

---

# PART II — EXECUTION ROADMAP

## 16. Phase 0 — Program control and repository consolidation

**Goal:** Ensure one authority exists for every capability and every completion claim.

- [ ] `P0-001` Re-audit current `main`, active branches, open PRs, and deployed runtimes.
- [ ] `P0-002` Update this roadmap's baseline SHA and active PR table.
- [ ] `P0-003` Keep PR #158 as the only active Backend reconciliation branch.
- [ ] `P0-004` Keep PR #163 as the current seed-content foundation branch.
- [ ] `P0-005` Record PR #141 and PR #143 as donor-only.
- [ ] `P0-006` Close or archive superseded branches after their useful work is accounted for.
- [ ] `P0-007` Add a capability ownership registry.
- [ ] `P0-008` Add a change ledger to this document after every merged tranche.
- [ ] `P0-009` Require every future implementation prompt to reference this exact path.
- [ ] `P0-010` Do not create a new branch until branch ownership has been checked.

### Capability ownership registry

| Capability | Authority | Status | Collision rule |
|---|---|---|---|
| Authenticated Player Backend reconciliation | PR #158 / `agent/player-backend-reconciliation-v2` | `IN_PROGRESS` | Do not create another Backend reconciliation branch. |
| Seed-content foundation and executable-content preparation | PR #163 / `agent/seed-content-foundation-v1` | `IN_PROGRESS` | Do not create another seed-content branch. |
| Player safe session-expiry exit | PR #165 / `4e20a5993da925463887bc23cc707be5679ccd20` | `VERIFIED_COMPLETE` | Preserved on `main`; no active feature branch remains. |
| Admin safe session-expiry exit | PR #166 / `c2b3f315901698359a4bfb3dc0eb3e63c719d8a5` | `VERIFIED_COMPLETE` | Preserved on `main`; no active feature branch remains. |
| Player suspended/background expiry correction | PR #167 / `14adbc525995cc931998244c442a23b542f43c7a` | `VERIFIED_COMPLETE` | Preserved on `main`; no active feature branch remains. |
| Production-integration donor | PR #141 / `agent/player-terminal-production-integration-v1` | donor only | Reference useful contracts; do not merge directly. |
| Inventory-redemption donor | PR #143 / `agent/platform-scope-integration-v1` | donor only | Reconcile intentionally into PR #158; do not merge directly. |
| Accepted Admin source preservation | `frontend/admin-terminal-source-v1` | retained exception | Preserve per `CONTRIBUTING.md`; do not treat as active feature authority. |

**Exit gate:** No overlapping active branch owns the same capability, and this roadmap reflects the current repository.

---

## 17. Phase 1 — Finish Backend PR #158

**Goal:** Make the authenticated Player API authoritative and mergeable.

Sequence:

1. Notifications list and mark-read.
2. Player logout.
3. Capability manifest and version.
4. Atomic Contract acceptance.
5. Inventory-redemption schema, RPCs, Player routes, and Admin routes.
6. Security and privacy audit.
7. Migration replay and lint.
8. Staging instructions and runtime contract.
9. Full verification.
10. Merge PR #158.

Required gates:

- [ ] Backend Typecheck.
- [ ] Backend tests.
- [ ] Database Replay twice from zero.
- [ ] Database lint.
- [ ] Repository Quality.
- [ ] Admin API Check.
- [ ] Player Terminal contract verification where shared contracts are affected.
- [ ] Wrong-role, wrong-game, wrong-player, expired, revoked, replay, idempotency, and UUID-injection tests.
- [ ] No production deployment before merge and staging rehearsal.

**Exit gate:** PR #158 is merged, donor branches are no longer needed for authority, and all implemented capabilities are represented in the manifest.

---

## 18. Phase 2 — Connect the Player Terminal

**Goal:** Convert the hardened standalone Player Terminal into the authoritative live client.

- [ ] Install adapter before API client construction.
- [ ] Bind explicitly to `classroom-api`.
- [ ] Consume normalized host player session.
- [ ] Validate capability manifest version.
- [ ] Reconcile every route key with a backend route.
- [ ] Connect all beta reads.
- [ ] Connect all beta writes.
- [ ] Connect logout.
- [ ] Add integration mismatch states.
- [ ] Run connected-mode browser tests.
- [ ] Run mobile and desktop tests.
- [ ] Verify preview isolation.
- [ ] Verify no speculative or fallback requests.

**Exit gate:** A real authenticated player can complete the base loop in isolated staging without preview data.

---

## 19. Phase 3 — Close beta gameplay gaps

**Goal:** Finish the minimum complete loop before content scale-up.

- [ ] Contract acceptance.
- [ ] Inventory redemption.
- [ ] Notification inbox and cutscenes.
- [ ] Minimal onboarding.
- [ ] Game lifecycle start, pause, resume, end, archive, and session revoke.
- [ ] Emergency economic mutation pause.
- [ ] Player-facing recovery states.
- [ ] One complete tutorial Contract chain.
- [ ] One complete Store purchase/redemption chain.
- [ ] One complete Market trade/portfolio chain.
- [ ] One complete story event and notification chain.

**Exit gate:** Every core loop has one end-to-end authoritative path and one failure/retry path.

---

## 20. Phase 4 — Executable seed content and calibration

**Goal:** Replace design-only records with deterministic, reviewable, executable staging content.

### Current PR #163 evidence boundary

- The branch is actively changing and remains documentation/design-record work: 189 Markdown and 20 JSON files at the audited checkpoint, with no implementation source, migration, executable test, importer, preflight command, rollback implementation, or staging load.
- The repository does not yet contain the ten referenced 320-record country JSONL files. The 3,200-instrument manifest is therefore design intent, not verified ingestion.
- Northreach is the only bounded market candidate with actual records: 24 candidate instruments and 21 issuers; all remain simulation-pending and activation-disabled.
- The item library contains 144 definition-only records: 42 materials, 30 components, 30 equipment, 24 consumables, and 18 blueprints or authorizations.
- The crafting manifest calls for 60 recipes, but the audited repository contains only 18 Tier I records. Tier II, Tier III, regulated/wartime recipes, resolved difficulty quantities, substitutions, repair/salvage, and demand matrices remain absent.
- Fifty location candidates exist, but every coordinate and map verification remains pending. Ten arrival-package shells exist, but starting values, first Contracts, tutorials, messages, questionnaires, and class assignments remain incomplete.
- No reproducible economic or market simulation has run. Earlier unsupported 1,000-player simulation claims are not accepted as evidence.
- Design status is `IN_PROGRESS` for the 3,200-record ingestion, bounded market, registries, item taxonomy/effects/scarcity/material requirements, recipe schema/rules, location registry, and arrival-package records. Runtime implementation, simulation, importer, staging, and the complete class system remain `PLANNED` or dependency-blocked.

- [ ] Ingest the 3,200-instrument library into repository-controlled source files.
- [ ] Select bounded active market subset.
- [ ] Create issuer, exchange, sector, industry, commodity, and benchmark registries.
- [ ] Verify canonical countries, currencies, locations, adjacency, and routes.
- [ ] Correct map profiles and coordinates.
- [ ] Convert ten arrival packages into machine-readable records.
- [ ] Approve starting balances, items, Contracts, and recovery paths.
- [ ] Create bounded Store catalogs.
- [ ] Create tutorial and introductory Contracts.
- [ ] Create campaign events, news, interactions, and notifications.
- [ ] Create deterministic fixture scenarios.
- [ ] Implement seed importer.
- [ ] Implement preflight validation.
- [ ] Implement rollback.
- [ ] Run reproducible economic and market simulations.
- [ ] Record seeds, inputs, outputs, integrity checks, and balance decisions.
- [ ] Load a bounded active staging subset.

**Exit gate:** A clean staging environment can be seeded deterministically and rolled back without manual correction.

---

## 21. Phase 5 — Beta security, release, and operations

**Goal:** Make the beta survivable, observable, reversible, and secure.

- [ ] Reconcile live and repository migration history.
- [ ] Export live schema, grants, policies, Auth configuration, function inventory, and migration ledger.
- [ ] Restore into an isolated project and compare with clean replay.
- [ ] Contain or retire legacy Edge Functions and Cloudflare Worker routes.
- [ ] Rotate legacy credentials.
- [ ] Create isolated development, staging, and production environments.
- [ ] Add protected approval for staging and production.
- [ ] Build immutable artifacts from merge commits.
- [ ] Generate release manifest with hashes, migration head, config version, and feature flags.
- [ ] Add secret scanning, dependency review, SBOM/provenance, and patch cadence.
- [ ] Add leaked-password protection and staff access policy.
- [ ] Add rate limiting.
- [ ] Add structured logs, request IDs, release SHA, safe actor/game identifiers, latency, DB metrics, and outcome classes.
- [ ] Add dashboards and alerts.
- [ ] Add backup retention.
- [ ] Create encrypted off-platform backup.
- [ ] Rehearse full restore.
- [ ] Define and rehearse RPO/RTO.
- [ ] Define incident severity, ownership, communications, classroom fallback, and correction procedures.
- [ ] Add load fixtures and query-plan review.
- [ ] Add missing foreign-key indexes based on evidence.
- [ ] Complete staging-backed Admin and Player smoke.

**Exit gate:** A reviewed merge commit can be promoted unchanged through staging, rolled back, and restored within the approved recovery objective.

---

## 22. Phase 6 — Beta end-to-end validation and pilot

**Goal:** Prove the complete classroom simulation with bounded users.

Required scenarios:

- [ ] Administrator signs in and creates/configures a game.
- [ ] Players are created, assigned countries, and receive credentials.
- [ ] Player joins and completes onboarding.
- [ ] Attendance reward is issued once in local currency.
- [ ] Player accepts, submits, revises, and completes a Contract.
- [ ] Contract cash and item rewards issue once.
- [ ] Player obtains Store quote and purchases an item.
- [ ] Inventory updates and redemption completes.
- [ ] Market ticks update.
- [ ] Player adds watchlist item and executes buy/sell.
- [ ] Portfolio and Banking reflect authoritative results.
- [ ] Story event activates and sends news/notification/cutscene.
- [ ] Admin reviews logs, corrections, and audit history.
- [ ] Session expiry exits safely.
- [ ] Offline and retry paths do not duplicate writes.
- [ ] Cross-game access is denied.
- [ ] Game pause blocks mutations without corrupting reads.
- [ ] Ended game blocks further writes.
- [ ] Backup and restore preserve the session state.

Pilot controls:

- [ ] Define class count and player limit.
- [ ] Define support hours.
- [ ] Define rollback rules.
- [ ] Define data retention and privacy terms.
- [ ] Define daily health review.
- [ ] Define P0/P1 stop conditions.
- [ ] Record pilot feedback and defects in this roadmap.

**Exit gate:** The pilot remains inside approved SLO/error budgets with no unresolved P0/P1 security or data-integrity findings.

---

# PART III — FULL PRODUCT EXPANSION

## 23. Business and employment system

**Status:** `PLANNED`.

- [ ] `EXP-BIZ-001` Define business entity, ownership, capitalization, and lifecycle.
- [ ] `EXP-BIZ-002` Implement business creation or acquisition.
- [ ] `EXP-BIZ-003` Implement products, inputs, production runs, and capacity.
- [ ] `EXP-BIZ-004` Implement pricing, demand, sales, revenue, and cost accounting.
- [ ] `EXP-BIZ-005` Implement employees, hiring, wages, productivity, and termination.
- [ ] `EXP-BIZ-006` Implement inventory inputs and finished goods.
- [ ] `EXP-BIZ-007` Implement taxes, licenses, regulation, and country policy effects.
- [ ] `EXP-BIZ-008` Implement financing, valuation, equity, and business loans.
- [ ] `EXP-BIZ-009` Connect Business to Contracts, Store, Marketplace, employment, news, and story events.
- [ ] `EXP-BIZ-010` Add Admin oversight and economic simulation controls.
- [ ] `EXP-BIZ-011` Simulate profitability, exploit resistance, and failure/recovery paths.

---

## 24. Player Marketplace

**Status:** `PLANNED`; current surfaces remain read-only.

- [ ] `EXP-MP-001` Define listing, reservation, purchase, cancellation, settlement, fee, expiration, moderation, and dispute states.
- [ ] `EXP-MP-002` Implement atomic listing creation with inventory reservation.
- [ ] `EXP-MP-003` Implement purchase and seller settlement.
- [ ] `EXP-MP-004` Implement cancellation and reservation release.
- [ ] `EXP-MP-005` Implement fees and taxes.
- [ ] `EXP-MP-006` Implement moderation and Admin intervention.
- [ ] `EXP-MP-007` Implement disputes, refunds, and audit.
- [ ] `EXP-MP-008` Add Player and Admin UI.
- [ ] `EXP-MP-009` Test concurrent buyers, stale listings, duplicate settlement, and cross-game isolation.

---

## 25. Crafting

**Status:** `PLANNED`.

- [ ] `EXP-CRAFT-001` Define recipe schema and stable public IDs.
- [ ] `EXP-CRAFT-002` Define material quantities, tools, difficulty, duration, output, quality, and failure rules.
- [ ] `EXP-CRAFT-003` Implement atomic material consumption and output grant.
- [ ] `EXP-CRAFT-004` Implement recipe unlocks.
- [ ] `EXP-CRAFT-005` Connect scarcity and country availability.
- [ ] `EXP-CRAFT-006` Connect crafting to Contracts, Business, progression, and Marketplace.
- [ ] `EXP-CRAFT-007` Add Player and Admin UI.
- [ ] `EXP-CRAFT-008` Add deterministic fixtures and balance simulation.

---

## 26. Messaging and communication

**Status:** `PLANNED`.

- [ ] `EXP-MSG-001` Define teacher announcements, system messages, player threads, and Contract messages.
- [ ] `EXP-MSG-002` Define moderation, permissions, retention, and audit.
- [ ] `EXP-MSG-003` Implement inbox and thread reads.
- [ ] `EXP-MSG-004` Implement safe send action.
- [ ] `EXP-MSG-005` Implement unread state and notification integration.
- [ ] `EXP-MSG-006` Add Admin moderation and disable controls.
- [ ] `EXP-MSG-007` Add privacy and abuse testing.

---

## 27. Progression, reputation, and achievements

**Status:** `PLANNED`.

- [ ] `EXP-PROG-001` Define experience, levels, skills, rewards, achievements, and public/private fields.
- [ ] `EXP-PROG-002` Define economic specialization without a permanently dominant path.
- [ ] `EXP-PROG-003` Implement progression reads.
- [ ] `EXP-PROG-004` Implement skill unlock and reward claim atomically.
- [ ] `EXP-PROG-005` Implement country, career, story, and relationship reputation.
- [ ] `EXP-PROG-006` Connect progression to Contracts, Business, crafting, market access, and story.
- [ ] `EXP-PROG-007` Add Admin correction and audit.
- [ ] `EXP-PROG-008` Simulate progression speed and exploit resistance.

---

## 28. Arrival class system

**Status:** `PLANNED`; current Workstream 11.

- [ ] `EXP-CLASS-001` Define six to eight balanced base classes.
- [ ] `EXP-CLASS-002` Define ten country variants per class.
- [ ] `EXP-CLASS-003` Write a short nonsensitive arrival questionnaire.
- [ ] `EXP-CLASS-004` Define deterministic and explainable scoring.
- [ ] `EXP-CLASS-005` Allow player review and override.
- [ ] `EXP-CLASS-006` Define idempotent starting grants.
- [ ] `EXP-CLASS-007` Prevent permanent lockout from other economic paths.
- [ ] `EXP-CLASS-008` Store class state by game session.
- [ ] `EXP-CLASS-009` Simulate every class-country combination.
- [ ] `EXP-CLASS-010` Add Player onboarding and Admin visibility.
- [ ] `EXP-CLASS-011` Verify no class is objectively superior across the complete simulation.

---

## 29. Geography, locations, travel, and immigration

**Status:** `PLANNED`.

- [ ] `EXP-GEO-001` Verify 50 canonical locations.
- [ ] `EXP-GEO-002` Verify exact coordinates and map artwork.
- [ ] `EXP-GEO-003` Define land, sea, air, and Meridian route adjacency.
- [ ] `EXP-GEO-004` Implement travel eligibility, time, and cost.
- [ ] `EXP-GEO-005` Implement location state and location-targeted Contracts/events.
- [ ] `EXP-GEO-006` Implement border closures, shortages, and war-route effects.
- [ ] `EXP-GEO-007` Implement later immigration and residency pathways.
- [ ] `EXP-GEO-008` Implement map interaction and route visualization.
- [ ] `EXP-GEO-009` Add path validation and impossible-route tests.

---

## 30. Long-term architecture and production maturity

**Status:** `PLANNED`.

- [ ] Retire all unknown legacy backend traffic.
- [ ] Establish one typed versioned client.
- [ ] Eliminate global fetch wrappers.
- [ ] Reduce MutationObservers to genuine DOM-observation requirements.
- [ ] Split Admin by bounded context.
- [ ] Extract accepted v606 panels under visual parity tests.
- [ ] Introduce reusable accessible design-system components.
- [ ] Add privacy classification, retention, deletion, and export workflows.
- [ ] Add third-party processor review.
- [ ] Measure strict-type coverage, complexity, bundle size, flaky tests, replay time, dependency age, legacy traffic, and recovery results.
- [ ] Run quarterly restore exercises.
- [ ] Maintain an immutable release and change-control process.

---

# PART IV — COMPLETION AND REPORTING PROTOCOL

## 31. Required start-of-session audit

Every implementation session must begin with:

1. Fetch current `main`.
2. Read this roadmap.
3. Read `CONTRIBUTING.md`.
4. List active PRs and branches.
5. Identify the existing branch that owns the requested capability.
6. Compare that branch with `main`.
7. Inspect relevant implementation, migrations, tests, and docs.
8. Reconcile this roadmap against the actual codebase.
9. Select the highest-priority unblocked roadmap item.
10. State any roadmap correction before implementation.

Do not rely only on previous chat memory.

---

## 32. Required end-of-session update

Every implementation session must record:

- roadmap item IDs addressed;
- branch and PR;
- commit SHA;
- files changed;
- migrations added;
- tests run and results;
- unresolved failures;
- scope or architecture decisions;
- new blockers;
- next exact roadmap item;
- whether the roadmap itself was updated.

No item may be checked complete merely because code was written.

---

## 33. Change ledger

Append entries in reverse chronological order.

### 2026-07-18 — Player capability manifest tranche on PR #158

- Addressed `BETA-CAP-001` through `BETA-CAP-005` on branch `agent/player-backend-reconciliation-v2`, PR #158, commit `7d068bf31a67614bf31bc0ae45f564f4a18556a3`; all remain `IMPLEMENTED_NOT_MERGED` until the PR is merged and required evidence exists.
- Added authenticated, private/no-store `GET /players/me/capabilities`, schema version `1`, manifest version `2026-07-18.1`, and one reviewed endpoint allowlist that drives route/action capability flags. Unsupported legacy UUID-bearing routes, market orders, Contract acceptance, redemption, Store writes, and expansion systems remain fail-closed.
- Hardened stock asset and watchlist route parsing so only exact direct and Edge Function prefixes are accepted; spoofed leading path segments are rejected.
- Changed 17 capability-tranche files: the capability contract/handler/route modules and tests, Classroom API dispatch, stock route parsers and tests, Backend scripts, two Backend audit documents, two capability evidence documents, and this roadmap. The branch reconciliation also preserves the 11 current-`main` files from PRs #164 through #167.
- Added no migrations, database functions, RPCs, scheduled jobs, deployment workflows, or runtime configuration. Added one HTTP route and no newly advertised economic write operation.
- Local evidence: `npm test` passed; `npm --prefix player-terminal run verify` passed; `npm --prefix backend run test:player-capabilities` passed 8/8; `npm --prefix backend run test:player-market-assets` passed 45/45; `npm --prefix backend run typecheck` passed; `git diff --check` passed. Full local Backend smoke and `typecheck:all` reached the Admin API/Deno check but could not fetch the pinned `https://esm.sh/@supabase/supabase-js@2.108.2` import because the local sandbox blocks that host; no test assertion failed before the environmental fetch block.
- Runtime evidence: none. Isolated staging, deployment, and live route probes remain required. PR CI evidence for this head is pending.
- Remaining blockers for the capability tranche: required PR checks, review, merge to `main`, post-merge verification, and later `BETA-CAP-006` reconciliation after each subsequent Phase 1 tranche.
- Next exact unblocked item: `BETA-CONTRACT-001` on PR #158, atomic `POST /players/me/contracts/:contractId/accept` with server-derived ownership, transactional/idempotent settlement, append-only ledger authority, UUID-private responses, and manifest reconciliation.

### 2026-07-18 — Repository reconciliation and Phase 1 continuation

- Corrected the audited `main` baseline to `14adbc525995cc931998244c442a23b542f43c7a`.
- Reconfirmed PR #158 as Backend authority and PR #163 as seed-content authority.
- Recorded merged PRs #165, #166, and #167 and marked `BETA-AUTH-003` `VERIFIED_COMPLETE` with their passing Player, Admin, Repository Quality, and Branch Hygiene evidence.
- Recorded implemented-not-merged evidence for market reads/watchlists, Inventory read, notifications, and Player logout on PR #158.
- Added the capability ownership registry and bounded capability-manifest roadmap IDs.
- Confirmed PR #163 remains non-executable and that staging, restore, and runtime-cutover evidence remain absent.
- Superseded next item: `BETA-CAP-001` through `BETA-CAP-005` on PR #158, now implemented-not-merged at `7d068bf31a67614bf31bc0ae45f564f4a18556a3`.

### 2026-07-18 — Initial authoritative roadmap

- Converted the complete codebase capability audit into a durable execution ledger.
- Recorded merged capabilities, active Backend and seed-content programs, beta-critical gaps, full expansion backlog, and operational gates.
- Established evidence-based completion status.
- Established the requirement that future agents audit the codebase against this file before continuing.
- Beta scope remains unlocked pending explicit product-owner instruction.

---

## 34. Scope intake

New requests belong here until classified.

| Intake ID | Request | Requested by | Date | Dependencies | Beta impact | Status |
|---|---|---|---|---|---|---|
| — | No unclassified requests at document creation | — | 2026-07-18 | — | — | — |

---

## 35. Final completion definition

The complete roadmap is finished only when:

1. Every item is `VERIFIED_COMPLETE`, `DEFERRED_BY_OWNER`, or `REMOVED_BY_OWNER`.
2. No feature is marked complete solely from preview, donor, or unmerged code.
3. The base game has passed a real bounded beta.
4. All approved expansion systems have passed their own end-to-end acceptance tests.
5. The repository, staging, production, backup, restore, security, privacy, and change-control systems are operating as documented.
6. The product owner approves the final completion audit.

Until then, agents must continue from the highest-priority unblocked item and keep this document synchronized with the codebase.
