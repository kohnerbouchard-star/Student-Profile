# Econovaria Complete Development Roadmap

**Document ID:** ECON-BETA-ROADMAP-V1  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Authoritative path:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Program state:** Active; beta scope is not locked until the product owner explicitly locks it  
**Last baseline audit:** 2026-07-20
**Audited application-state baseline:** `b700147f03be26e1663437135878c6736f55b805`
**Current repository audit head:** `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`

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
| Backend player reconciliation | `VERIFIED_COMPLETE` | PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac` |
| Seed-content foundation | `IN_PROGRESS`; branch synchronization required | PR #163, branch `agent/seed-content-foundation-v1`, head `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; 407 seed commits beyond the common base and 98 current-main commits behind |
| Player runtime cutover and legacy source removal | `VERIFIED_COMPLETE` for repository code; operations remain `IN_PROGRESS` | PR #217 merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`; PR #222 merged as `3b74340830da8db4fdabe2926915c3a32471b7c8`; connected isolated staging and live Worker retirement remain release gates |
| Player safe session-expiry exit | `VERIFIED_COMPLETE` | PR #165 merged as `4e20a5993da925463887bc23cc707be5679ccd20`; suspended-session correction PR #167 merged as `14adbc525995cc931998244c442a23b542f43c7a` |
| Admin safe session-expiry exit | `VERIFIED_COMPLETE` | PR #166 merged as `c2b3f315901698359a4bfb3dc0eb3e63c719d8a5` |
| Admin explicit request lifecycle | `VERIFIED_COMPLETE` | PR #168 merged as `1d487afc766146b5e3e19f718252b3eff9a1168e` |
| Admin game lifecycle and emergency mutation controls | `VERIFIED_COMPLETE` | PR #229 merged as `ece5876b0dfc79458afb5b5aaa9266b9884ecbcb` |
| Admin shape-accurate skeletons | `VERIFIED_COMPLETE` | PR #162 merged |
| Player Terminal skeleton hardening | `VERIFIED_COMPLETE` | merged on `main` |
| Player Terminal capability tranche | `VERIFIED_COMPLETE` for frontend behavior only | PR #156 merged |
| Contracts, attendance rewards, and Admin stabilization | `VERIFIED_COMPLETE` | PR #138 merged |
| Store quote/purchase flow | `VERIFIED_COMPLETE` for frontend behavior | PR #145 merged |
| Banking reads and exactly-once ledger invariants | `IN_PROGRESS` | PR #213 merged as `aee11e06c44dc9b6cd3ee2a386be215cef3c5536`; correction PR #221 merged as `26eecaa1ed04e3aa0909c75be269491a975fad70`; invariant PR #230 merged as `b8d227d8d8d0cd178efc63935371ab53eee8b78b`; isolated-staging migration application remains open |
| Player runtime adapter | `VERIFIED_COMPLETE` | Cleaned PR #141 merged as `566d99fab5668cf42d6275ec8d12c580239a3137`; capability preflight and explicit `classroom-api` routing are authoritative |
| Inventory redemption lifecycle | `VERIFIED_COMPLETE` at repository-integrated boundary | Backend PR #158, Admin review PR #177, and connected lifecycle PR #224 merged; PR #143 remains donor/reference only |
| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; isolated environment evidence, rollback, restore, approval, and promotion remain open |

### Historical 2026-07-18 repository reconciliation (superseded)

- `main` is `1d487afc766146b5e3e19f718252b3eff9a1168e`, which includes merged session-expiry PRs #165, #166, and #167 plus Admin explicit-request-lifecycle PR #168, and supersedes the original `c7c949482b78c5960173e25e487f3aba2448d10e` roadmap baseline.
- PR #158 remains the only active Backend reconciliation authority. Its audited remote head before the current capability-manifest tranche was `67cc25cced3000fae9a624c71e8c1093879867a2`; it had green Backend Typecheck #970, Repository Quality #306, Admin API Check #584, and Database Replay #112 evidence. Commit `7d068bf31a67614bf31bc0ae45f564f4a18556a3` synchronized the existing branch with `14adbc525995cc931998244c442a23b542f43c7a` and published the capability-manifest tranche for PR verification.
- PR #163 remains the only seed-content authority. It is still design/documentation work and does not yet provide an executable importer, an applied migration, a reproducible simulation run, or staging activation evidence.
- PR #165 merged the Player proactive expiry exit with Player Terminal Verify #107 and Repository Quality #325 passing.
- PR #166 merged the Admin expiry exit as `c2b3f315901698359a4bfb3dc0eb3e63c719d8a5`; head `5c66b23eddee12203caa932b61bcf28e93b07cae` passed Repository Quality #329, Admin Shell Smoke #594, and Branch Hygiene #15.
- PR #167 merged the Player suspended/background-resume correction as `14adbc525995cc931998244c442a23b542f43c7a`; head `de486c402ca9512fc31c7841378b1b31c247c7f2` passed Repository Quality #342, Player Terminal Verify #109, and Branch Hygiene #16.
- PR #168 merged the Admin explicit request lifecycle as `1d487afc766146b5e3e19f718252b3eff9a1168e`; head `19ccb5a4d130cabb0b71d170e5b146923c70b18e` passed Repository Quality #421, Admin Shell Smoke #606, and Branch Hygiene #17. The architecture ratchet decreased from 8 to 7 global fetch assignments and from 13 to 12 mutation observers.
- PRs #141 and #143 remain donor/reference work only. Their branches do not become authority through direct merge.
- No isolated staging deployment, restore rehearsal, or current runtime-cutover evidence was found during this audit; all staging-dependent items remain open.

### Historical 2026-07-19 runtime reconciliation

- PR #158 merged the authoritative Player backend boundary, logout, capability manifest, Contract acceptance, Inventory reads, notifications, and redemption Backend workflow as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.
- PR #177 merged the Admin inventory-redemption review queue as `00ffc841cb7072cb98610e23d20eb4d0cfd60cf8`.
- PR #217 merged the Player Terminal host-runtime cutover and removed the Cloudflare browser transport as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`.
- PR #222 physically removed the now-unmounted legacy Player source and installed a repository ratchet preventing its return as `3b74340830da8db4fdabe2926915c3a32471b7c8`; final head `9073afaf58b16da3831fb3e7d67da6922acbf4c5` passed Repository Quality #909, Player Runtime Cutover Verify #12, Admin Shell Smoke #836, Exchange Calendar Runtime #156, and Required Game Market Timezone #168.
- PR #213 merged the authenticated Player Banking read boundary as `aee11e06c44dc9b6cd3ee2a386be215cef3c5536`; PR #221 completed connected pagination and full cross-currency balance display as `26eecaa1ed04e3aa0909c75be269491a975fad70`; PR #230 merged the economic mutation-to-ledger invariant matrix and idempotent staff-adjustment RPC as `b8d227d8d8d0cd178efc63935371ab53eee8b78b`. Final PR #230 head `1050d8bf8b667d627c032cf72b891f6a31b1c380` passed Backend Typecheck #1214 with complete smoke, Database Replay #306, Admin Shell Smoke #854, Admin API Check #696, Admin Bundle Contract Audit #556, Repository Quality #945, Exchange Calendar Runtime #171, and Required Game Market Timezone #188.

### 2026-07-20 game-lifecycle reconciliation

- PR #229 merged authoritative Admin game lifecycle controls as `ece5876b0dfc79458afb5b5aaa9266b9884ecbcb`.
- Final head `9f7cbab6f718215ec748ee4e78c0dde12a56da0d` passed all ten final-head workflows, including the dedicated lifecycle suite, the complete 89-stage Admin Shell, Backend Typecheck, Database Replay, Repository Quality, Admin API Check, Admin Bundle Contract Audit, Staging Readiness Preflight, Exchange Calendar Runtime, and Required Game Market Timezone.
- `BETA-ADMIN-009` and `BETA-ADMIN-010` are repository-verified complete. Connected isolated-staging lifecycle verification remains under `BETA-ADMIN-007` and the release gates; it does not reopen the merged implementation items.

### 2026-07-20 full repository reconciliation

- PR #239 merged the full roadmap reconciliation as `b700147f03be26e1663437135878c6736f55b805`; this is the audited application-state baseline. Later roadmap-only merge commits do not advance application implementation status.
- Re-audited `main` at `4e3c123c98c37a2b5d26a93e67bfb31c3b722925` and all open PR ownership. PR #163 remains the sole open seed-content authority and remains draft; no replacement Backend, Player, lifecycle, or staging-preflight feature branch is active.
- PR #158 merged the authoritative Player Backend as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`. PR #141 was cleaned and merged as the authoritative Player runtime adapter at `566d99fab5668cf42d6275ec8d12c580239a3137`; it is no longer donor-only. PR #143 remains donor/reference only.
- Later merged tranches completed connected logout (#182), Contract reads/acceptance/submission/lifecycle (#190, #201, #205), Store lifecycle and race guards (#207, #210, #211), notification inbox behavior (#216), Inventory Admin review and connected redemption (#177, #224), runtime cutover and legacy source removal (#217, #222), Banking reads (#213, #221), and game lifecycle controls (#229).
- The current Player capability manifest is schema `1`, manifest `2026-07-19.4`. It advertises reviewed Contracts, Store, Inventory redemption, Banking, notification, logout, market-read, asset-detail, and watchlist operations. It deliberately does not advertise market orders, Portfolio, Dashboard, or Profile; those connected-runtime items remain open.
- PR #169 merged the fail-closed staging-readiness validator as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`. A green validator proves the gate works; it does not supply the still-missing isolated-staging, rollback, restore, approval, or production-cutover evidence.
- PR #163 now contains the complete 3,200-record definition-layer market universe, 240 activation-disabled candidates, ten arrival packages, 11/11 machine-readable core-content target groups, and four deterministic country simulation pilots. It remains non-deployable: importer, runtime activation, six country simulations, map evidence, calibration, rollback, and staging load remain blocked or incomplete.

### 2026-07-20 comprehensive repository and roadmap re-audit

- Re-audited current `main` at `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`. Every commit after application-state baseline `b700147f03be26e1663437135878c6736f55b805` is roadmap-only, so no later application capability is being inferred.
- PR #163 remains the only open PR and the sole seed-content authority. Its current head is `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; the branch has 407 seed commits beyond merge base `d403cf7baefeb3c1015c282cdbd748d2050e87ac` and is 98 current-main commits behind. It must be synchronized and revalidated before merge.
- The merged Player capability manifest remains schema `1`, version `2026-07-19.4`. Dashboard, Portfolio, Profile, market orders, Crafting, Loans, Business, Marketplace writes, Messages, and Progression remain unadvertised or unavailable.
- PR #163 contains substantial definition-layer progress that was understated in the expansion ledger: 144 item definitions, 60 recipe definitions, Store scarcity/difficulty policies, 10 banking products, 10 levels, 20 achievements, 50 locations, 13 proposed route families, 50 Contracts, 25 events, 10 event chains, 5 crisis arcs, 50 interactions, 30 news templates, 10 tutorials, and 30 notification templates.
- Definition coverage is not runtime completion. All PR #163 content remains production-unauthorized and activation-disabled; map coordinates and adjacency are unverified; an importer, persistence, rollback, runtime capability mapping, staging load, and human approval remain absent.
- Physical-economy calibration is active rather than merely planned: 16,000 deterministic country/difficulty/scenario/seed runs completed, with 25 of 28 quantitative gates passing. Easy and Moderate border-disruption supply recovery and Hard baseline craft success remain failed gates; substitution coverage and salvage/arbitrage checks also remain open.
- Operations and architecture are partially implemented: pinned toolchains, dependency audits, package-signature checks, repeated migration replay/lint, fail-closed staging validation, repository runtime cutover, and Admin architecture ratchets exist. They do not provide isolated environments, immutable release artifacts, SBOM/provenance, observability, backup/restore, incident readiness, or live legacy retirement evidence.

### Current release condition

The application is not yet approved for beta or production runtime cutover because the following remain unresolved:

- connected isolated-staging Player and Admin verification;
- production traffic evidence and credential rotation before live Cloudflare Worker shutdown;
- synchronize PR #163 with current `main`, then revalidate its seed definitions and tooling;
- executable seed content and staging activation;
- apply migration `20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql` in isolated staging and verify connected Admin/Classroom retry replay before runtime promotion;
- migration-history reconciliation;
- backup and restore rehearsal;
- final end-to-end beta verification.

### Current identified-item scoreboard

This table counts stable roadmap IDs only. A checked item is merged and evidence-backed at its stated boundary. An open item may be `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, `PLANNED`, or externally blocked; the detailed line remains authoritative.

| Scope | Verified/checked | Open | Total |
|---|---:|---:|---:|
| Program control | 9 | 1 | 10 |
| Beta capability items | 57 | 39 | 96 |
| Seed-specific items | 0 | 1 | 1 |
| Operations/release items | 0 | 22 | 22 |
| Expansion items | 0 | 109 | 109 |
| **Total identified items** | **66** | **172** | **238** |

### Current phase situation

- **Phase 0 — Program control:** substantially complete; superseded branch-ref cleanup remains open.
- **Phase 1 — Authoritative Player Backend:** complete and merged.
- **Phase 2 — Player connection:** mostly complete; Dashboard, Portfolio, Profile, market orders, and isolated-staging bootstrap remain open.
- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, and game lifecycle are repository-integrated; onboarding, cutscenes, Player recovery, market trade/portfolio, and a runtime story chain remain open.
- **Phase 4 — Seed content/calibration:** definition coverage is broad and measurable, but PR #163 is stale against `main`, six market simulations remain, physical-economy calibration has failed gates, and no importer/rollback/staging activation exists.
- **Phase 5 — Security/release/operations:** validation tooling and several repository controls exist; isolated environments, live migration reconciliation, immutable artifacts, observability, legacy retirement, backup/restore, incident readiness, and staging smoke remain open.
- **Phase 6 — End-to-end pilot:** not yet executed as one authoritative staging-backed sequence.

### Current dependency-ordered priorities

1. Reconcile migration history and establish an isolated staging environment with protected approval.
2. Complete `BETA-MKT-003` through `BETA-MKT-007` so market orders and Portfolio can join the authoritative Player loop.
3. Complete onboarding, cutscene/purpose-built story delivery, and Player recovery states.
4. Synchronize PR #163 with current `main`, preserve its sole ownership, close its failed calibration/map/import/rollback gates, and load only a bounded staging subset.
5. Run the complete Phase 6 sequence, including backup/restore, retry/idempotency, lifecycle pause/end, and cross-game denial.

---

# PART I — CURRENT CAPABILITY LEDGER

## 6. Identity, authentication, and game sessions

**Overall status:** `VERIFIED_COMPLETE` for merged identity, session, authorization, and logout boundaries; shared rate-limit runtime tuning and connected leak-evidence capture remain `IN_PROGRESS`.

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

- [x] `BETA-AUTH-001` Merge authoritative player logout route. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`; `POST /players/me/session/logout` is session-derived, private/no-store, game-scoped, and revokes the current Player session.
- [x] `BETA-AUTH-002` Connect Player Terminal Logout to the reviewed host revocation lifecycle. `VERIFIED_COMPLETE` through PR #182 merged as `6085f5a4c72aec524ee9cb8a3026a43d9610eced`.
- [x] `BETA-AUTH-003` Verify both Player and Admin session expiry return safely to login. `VERIFIED_COMPLETE` through merged PRs #165, #166, and #167 with Player Terminal Verify #109, Admin Shell Smoke #594, Repository Quality #342/#329, and Branch Hygiene #16/#15.
- [x] `BETA-AUTH-004` Add final brute-force, replay, revoked-session, expired-session, and cross-game authorization matrix. `VERIFIED_COMPLETE` through PR #158 with the standard Player security and request-scope suites on the final merged head.
- [ ] `BETA-AUTH-005` Add shared rate limiting by IP, identity, game, and action. `IN_PROGRESS`: the atomic HMAC-keyed foundation, reviewed post-auth dispatch, and credential-blind login pre-auth enforcement merged through PR #158. Staging proxy/HMAC configuration, SQL concurrency evidence, shared-NAT tuning, telemetry, cleanup, and connected runtime probes remain open.
- [ ] `BETA-AUTH-006` Verify no credentials, token hashes, session tokens, or internal UUIDs appear in browser output, logs, fixtures, artifacts, or errors. `IN_PROGRESS`: Backend DTO privacy, browser-payload, fixture, rendered-output, and artifact regression coverage merged through PRs #158, #141, and #222. Connected staging network/log/trace and screenshot evidence remains open.

### Authoritative capability manifest

- [x] `BETA-CAP-001` Publish authenticated `GET /players/me/capabilities`. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.
- [x] `BETA-CAP-002` Version the manifest schema and capability mapping independently. `VERIFIED_COMPLETE`; current schema is `1` and current manifest is `2026-07-19.4`.
- [x] `BETA-CAP-003` Advertise only reviewed, implemented Backend operations and represent unsupported operations as unavailable. `VERIFIED_COMPLETE`; the reviewed endpoint registry drives route/action flags and market orders, Portfolio, Dashboard, and Profile remain false or absent.
- [x] `BETA-CAP-004` Keep the manifest private/no-store, session-scoped, game-isolated, and free of internal UUIDs. `VERIFIED_COMPLETE` through merged request-scope and capability-contract coverage.
- [x] `BETA-CAP-005` Add exact route, method, malformed-path, unsupported-method, expired, revoked, wrong-game, UUID-injection, and response-contract tests. `VERIFIED_COMPLETE` through the merged Player capability and security suites.
- [x] `BETA-CAP-006` Reconcile the manifest after every later Backend tranche and before runtime adapter execution. `VERIFIED_COMPLETE`; current manifest `2026-07-19.4` includes only the merged reviewed endpoint set.

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

- [x] `BETA-ADMIN-001` Complete keyboard-only navigation coverage. `VERIFIED_COMPLETE` through PR #178 merged as `8ae4fc3dc9233b2e826c409680cd362c61509033` with mounted three-viewport, workflow, focus-order, and pointer-free evidence.
- [x] `BETA-ADMIN-002` Complete focus trap, Escape, and focus restoration for every major modal and drawer. `VERIFIED_COMPLETE` through foundation PR #197 merged as `ff9c6207ae2f7284fe753f0a719b0aa0c18017ff` plus corrective exhaustive current-main inventory PR #209.
- [x] `BETA-ADMIN-003` Remove remaining obsolete credential-dialog renderer if still present. `VERIFIED_COMPLETE` through PR #227 merged as `322db9d25fbfc581be59ae0fbe80ca20ce89b42d`; the access-code bridge is event-only, dead Player-create suppression code was removed, the source ratchet prevents return, Repository Quality #931 passed, and Admin Shell Smoke #840 passed all 87 stages.
- [x] `BETA-ADMIN-004` Remove the first global request interception layer and lower the architecture ratchet. `VERIFIED_COMPLETE` via PR #168 merged as `1d487afc766146b5e3e19f718252b3eff9a1168e`; Repository Quality #421, Admin Shell Smoke #606, and Branch Hygiene #17 passed, and the ratchet decreased to 7 fetch assignments / 12 mutation observers.
- [x] `BETA-ADMIN-005` Replace broad session mount observation with an explicit mounted event. `VERIFIED_COMPLETE` through PR #193 merged as `8e9ff38270248d3ce0a46afd4179b371379e5da3`.
- [x] `BETA-ADMIN-006` Add explicit loading, loaded, refreshing, stale, empty, and failed data-state contracts. `VERIFIED_COMPLETE` through PR #231 merged as `249fc53a23ad23058d376e4e394524af0bdee265`; synchronized head `c0f482914ec34352b924d8220cabb1c87a79a23b` passed Repository Quality #949 and Admin Shell Smoke #858 with all 89 stages, including mounted six-state lifecycle, content-preserving refresh/stale behavior, accessibility, and zero-pointer evidence.
- [ ] `BETA-ADMIN-007` Add staging-backed Admin smoke after isolated staging exists.
- [x] `BETA-ADMIN-008` Add the inventory-redemption review queue after Backend handoff. `VERIFIED_COMPLETE` through PR #177 merged as `00ffc841cb7072cb98610e23d20eb4d0cfd60cf8`; Repository Quality #885, Staging Readiness Preflight #58, Database Replay #296, and Admin Shell Smoke #827 with all 87 stages passed.
- [x] `BETA-ADMIN-009` Add emergency game mutation pause/resume controls. `VERIFIED_COMPLETE` through PR #229 merged as `ece5876b0dfc79458afb5b5aaa9266b9884ecbcb`; owner-scoped lifecycle reads and row-locked, idempotent transitions gate ordinary game mutations across draft, active, paused, ended, archived, and unknown states.
- [x] `BETA-ADMIN-010` Verify start, pause, resume, end, archive, session revoke, and join-code reset lifecycle. `VERIFIED_COMPLETE` through PR #229 merged as `ece5876b0dfc79458afb5b5aaa9266b9884ecbcb`; final head `9f7cbab6f718215ec748ee4e78c0dde12a56da0d` passed Admin Game Lifecycle Controls #15, Admin Shell Smoke #875 with all 89 stages, Backend Typecheck #1229, Database Replay #321, Repository Quality #979, Admin API Check #711, Admin Bundle Contract Audit #571, Staging Readiness Preflight #74, Exchange Calendar Runtime #185, and Required Game Market Timezone #206.

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

**Overall status:** `VERIFIED_COMPLETE` for the repository-integrated Contract lifecycle; tutorial content and isolated-staging concurrency evidence remain open.

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

- [x] `BETA-CONTRACT-001` Implement atomic `POST /players/me/contracts/:contractKey/accept`. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.
- [x] `BETA-CONTRACT-002` Reject acceptance for unavailable, expired, non-targeted, already-completed, or locked Contracts while replaying the reviewed desired-state success. `VERIFIED_COMPLETE` through PR #158.
- [ ] `BETA-CONTRACT-003` Make acceptance retry-idempotent. `IN_PROGRESS`: scoped uniqueness, row locking, atomic acceptance, and `alreadyAccepted` replay merged through PR #158; isolated-database concurrency and connected staging evidence remain open.
- [x] `BETA-CONTRACT-004` Connect Player Terminal accept action to the authoritative public-key route. `VERIFIED_COMPLETE` through PR #190 merged as `edabec186da3e751a63a25da239ff43f18cf83a3`.
- [x] `BETA-CONTRACT-005` Verify full connected flow: available → accept → submit → revision → resubmit → approve → reward. `VERIFIED_COMPLETE` at the repository-integrated boundary through PRs #201 and #205; PR #205 merged as `83534ac261b54bc6d96fa599414ba73cc2cd6940` with idempotent reward replay evidence.
- [ ] `BETA-CONTRACT-006` Add introductory tutorial Contract chain. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163: ten arrival tutorials and ten stabilization Contracts exist, but no merged runtime onboarding chain is instantiated.
- [ ] `BETA-CONTRACT-007` Expand seeded Contract library by country, difficulty, economic system, and story phase. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 with 50 machine-readable Contracts across all ten countries; numeric rewards, runtime import, activation, and full phase calibration remain open.
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

- [x] `BETA-STORE-001` Verify connected catalog, quote, purchase, receipt, ledger, and inventory flow. `VERIFIED_COMPLETE` at the code-integrated and clean-replay boundary through PR #207 merged as `520aabc671c1225147907034d1893de3833fca7a`.
- [x] `BETA-STORE-002` Verify insufficient funds, insufficient stock, expired quote, duplicate request, game pause, ended-game behavior, and settlement races. `VERIFIED_COMPLETE` through PR #210 merged as `71cf70da537b38a8e1a03b7cc8034600d2d94eba` plus atomic race guard PR #211 merged as `0c74d8bd7312f231bc8e4dfcd6b869b73c6d2303`.
- [ ] `BETA-STORE-003` Load a bounded approved Store catalog for all ten countries. `IN_PROGRESS`: PR #163 defines 144 country-distributed items, but approved numeric prices, runtime Store records, import, and staging evidence do not exist.
- [ ] `BETA-STORE-004` Define Store item scarcity and difficulty rules. `IMPLEMENTED_NOT_MERGED` on PR #163 through named scarcity bands, restock policy, difficulty policy, resolved matrices, substitutions, maintenance, salvage, and demand records; calibration approval and runtime enforcement remain open.
- [ ] `EXP-STORE-001` Add scheduled availability, regional restrictions, event-driven scarcity, and restock policies.
- [ ] `EXP-STORE-002` Add capability-aware Store pause only if separate from the global game mutation pause.

---

## 11. Inventory, item use, equipment, materials, and redemption

**Overall status:** `VERIFIED_COMPLETE` for authenticated reads and the repository-integrated redemption lifecycle; the broader automated item-effect system remains `PLANNED`.

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

- [x] `BETA-INV-001` Merge authenticated `GET /players/me/inventory`. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.
- [x] `BETA-INV-002` Preserve bounded reads, public item keys, no per-item query loops, and explicit empty/unavailable states. `VERIFIED_COMPLETE` through PR #158 and the connected adapter validation merged with PR #141.

### Required beta redemption workflow

- [x] `BETA-INV-003` Define redemption state machine. `VERIFIED_COMPLETE` through PR #158 and connected lifecycle proof in PR #224.
- [x] `BETA-INV-004` Add migration for redemption request, transition, and audit history. `VERIFIED_COMPLETE` through merged migration `20260718113000_add_inventory_redemption_player_workflow_v1.sql` and repeated Database Replay.
- [x] `BETA-INV-005` Add atomic request/reserve RPC. `VERIFIED_COMPLETE`; the service-role RPC is row-locked, scoped, reservation-safe, and idempotent.
- [x] `BETA-INV-006` Add Player redemption request route. `VERIFIED_COMPLETE` as `POST /players/me/inventory/:itemId/redemptions` with public item keys and session-derived ownership.
- [x] `BETA-INV-007` Add Player redemption history/status read. `VERIFIED_COMPLETE` for collection and public `red_` request-ID reads.
- [x] `BETA-INV-008` Add Admin pending and historical queue. `VERIFIED_COMPLETE` through PR #177 merged as `00ffc841cb7072cb98610e23d20eb4d0cfd60cf8`.
- [x] `BETA-INV-009` Add approve action. `VERIFIED_COMPLETE` through the merged atomic staff-review boundary and PR #224 connected replay evidence.
- [x] `BETA-INV-010` Add reject-with-reason action. `VERIFIED_COMPLETE`; rejection requires a bounded reason and releases the reservation exactly once.
- [x] `BETA-INV-011` Add fulfill action. `VERIFIED_COMPLETE`; fulfillment releases the reservation, consumes owned quantity once, and appends typed evidence atomically.
- [x] `BETA-INV-012` Prevent invalid transitions and repeated consumption. `VERIFIED_COMPLETE` through row locks, transition validation, staff idempotency, uniqueness guards, and PR #224 negative-state evidence.
- [x] `BETA-INV-013` Preserve committed success if refresh fails. `VERIFIED_COMPLETE` through PR #224 merged as `6f9b2f883dd5cba61e059fecf287e5c7a569d7ff`.
- [x] `BETA-INV-014` Verify full connected Store → Inventory → Redemption lifecycle. `VERIFIED_COMPLETE` at the shared-state Player/Admin boundary through PR #224 with exact reservation/consumption accounting, UUID privacy, replay, rejection, and wrong-game denial.

### Full item-system expansion

PR #163 provides an activation-disabled definition and specification layer. The checkboxes remain open because none of these expansion capabilities is merged or executable.

- [ ] `EXP-ITEM-001` Define canonical item taxonomy: consumables, materials, equipment, tools, collectibles, quest items, licenses, documents, and real-world rewards. `IMPLEMENTED_NOT_MERGED` in part on PR #163: 144 definitions cover materials, components, equipment, consumables, and blueprints/authorizations; collectibles, quest items, documents, and real-world-reward approval remain incomplete.
- [ ] `EXP-ITEM-002` Define effect contracts, duration, stacking, cooldown, scope, and audit. `IN_PROGRESS` on PR #163: effect intent, tangible use, difficulty/scarcity policy, server-authority boundaries, and candidate audit records exist; final duration, stacking, cooldown, activation, and persistence contracts are not approved.
- [ ] `EXP-ITEM-003` Implement safe automated consumable effects.
- [ ] `EXP-ITEM-004` Implement equipment slots and bonuses.
- [ ] `EXP-ITEM-005` Implement durability and repair if approved. `IN_PROGRESS` at the definition/specification layer on PR #163 through equipment-maintenance and salvage records plus a unique-equipment backend contract; no runtime implementation is authorized.
- [ ] `EXP-ITEM-006` Implement item scarcity by country, difficulty, events, and production. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163; runtime supply persistence, event application, Store integration, and staging calibration remain open.
- [ ] `EXP-ITEM-007` Implement materials and recipe requirements. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 with 42 materials, 30 components, 60 recipes, difficulty-resolved quantities, substitutions, and demand matrices; atomic runtime consumption is not implemented.
- [ ] `EXP-ITEM-008` Implement item-use and effect-history UI.
- [ ] `EXP-ITEM-009` Simulate balance and exploit resistance for every item effect. `IN_PROGRESS`: PR #163 ran 16,000 deterministic physical-economy combinations and passed 25/28 quantitative gates; three balance gates, substitution exercise, salvage/recraft, buyback-arbitrage, and malicious-concurrency coverage remain open.

---

## 12. Stock market and investments

**Overall status:** `VERIFIED_COMPLETE` for the Backend market engine and authenticated market reads/watchlist; connected Player market orders, Portfolio, scheduled staging ticks, and broader financial instruments remain `IN_PROGRESS` or `PLANNED`.

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

- [x] `BETA-MKT-001` Merge bounded market collection and asset-detail routes. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.
- [x] `BETA-MKT-002` Merge watchlist list/add/remove. `VERIFIED_COMPLETE` through PR #158; current manifest `2026-07-19.4` advertises the reviewed GET/PUT/DELETE watchlist operations.
- [ ] `BETA-MKT-003` Resolve public ticker to internal runtime asset at the order boundary.
- [ ] `BETA-MKT-004` Publish capability manifest for market reads, watchlist, and market orders. `IN_PROGRESS`: manifest `2026-07-19.4` truthfully advertises market reads, asset detail, and watchlist; `marketOrder` remains false until the public-ticker order boundary is reconciled under `BETA-MKT-003`.
- [ ] `BETA-MKT-005` Connect Player Terminal to authoritative market and portfolio routes. `IN_PROGRESS`: market reads, asset detail, and watchlist are connected; Portfolio and market-order execution are not advertised by the current manifest.
- [ ] `BETA-MKT-006` Schedule or safely trigger market ticks in staging and beta.
- [ ] `BETA-MKT-007` Verify market closed, paused, stale price, insufficient funds, insufficient shares, duplicate order, and refresh-failure states.
- [ ] `BETA-MKT-008` Select a calibrated active subset of approximately 20–30 instruments per country.

### Full financial-market expansion

- [ ] `EXP-MKT-001` Ingest and editorially review the full 3,200-instrument library. `IN_PROGRESS` on PR #163: all 3,200 records are materialized and automated structural/editorial checks pass, but the branch is unmerged, eleven lexical warning groups require human review, generated corporate roots are placeholders, and production activation is unauthorized.
- [ ] `EXP-MKT-002` Build issuer master registry. `IN_PROGRESS` on PR #163 with 1,675 stable issuer or administrator IDs and four curated issuer-enrichment sets; six country candidates and final editorial/runtime authority remain incomplete.
- [ ] `EXP-MKT-003` Build exchanges, sectors, industries, commodities, and reference benchmarks. `IN_PROGRESS` on PR #163: ten canonical exchange codes and reference/identity registries exist, while full sector, industry, commodity, benchmark, and runtime integration remains incomplete.
- [ ] `EXP-MKT-004` Add calibrated issuer financial statements and event exposure. `IN_PROGRESS` on PR #163: Northreach, Yrethia, Thaloris, and Solvend have deterministic enrichment/simulation evidence; six countries and cross-market calibration remain open.
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

**Overall status:** `VERIFIED_COMPLETE` for authenticated cash and ledger read surfaces; exactly-once mutation invariants are merged and replay-verified, while the new staff-adjustment RPC remains pending isolated-staging deployment.

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

### Beta completion and deployment boundary

- [x] `BETA-BANK-001` Merge authoritative ledger route. `VERIFIED_COMPLETE` through PR #213 merged as `aee11e06c44dc9b6cd3ee2a386be215cef3c5536`; the authenticated `GET /players/me/ledger` boundary is private/no-store, UUID-private, rate-limited, game-scoped, and cursor-bounded.
- [x] `BETA-BANK-002` Connect Player Terminal Banking read model. `VERIFIED_COMPLETE` through PR #213 plus correction PR #221 merged as `26eecaa1ed04e3aa0909c75be269491a975fad70`.
- [x] `BETA-BANK-003` Verify cross-currency display, pagination, stale state, and empty state. `VERIFIED_COMPLETE` through PRs #213 and #221 with Player Terminal Verify #298, complete Node verification, and desktop/mobile Chromium evidence.
- [ ] `BETA-BANK-004` Verify every economic mutation produces exactly one expected ledger outcome. `IN_PROGRESS`: repository and migration authority merged through PR #230 as `b8d227d8d8d0cd178efc63935371ab53eee8b78b`. The mandatory invariant matrix covers automatic and manual Attendance rewards, Contract cash rewards, Store purchases, stock buy/sell settlement, Admin/Classroom adjustments, exact balance projection, replay, conflicting-key reuse, rejection, locked state, invalid input, and cross-game zero-write behavior. Migration `20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql` replayed from zero twice and linted cleanly in Database Replay #306. Per the roadmap completion rule, this item remains open until that migration is applied and the connected retry/replay path is verified in isolated staging.

### Expansion

- [ ] `EXP-BANK-001` Define player-to-player transfer contract using server-side Player ID resolution.
- [ ] `EXP-BANK-002` Implement atomic transfers and audit.
- [ ] `EXP-BANK-003` Implement savings accounts and transfers.
- [ ] `EXP-BANK-004` Implement savings interest.
- [ ] `EXP-BANK-005` Define loan products, eligibility, and disclosures. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 through ten banking products, including credit, training, equipment-finance, trade-finance, and recovery products with disclosure and recovery requirements; rates, fees, limits, eligibility calculations, and runtime authority remain calibration-pending.
- [ ] `EXP-BANK-006` Implement loan application and approval.
- [ ] `EXP-BANK-007` Implement repayment, interest, delinquency, and default.
- [ ] `EXP-BANK-008` Implement creditworthiness without sensitive demographic data.
- [ ] `EXP-BANK-009` Implement business loans after Business system authority exists.
- [ ] `EXP-BANK-010` Simulate inflation, exchange, interest, and difficulty interactions.

---

## 14. Story, news, notifications, war, and campaign

**Overall status:** `IN_PROGRESS`; the merged event/notification foundation exists, and PR #163 supplies an unmerged activation-disabled campaign definition layer. No complete campaign is runtime-playable.

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

- [x] `BETA-NOTIF-001` Merge notification list. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.
- [x] `BETA-NOTIF-002` Merge mark-read. `VERIFIED_COMPLETE` through PR #158; current manifest advertises `POST /players/me/notifications/read`.
- [x] `BETA-NOTIF-003` Add unread count and pagination to Player Terminal. `VERIFIED_COMPLETE` through PR #216 merged as `3a8e8e045aa6d2c53bc79061447dfa8800e95264`.
- [x] `BETA-NOTIF-004` Render player-safe notification categories. `VERIFIED_COMPLETE` through PR #216 with bounded category normalization and no generic raw-payload rendering.
- [ ] `BETA-NOTIF-005` Connect story cutscene modal.
- [ ] `BETA-NOTIF-006` Preserve purpose-built story payload delivery without exposing generic raw payload JSON.

### Beta campaign

PR #163 defines immigrant openings, economic opportunity and pressure events, Meridian disruption, confidence, cyber, food/energy, reconstruction, ten country chains, and five crisis arcs. These records are definition-only and do not satisfy runner, cutscene, persistence, scheduling, or staging acceptance.

- [ ] `BETA-STORY-001` Implement one complete playable campaign arc. `IN_PROGRESS`: PR #163 contains a complete definition-layer campaign graph, but no merged runtime runner, scheduler, persistence, cutscene delivery, or staging playthrough exists.
- [ ] `BETA-STORY-002` Begin with the player arriving as a new immigrant. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 through ten country immigrant openings, arrival packages, messages, tutorials, and stabilization Contracts; runtime onboarding remains open.
- [ ] `BETA-STORY-003` Establish the Meridian boom and economic opportunity. `IN_PROGRESS` at the definition layer on PR #163 through ten country sector-expansion events and Meridian opportunity content; runtime activation remains open.
- [ ] `BETA-STORY-004` Introduce rivalry, shortages, and political hostility. `IN_PROGRESS` at the definition layer on PR #163 through country pressure events, interactions, news, scarcity, and corridor-disruption records; runtime activation remains open.
- [ ] `BETA-STORY-005` Trigger a Meridian attack with uncertain attribution. `IN_PROGRESS` at the narrative-definition layer on PR #163; executable trigger, attribution state, player evidence flow, and staging proof remain absent.
- [ ] `BETA-STORY-006` Escalate to open war and civilian economic adaptation. `IN_PROGRESS` at the definition layer on PR #163 through war, disruption, shortage, adaptation, and recovery content; no executable campaign state machine is merged.
- [ ] `BETA-STORY-007` Introduce loyalty, residency, and relationship pressure. `IN_PROGRESS` at the narrative-definition layer on PR #163; runtime reputation, residency, relationship persistence, and choice consequences remain unimplemented.
- [ ] `BETA-STORY-008` Resolve through ceasefire, continued conflict, or reconstruction paths. `IN_PROGRESS` at the definition layer on PR #163 through resolution models, cancellation matrices, outcome reactions, and reconstruction events; runtime branching remains open.
- [ ] `BETA-STORY-009` Keep the player economically influential but not automatically a national leader or military commander. `IMPLEMENTED_NOT_MERGED` as a narrative constraint on PR #163; runtime enforcement and complete playtest evidence remain open.
- [ ] `BETA-STORY-010` Add bounded news, events, Contracts, Store scarcity, market shocks, and notifications for every campaign phase. `IN_PROGRESS` at the definition layer on PR #163 with machine-readable coverage across these domains; cross-domain runtime execution and calibration remain open.
- [ ] `BETA-STORY-011` Implement runner HTTP/scheduler integration.
- [ ] `BETA-STORY-012` Add replay-safe and idempotent event execution. `IN_PROGRESS`: the merged foundation includes idempotent event resolution and PR #163 defines cancellation/progression policies, but the campaign runner and connected replay evidence remain absent.
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

**Overall status:** `VERIFIED_COMPLETE` for the hardened frontend, authoritative runtime adapter, capability preflight, and manifest-advertised routes; full beta read/write coverage and isolated-staging bootstrap remain `IN_PROGRESS`.

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

- [x] `BETA-PLAYER-001` Install the Student-Profile adapter before `PlayerApi` construction. `VERIFIED_COMPLETE` through cleaned PR #141 merged as `566d99fab5668cf42d6275ec8d12c580239a3137`.
- [x] `BETA-PLAYER-002` Select `/functions/v1/classroom-api` explicitly. `VERIFIED_COMPLETE` through PR #141.
- [x] `BETA-PLAYER-003` Prohibit `/api/player` fallback in Student-Profile connected mode. `VERIFIED_COMPLETE` through PR #141 and the runtime-cutover ratchets merged in PRs #217 and #222.
- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-19.4`.
- [x] `BETA-PLAYER-005` Validate advertised capability-to-adapter coverage at startup. `VERIFIED_COMPLETE` through PR #141 capability-contract validation.
- [x] `BETA-PLAYER-006` Fail closed before execution when capability and route mappings disagree. `VERIFIED_COMPLETE` through PR #141.
- [x] `BETA-PLAYER-007` Preserve approved product surfaces with truthful Integration Pending or Unavailable states. `VERIFIED_COMPLETE` through PR #180 merged as `6a30e48d23f5ecb8b4e69794823863a49ce7254a`.
- [ ] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `IN_PROGRESS`: manifest-advertised World, News, Market reads, Store, Contracts, Inventory, Banking, and Notifications are connected; Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.
- [ ] `BETA-PLAYER-009` Connect Store, Contract, Market, watchlist, notification, redemption, and logout writes. `IN_PROGRESS`: Store, Contract, watchlist, notification-read, redemption, and logout writes are connected; `marketOrder` remains unavailable.
- [ ] `BETA-PLAYER-010` Verify desktop and mobile connected bootstrap in isolated staging. Repository-connected desktop/mobile fixtures pass; environment-backed staging evidence remains open.
- [x] `BETA-PLAYER-011` Verify session replacement abort and stale-result rejection. `VERIFIED_COMPLETE` through the Player Terminal verification chain retained by PR #141 and later runtime-cutover merges.
- [x] `BETA-PLAYER-012` Verify no ownership UUID appears in URLs, payloads, models, fixtures, or rendered output. `VERIFIED_COMPLETE` for repository and Chromium evidence through PRs #158, #141, and #224; connected logs/traces remain separately tracked under `BETA-AUTH-006`.
- [ ] `BETA-PLAYER-013` Verify committed-success behavior for every economic write. `IN_PROGRESS`: Store, Contract, and Inventory redemption committed-success paths are covered; market-order execution and isolated-staging ambiguity evidence remain open.
- [ ] `BETA-PLAYER-014` Verify offline, timeout, ambiguous write, 429, and session-expiry recovery. `IN_PROGRESS`: frontend recovery contracts and safe expiry exit are merged; connected isolated-staging retry/rate-limit evidence remains open.

---

# PART II — EXECUTION ROADMAP

## 16. Phase 0 — Program control and repository consolidation

**Goal:** Ensure one authority exists for every capability and every completion claim.

- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 at current `main` `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`; PR #163 remains the only open PR.
- [x] `P0-002` Update this roadmap audit metadata, active authority table, current status precision, and identified-item scoreboard. Refreshed in the 2026-07-20 comprehensive re-audit.
- [x] `P0-003` Keep PR #158 as the only Backend reconciliation authority through merge. Completed: PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`; no replacement Backend reconciliation PR is active.
- [x] `P0-004` Keep PR #163 as the current seed-content foundation branch. Verified: it remains the sole open seed-content authority and remains draft.
- [x] `P0-005` Reconcile donor work intentionally. PR #143 remains donor/reference only; PR #141 was cleaned, bounded, verified, and merged as the authoritative Player runtime adapter.
- [ ] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. Temporary roadmap branches were removed after merge; a reliable owner-safe inventory and cleanup of older superseded refs remains open because the branch-search connector returned no authoritative listing.
- [x] `P0-007` Add and maintain a capability ownership registry.
- [x] `P0-008` Add a reverse-chronological change ledger to this document after every merged tranche.
- [x] `P0-009` Require every future implementation prompt to reference this exact authoritative path.
- [x] `P0-010` Check branch and PR ownership before creating a new branch.

### Capability ownership registry

| Capability | Authority | Status | Collision rule |
|---|---|---|---|
| Authenticated Player Backend | PR #158 / merge `d403cf7baefeb3c1015c282cdbd748d2050e87ac` | `VERIFIED_COMPLETE` | No replacement Backend reconciliation branch; later work must use a narrowly owned roadmap item. |
| Seed-content definition, calibration, and executable-content preparation | PR #163 / `agent/seed-content-foundation-v1` | `IN_PROGRESS` | Sole active seed authority; do not create another seed-content branch or merge/activate before its gates close. |
| Player runtime adapter and capability preflight | PR #141 / merge `566d99fab5668cf42d6275ec8d12c580239a3137` | `VERIFIED_COMPLETE` | Preserve explicit `classroom-api` routing and fail-closed manifest validation. |
| Player runtime cutover and legacy source retirement | PRs #217 and #222 | repository code `VERIFIED_COMPLETE`; operations `IN_PROGRESS` | Do not restore the legacy frontend or Cloudflare browser transport; retire live Worker only through approved operational change control. |
| Inventory redemption lifecycle | PRs #158, #177, and #224 | `VERIFIED_COMPLETE` at repository-integrated boundary | Extend the existing public-key, row-locked, idempotent lifecycle; PR #143 remains reference only. |
| Staging readiness validation | PR #169 / merge `ca642b1dfd6a2965612869e05b4fa1bd5840c437` | tooling `VERIFIED_COMPLETE`; external evidence `IN_PROGRESS` | Do not claim staging readiness from validator tests alone; supply current environment, migration, artifact, rollback, restore, and approval evidence. |
| Banking and economic-ledger invariants | PRs #213, #221, and #230 | reads `VERIFIED_COMPLETE`; staff-adjustment staging application `IN_PROGRESS` | Apply and verify the merged migration in isolated staging before runtime promotion. |
| Admin game lifecycle controls | PR #229 / merge `ece5876b0dfc79458afb5b5aaa9266b9884ecbcb` | `VERIFIED_COMPLETE` | Preserve canonical lifecycle states, mutation gating, idempotency, and session/join-code revocation semantics. |
| Accepted Admin source preservation | `frontend/admin-terminal-source-v1` | retained exception | Preserve per `CONTRIBUTING.md`; do not treat as active feature authority. |

**Exit gate:** No overlapping active branch owns the same capability, and this roadmap reflects the current repository.

---

## 17. Phase 1 — Authoritative Player Backend (completed)

**Goal:** Make the authenticated Player API authoritative and mergeable.

PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`. The historical implementation sequence covered notifications, logout, capability manifest, Contract acceptance, Inventory redemption, security/privacy, migration replay/lint, runtime contracts, and full verification.

Required gates:

- [x] Backend Typecheck.
- [x] Backend tests and complete smoke chain.
- [x] Database Replay twice from zero.
- [x] Database lint.
- [x] Repository Quality.
- [x] Admin API Check.
- [x] Player Terminal contract verification where shared contracts were affected.
- [x] Wrong-role, wrong-game, wrong-player, expired, revoked, replay, idempotency, and UUID-injection tests.
- [x] No production deployment occurred before merge; isolated-staging promotion remains governed by Phase 5.

**Exit gate:** Met. PR #158 is merged, donor work is no longer required for Backend authority, and the current implemented endpoint set is represented by capability manifest `2026-07-19.4`.

---

## 18. Phase 2 — Connect the Player Terminal

**Goal:** Convert the hardened standalone Player Terminal into the authoritative live client.

- [x] Install adapter before API client construction.
- [x] Bind explicitly to `classroom-api`.
- [x] Consume normalized host Player session.
- [x] Validate capability manifest schema and version.
- [x] Reconcile every advertised endpoint key with a reviewed frontend route.
- [ ] Connect all beta reads. `IN_PROGRESS`: Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.
- [ ] Connect all beta writes. `IN_PROGRESS`: market-order execution is not advertised; reviewed Store, Contract, watchlist, notification, redemption, and logout writes are connected.
- [x] Connect logout through the host revocation lifecycle.
- [x] Add fail-closed integration mismatch states.
- [x] Run repository-connected browser tests.
- [x] Run mobile and desktop tests.
- [x] Verify preview isolation.
- [x] Verify no speculative or `/api/player` fallback requests.
- [ ] Run isolated-staging connected bootstrap, retry, and network-evidence capture.

**Exit gate:** Open. A real authenticated Player must still complete the full base loop in isolated staging without preview data, including the currently unavailable market-order and remaining read surfaces.

---

## 19. Phase 3 — Close beta gameplay gaps

**Goal:** Finish the minimum complete loop before content scale-up.

- [x] Contract acceptance. Repository-integrated lifecycle verified through PRs #190, #201, and #205.
- [x] Inventory redemption. Player/Admin shared lifecycle verified through PRs #158, #177, and #224.
- [x] Notification inbox, unread count, pagination, mark-read, and player-safe categories.
- [ ] Story cutscene modal and purpose-built payload delivery.
- [ ] Minimal onboarding. `IN_PROGRESS`: PR #163 defines ten arrival packages, messages, tutorials, and stabilization Contracts; the arrival class system is explicitly not started and no runtime onboarding flow is merged.
- [x] Game lifecycle start, pause, resume, end, archive, and session revoke. Merged through PR #229.
- [x] Emergency economic mutation pause. Merged through PR #229; isolated-staging connected verification remains part of the release gate.
- [ ] Player-facing recovery states.
- [ ] One complete tutorial Contract chain. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163; runtime instantiation and staging playthrough remain open.
- [x] One complete Store purchase and Inventory redemption chain at the repository-integrated boundary through PRs #207, #210, #211, and #224.
- [ ] One complete Market trade/portfolio chain.
- [ ] One complete story event and notification chain. `IN_PROGRESS` at the definition layer on PR #163; runtime event activation, notification/cutscene delivery, and replay evidence remain open.

**Exit gate:** Every core loop has one end-to-end authoritative path and one failure/retry path.

---

## 20. Phase 4 — Executable seed content and calibration

**Goal:** Replace design-only records with deterministic, reviewable, executable staging content.

### Current PR #163 evidence boundary

- PR #163 remains draft and is a validated design-definition/calibration branch, not a deployable seed release. Current audited head: `ad73fbe23dffd8556e58f363b6dd833daa93cd74`. It is 98 current-main commits behind and must be synchronized before merge review.
- The definition layer contains ten 320-record country JSONLs: exactly 3,200 unique stable IDs, symbols, and display names, with 1,675 stable issuer or administrator IDs. Every record remains activation-disabled and runtime-unverified.
- The bounded-selection layer contains 240 candidate instruments across all ten countries. Four country candidates are curated/enriched; six are selection-complete and enrichment-pending. No candidate is activation-authorized.
- The physical-economy layer contains 144 item definitions and a 60-recipe graph with difficulty, substitution, scarcity, maintenance, salvage, and demand policies. Numeric prices, effect coefficients, recipe activation, production import, and runtime capability remain approval-blocked.
- Ten machine-readable arrival packages, messages, tutorials, and stabilization Contracts exist. Numeric starting values and runtime instantiation remain blocked.
- The deterministic coverage audit reports 11/11 target groups met: 50 Contracts, 10 banking products, 10 progression levels, 20 achievements, 25 events, 10 event chains, 5 crisis arcs, 50 interactions, 30 news templates, 10 tutorials, and 30 notification templates.
- Northreach, Yrethia, Thaloris, and Solvend have deterministic pilot evidence. The other six countries and cross-market calibration remain incomplete.
- Current validation reports zero structural errors, all nine seed-preflight tests passing, and 16 remaining blockers: 15 runtime/dependency domains plus the unverified 50-location map registry. Physical-economy calibration completed 16,000 deterministic runs with 25/28 quantitative gates passing.
- No executable importer, production migration, deployment, runtime activation, approved numeric calibration, rollback rehearsal, or staging load exists.

- [x] Ingest the 3,200-instrument library into repository-controlled definition-layer source files.
- [ ] Select and approve a bounded active market subset. `IN_PROGRESS`: 240 candidates are selected, but six require enrichment and all remain activation-disabled.
- [ ] Complete issuer, exchange, sector, industry, commodity, and benchmark registries. `IN_PROGRESS`: stable issuer IDs and canonical exchanges exist; enrichment/editorial approval remains incomplete.
- [ ] Verify canonical countries, currencies, locations, adjacency, and routes. `IN_PROGRESS`: PR #163 defines 50 candidate locations and 13 proposed route families, but map points are null, adjacency and geometry are unverified, and no runtime schema is approved.
- [ ] Correct map profiles and coordinates using the approved artwork and polygon evidence.
- [x] Convert ten arrival packages, messages, tutorials, and stabilization Contracts into machine-readable definition records.
- [ ] Approve numeric starting balances, items, Contracts, affordability, and recovery paths through simulation.
- [ ] Create bounded runtime Store catalogs. `IN_PROGRESS`: 144 item definitions plus scarcity/difficulty/restock policies exist; approved numeric prices, executable Store import, and staging activation remain blocked.
- [x] Create tutorial and introductory Contract definitions.
- [x] Create campaign event, news, interaction, tutorial, and notification definition coverage.
- [x] Create deterministic fixture and audit inputs for the definition layer and four pilot simulations.
- [ ] Complete physical-economy calibration. `IN_PROGRESS`: 16,000 deterministic runs passed 25/28 quantitative gates; Easy/Moderate border-disruption recovery, Hard baseline crafting, substitution coverage, salvage/recraft, and buyback-arbitrage checks remain open.
- [ ] Implement an environment-restricted, idempotent seed importer.
- [ ] `SEED-PREFLIGHT-001` Merge deterministic fail-closed seed-content preflight validation. `IMPLEMENTED_NOT_MERGED` on draft PR #163; all nine focused tests pass and staging/production modes remain fail-closed while blockers exist.
- [ ] Implement deactivation and rollback.
- [ ] Run reproducible economic and market simulations for all ten countries. `IN_PROGRESS`: four country pilots are current; six remain.
- [ ] Complete cross-market calibration and record approved seeds, inputs, outputs, integrity checks, and balance decisions.
- [ ] Load only a bounded approved subset into isolated staging and verify Admin/Player behavior.

**Exit gate:** A clean staging environment can be seeded deterministically and rolled back without manual correction.

---

## 21. Phase 5 — Beta security, release, and operations

**Goal:** Make the beta survivable, observable, reversible, and secure.

- [ ] `OPS-STAGE-001` Reconcile live and repository migration history.
- [ ] `OPS-STAGE-002` Export live schema, grants, policies, Auth configuration, function inventory, and migration ledger.
- [ ] `OPS-STAGE-003` Restore into an isolated project and compare with clean replay.
- [ ] `OPS-STAGE-004` Contain or retire legacy Edge Functions and Cloudflare Worker routes. `IN_PROGRESS`: PRs #217 and #222 removed the browser Cloudflare transport and legacy Player source from the repository; live traffic inventory, observation window, credential rotation, Worker/function disablement, and restore evidence remain open.
- [ ] `OPS-STAGE-005` Rotate legacy credentials.
- [ ] `OPS-STAGE-006` Create isolated development, staging, and production environments.
- [ ] `OPS-STAGE-007` Add protected approval for staging and production. `IN_PROGRESS` at the tooling layer: the merged staging preflight targets a named GitHub `staging` environment, but actual isolated environment identities, required approvers, and production protection evidence remain absent.
- [ ] `OPS-ARTIFACT-001` Build immutable artifacts from merge commits. `IN_PROGRESS` at the validation-contract layer through PR #169; no reviewed immutable frontend and Edge artifact set has been built and promoted.
- [ ] `OPS-ARTIFACT-002` Generate release manifest with hashes, migration head, config version, and feature flags. `IN_PROGRESS`: a fail-closed manifest schema and validator merged through PR #169, but no complete evidence-backed release manifest exists.
- [ ] `OPS-SUPPLY-001` Add secret scanning, dependency review, SBOM/provenance, and patch cadence. `IN_PROGRESS`: exact Node/npm/tool pins, lockfiles, high-severity dependency audit thresholds, and package-signature checks run in Repository Quality; secret scanning, dependency-review enforcement, SBOM, provenance, automated update policy, and approved patch cadence remain open.
- [ ] `OPS-ACCESS-001` Add leaked-password protection and staff access policy.
- [ ] `OPS-RATE-001` Add rate limiting. `IN_PROGRESS`: shared HMAC-keyed storage, atomic consumption, reviewed Player post-auth dispatch, and credential-blind login pre-auth enforcement merged through PR #158. Runtime proxy/HMAC configuration, SQL concurrency evidence, shared-NAT tuning, cleanup, telemetry, and staging probes remain open.
- [ ] `OPS-OBS-001` Add structured logs, request IDs, release SHA, safe actor/game identifiers, latency, DB metrics, and outcome classes.
- [ ] `OPS-OBS-002` Add dashboards and alerts.
- [ ] `OPS-BACKUP-001` Add backup retention.
- [ ] `OPS-BACKUP-002` Create encrypted off-platform backup.
- [ ] `OPS-RESTORE-001` Rehearse full restore.
- [ ] `OPS-RESTORE-002` Define and rehearse RPO/RTO.
- [ ] `OPS-INCIDENT-001` Define incident severity, ownership, communications, classroom fallback, and correction procedures.
- [ ] `OPS-PERF-001` Add load fixtures and query-plan review.
- [ ] `OPS-PERF-002` Add missing foreign-key indexes based on evidence.
- [ ] `OPS-SMOKE-001` Complete staging-backed Admin and Player smoke.

PR #169 merged the fail-closed staging-readiness validator, protected workflow, template, and operator runbook as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`. Repository Quality also enforces pinned toolchains, dependency vulnerability thresholds, package-signature checks, repository audits, and backend dependency audits. The tooling supports `OPS-STAGE-001` through `OPS-STAGE-007`, `OPS-ARTIFACT-001`/`002`, `OPS-STAGE-004`, and `OPS-RESTORE-001`/`002`, but does not claim the still-missing external environment, migration-ledger, artifact, rollback, restore, approval, or promotion evidence.

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

**Status:** `PLANNED` for an authoritative runtime. PR #163 contains supporting business-oriented Contracts, banking products, items, events, and simulation assumptions, but no coherent business-entity lifecycle or executable persistence model.

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

**Status:** `IMPLEMENTED_NOT_MERGED` for the activation-disabled definition/specification layer on PR #163; runtime persistence, atomic jobs, UI, and approved balance remain `PLANNED` or `IN_PROGRESS`.

- [ ] `EXP-CRAFT-001` Define recipe schema and stable public IDs. `IMPLEMENTED_NOT_MERGED` on PR #163 with a 60-recipe versioned manifest and stable recipe/item keys.
- [ ] `EXP-CRAFT-002` Define material quantities, tools, difficulty, duration, output, quality, and failure rules. `IMPLEMENTED_NOT_MERGED` at the definition/specification layer on PR #163 through tiered recipes, difficulty-resolved matrices, deterministic rules, and a backend contract; final runtime DTO/storage approval remains open.
- [ ] `EXP-CRAFT-003` Implement atomic material consumption and output grant.
- [ ] `EXP-CRAFT-004` Implement recipe unlocks.
- [ ] `EXP-CRAFT-005` Connect scarcity and country availability. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 through scarcity/restock, substitution, source-country, difficulty, and demand policies; runtime supply persistence and event application remain open.
- [ ] `EXP-CRAFT-006` Connect crafting to Contracts, Business, progression, and Marketplace.
- [ ] `EXP-CRAFT-007` Add Player and Admin UI.
- [ ] `EXP-CRAFT-008` Add deterministic fixtures and balance simulation. `IN_PROGRESS`: PR #163 includes deterministic physical-economy fixtures and 16,000 runs, but 3/28 quantitative gates fail and substitution, salvage/recraft, buyback-arbitrage, concurrency, and complete country calibration remain unresolved.

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

**Status:** `IMPLEMENTED_NOT_MERGED` for basic activation-disabled level and achievement definitions on PR #163; authoritative reads, claims, unlocks, reputation, Admin correction, and full balance remain `PLANNED`.

- [ ] `EXP-PROG-001` Define experience, levels, skills, rewards, achievements, and public/private fields. `IMPLEMENTED_NOT_MERGED` in part on PR #163: ten levels and twenty achievements are machine-readable, while numeric thresholds, skills, economic rewards, privacy classification, and runtime storage remain incomplete.
- [ ] `EXP-PROG-002` Define economic specialization without a permanently dominant path.
- [ ] `EXP-PROG-003` Implement progression reads.
- [ ] `EXP-PROG-004` Implement skill unlock and reward claim atomically.
- [ ] `EXP-PROG-005` Implement country, career, story, and relationship reputation.
- [ ] `EXP-PROG-006` Connect progression to Contracts, Business, crafting, market access, and story.
- [ ] `EXP-PROG-007` Add Admin correction and audit.
- [ ] `EXP-PROG-008` Simulate progression speed and exploit resistance. `IN_PROGRESS` only at the physical-economy access layer on PR #163; complete progression timing, reward inflation, claim replay, class interaction, and exploit simulation remain open.

---

## 28. Arrival class system

**Status:** `PLANNED`; PR #163 explicitly records Workstream 11 as deferred and implementation not started. Candidate dimensions, class families, constraints, storage requirements, and tests are backlog guidance only.

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

**Status:** `IN_PROGRESS` at the activation-disabled definition layer on PR #163; current runtime supports country-level map interaction only. Exact locations, adjacency, routes, travel, immigration, and war-route behavior are not executable.

- [ ] `EXP-GEO-001` Verify 50 canonical locations. `IN_PROGRESS`: PR #163 defines 50 stable candidate locations, five per country, but every map point is null and final naming/artwork verification remains pending.
- [ ] `EXP-GEO-002` Verify exact coordinates and map artwork. `PLANNED` after the structural audit: active artwork, terrain, coastlines, capital-marker semantics, Lumenor/Xalvoria profile correction, and all 50 coordinates require visual evidence.
- [ ] `EXP-GEO-003` Define land, sea, air, and Meridian route adjacency. `IN_PROGRESS`: PR #163 proposes 13 route families, but explicitly approves no land-border claim and lacks verified adjacency, endpoint geometry, movement rules, and wartime behavior.
- [ ] `EXP-GEO-004` Implement travel eligibility, time, and cost.
- [ ] `EXP-GEO-005` Implement location state and location-targeted Contracts/events.
- [ ] `EXP-GEO-006` Implement border closures, shortages, and war-route effects.
- [ ] `EXP-GEO-007` Implement later immigration and residency pathways.
- [ ] `EXP-GEO-008` Implement map interaction and route visualization. `IN_PROGRESS`: country polygon interaction exists in the Player Terminal; capital, city, site, route, disruption, and travel visualization remain unimplemented.
- [ ] `EXP-GEO-009` Add path validation and impossible-route tests.

---

## 30. Long-term architecture and production maturity

**Status:** `IN_PROGRESS`. Several containment and ratchet steps are merged, but the target architecture and production operating model are not complete.

- [ ] Retire all unknown legacy backend traffic. `IN_PROGRESS`: repository Player transport/source retirement is complete, while live Worker and legacy-function traffic/disposition evidence remains open.
- [ ] Establish one typed versioned client. `IN_PROGRESS`: the Player runtime adapter and versioned capability contract are authoritative; Admin and remaining domains do not yet share one strict typed client.
- [ ] Eliminate global fetch wrappers. `IN_PROGRESS`: the first global interception layer was removed and the current Admin architecture ratchet permits a maximum of 7 `window.fetch` assignments; the target remains zero.
- [ ] Reduce MutationObservers to genuine DOM-observation requirements. `IN_PROGRESS`: explicit mounted-event work reduced the current Admin ratchet maximum to 11 observers; every remaining site still requires justification or extraction.
- [ ] Split Admin by bounded context.
- [ ] Extract accepted v606 panels under visual parity tests.
- [ ] Introduce reusable accessible design-system components.
- [ ] Add privacy classification, retention, deletion, and export workflows.
- [ ] Add third-party processor review.
- [ ] Measure strict-type coverage, complexity, bundle size, flaky tests, replay time, dependency age, legacy traffic, and recovery results.
- [ ] Run quarterly restore exercises.
- [ ] Maintain an immutable release and change-control process. `IN_PROGRESS`: branch/PR gates, repeated database replay, a fail-closed staging manifest contract, and protected workflow tooling exist; immutable artifact promotion, approvals, rollback, restore, and production evidence remain open.

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

### 2026-07-20 — Comprehensive repository and roadmap re-audit

- Audited current `main` `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`; application implementation remains represented by baseline `b700147f03be26e1663437135878c6736f55b805` because all later mainline changes are roadmap-only.
- Confirmed PR #163 is the only open PR and sole seed authority at `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; it is 407 seed commits beyond merge base `d403cf7baefeb3c1015c282cdbd748d2050e87ac` and 98 current-main commits behind.
- Reclassified understated unmerged definition work for Contracts, Store scarcity, items, Crafting, financial-market registries, banking products, progression, campaign content, locations, and routes while preserving all runtime, approval, staging, and production blockers.
- Recorded the 144-item/60-recipe physical-economy graph and its 16,000-run calibration result: 25/28 quantitative gates pass; three quantitative failures plus substitution, salvage/recraft, arbitrage, and concurrency gaps prevent activation.
- Reclassified operations and architecture controls as partial where evidence exists: dependency auditing, package signatures, pinned tooling, replay/lint, staging validation, Player legacy-source retirement, capability versioning, and Admin fetch/observer ratchets.
- Added a generated identified-item scoreboard, phase situation, and dependency-ordered priority sequence. No application source, migration, route, RPC, seed runtime, credential, environment, or deployment changed in this roadmap-only tranche.

### 2026-07-20 — Post-merge roadmap baseline seal

- PR #239 merged the full application-state reconciliation as `b700147f03be26e1663437135878c6736f55b805`.
- Defined `b700147f03be26e1663437135878c6736f55b805` as the audited application-state baseline; later roadmap-only merge commits are evidence updates and do not imply application-state changes.
- Roadmap-only correction; no application source, migration, route, RPC, seed content, credential, environment, or runtime changed.

### 2026-07-20 — Full merged-repository and roadmap reconciliation

- Audited `main` at `4e3c123c98c37a2b5d26a93e67bfb31c3b722925`, all open PRs, merged PR metadata, current Backend tests, Player runtime adapter, capability manifest `2026-07-19.4`, and the current PR #163 seed evidence boundary.
- Reclassified stale PR #158, #141, #169, Contract, Store, Inventory, Market-read/watchlist, notification, Player adapter, Phase 0, Phase 1, and Phase 2 statements against merged authority. Historical ledger entries were preserved as historical evidence rather than rewritten.
- Marked only repository-proven items complete. Kept shared rate-limit runtime proof, connected leak evidence, Contract concurrency, market orders/Portfolio, full Player read/write coverage, isolated-staging bootstrap, Banking migration application, seed runtime activation, map verification, six country simulations, release operations, and beta E2E open.
- Confirmed PR #163 remains the sole open seed authority and remains draft/non-deployable. No seed code, migration, runtime, deployment, or content activation changed in this reconciliation.
- Roadmap-only branch: `agent/roadmap-full-reconciliation-v1`. No application source, migration, route, RPC, credential, environment, or runtime was modified.

### 2026-07-18 — Admin redemption review and authoritative rate-limit dispatch on PR #158

- `BETA-INV-008` through `BETA-INV-012` are `IMPLEMENTED_NOT_MERGED` on branch `agent/player-backend-reconciliation-v2`, PR #158, commit `f88a6d60e8d4b13b07790e3d8e38ba054c2547ff`. Nine files add forward migration `20260718123000_add_inventory_redemption_admin_review_v1.sql`, service-role-only RPCs `read_admin_inventory_redemptions_v1` and `review_inventory_redemption_atomic_v1`, Admin API queue route `GET /games/:gameId/inventory/redemptions`, and public-request-ID approve/reject/fulfill routes. Staff ownership is verified in both router and RPC; retries resolve before mutation; approve retains reservations; reject releases them with a required reason; fulfill releases and consumes once; transitions, audits, and typed `RELEASED`/`USED` Inventory events are append-only. Unsupported automated effects remain `not_automated`; Admin v606 files were untouched.
- Admin-redemption local evidence after integration: 40 Inventory/migration tests and 10 focused Admin redemption tests passed; Backend TypeScript passed; migration audit passed with 64 unique forward migrations; root repository/Admin v606 gates passed; and `git diff --check` passed. GitHub Admin API, Backend Typecheck, Database Replay, and Repository Quality on the published head remain required; no migration was applied and no runtime was mutated.
- `BETA-AUTH-005` / `OPS-RATE-001` authoritative dispatch is `IMPLEMENTED_NOT_MERGED` at `50254c6b4d133bc211b40dc13ce9e6592d8ee08e`. Fourteen files add credential-blind login pre-auth enforcement, reviewed post-auth enforcement for bootstrap, capabilities, World, market/watchlist, Inventory, Inventory redemption, notifications, logout, and Contract acceptance, plus forward migration `20260718190000_add_pre_auth_rate_limit_rpc_v1.sql` and service-role-only `consume_pre_auth_request_rate_limits_v1(jsonb)`. Login consumes only IP and action-per-IP HMAC buckets before body parsing; authenticated routes derive IP, identity, game, and action buckets from server-owned scope. Denial/outage returns bounded private `429`/`503` before route work.
- Rate-limit local evidence: the new standard Player security smoke gate passed 32 authorization/limiter/dispatch/migration tests; Backend TypeScript, 64-migration audit, root release suite, and Admin v606 gates passed. Runtime blockers: reviewed proxy overwrite/strip behavior, strong HMAC secret, SQL two-/four-bucket concurrency, shared-NAT tuning, telemetry, cleanup, `429`/`503` live probes, and isolated-staging evidence. Therefore neither rate item is complete.
- No capability was newly advertised. No item in this tranche is `VERIFIED_COMPLETE`; PR #158 remains draft and unmerged.
- Next exact unblocked Backend/Player item: `BETA-INV-013` committed-success preservation on refresh failure on the existing Player integration owner, followed by `BETA-INV-014` connected Store → Inventory → Redemption lifecycle evidence. Next exact Admin architecture item: `BETA-ADMIN-005`.

### 2026-07-18 — Main advanced through Admin explicit request lifecycle

- Re-audited `main` at `1d487afc766146b5e3e19f718252b3eff9a1168e` after PR #168 merged; corrected the stale `14adbc525995cc931998244c442a23b542f43c7a` baseline before continuing implementation.
- Marked `BETA-ADMIN-004` `VERIFIED_COMPLETE`. PR #168 replaced the Admin interaction-quality global fetch interception/broad observer ownership with request-scoped lifecycle events across ten files while preserving scanner, Settings, skeleton, responsive, and accepted v606 behavior. The architecture maximums decreased from 8 to 7 fetch assignments and 13 to 12 mutation observers.
- Required merged-head evidence: PR head `19ccb5a4d130cabb0b71d170e5b146923c70b18e`; merge SHA `1d487afc766146b5e3e19f718252b3eff9a1168e`; Repository Quality #421, Admin Shell Smoke #606, and Branch Hygiene #17 passed. No migration, route, RPC, deployment, or runtime-environment mutation was part of PR #168.
- `BETA-ADMIN-005` is the next exact unblocked Admin architecture item. Backend priority remains `BETA-INV-008` through `BETA-INV-012` on PR #158, with `BETA-AUTH-005` route integration in parallel.

### 2026-07-18 — Player redemption reservation and browser UUID privacy on PR #158

- `BETA-INV-003` through `BETA-INV-007` are `IMPLEMENTED_NOT_MERGED` on branch `agent/player-backend-reconciliation-v2`, PR #158, commit `cd169634d507850d768638fdf7c89a842c92501c`. Seventeen files add the pending/approved/rejected/fulfilled state machine; forward migration `20260718113000_add_inventory_redemption_player_workflow_v1.sql`; append-only request-transition, Inventory-event, and audit evidence; service-role-only RPCs `request_inventory_redemption_atomic_v1` and `read_player_inventory_redemptions_v1`; `POST /players/me/inventory/:itemId/redemptions`; and collection/exact history reads. Ownership is session-derived, browser identities are `item_key` and `red_` public IDs, holding updates are row-locked, reservations cannot exceed available quantity, and exact retries replay without a second reservation.
- The standard Backend Inventory smoke gate now includes all six redemption test files. Local evidence: 36 Inventory/redemption tests passed, Backend TypeScript passed, migration audit passed with 62 unique forward migrations, root repository tests passed, and `git diff --check` passed. Local Edge typecheck was blocked before analysis by this sandbox refusing the pinned `esm.sh` download; GitHub Backend Typecheck and Database Replay are the required authoritative gates. No runtime migration or deployment was performed.
- `BETA-AUTH-006` Backend login/bootstrap DTO remediation is `IMPLEMENTED_NOT_MERGED` at `d0dc57c74fd2b275a600c6c3626a4ed3053f7a10`. It removes internal game, Player, and session UUIDs from login/bootstrap output; retains the one-time login token only in the authenticated handoff; adds private/no-store response controls; and requires a non-UUID public `playerIdentifier`. The standard request-scope smoke gate now runs the new privacy suites. Player Terminal adapter files were removed from PR #158 after Player Terminal Verify #112 correctly enforced isolated ownership; the two legacy frontend adapter files were likewise restored after Admin Shell Smoke #613 proved the Backend-owned branch had broken the existing Contracts workspace fixture. Compatible adapters are delegated to a Player integration owner and must preserve fail-closed UUID privacy without changing accepted visuals.
- Privacy local evidence: 21 request-scope/login/bootstrap/browser-payload tests passed; Backend TypeScript passed; full Player Terminal verification passed; root repository tests passed; and `git diff --check` passed. Connected staging network/log/trace, screenshot, and CI artifact scans remain required, so `BETA-AUTH-006` is not complete.
- No capability flag was enabled for redemption because Admin review/fulfillment and the connected lifecycle remain incomplete. No item is `VERIFIED_COMPLETE`; PR #158 is still draft and unmerged.
- Next exact unblocked Backend item: `BETA-INV-008` Admin pending and historical redemption queue, followed by `BETA-INV-009` through `BETA-INV-012`. `BETA-AUTH-005` route/login limiter integration continues in parallel.

### 2026-07-18 — Executable seed preflight on PR #163

- `SEED-PREFLIGHT-001` is `IMPLEMENTED_NOT_MERGED` on branch `agent/seed-content-foundation-v1`, PR #163, commit `f49192bfd9e2e452313523c3011f9b2c71f792a7`; the branch was synchronized with `main` `14adbc525995cc931998244c442a23b542f43c7a` and reconciled repeatedly with concurrent seed-authority commits without force updates.
- Added `scripts/seed-content-preflight.mjs`, `scripts/seed-content-preflight-lib.mjs`, nine Node tests, root `audit:seed-content` registration, and `docs/seed-content/technical/seed-content-preflight-operator-guide-v1.md`. Corrected stale issuer counts in the Solvend, Thaloris, and Yrethia candidate records from unsupported values to the actual 17 entries.
- Added no migrations, routes, RPCs, database writes, workflows, deployments, credentials, or runtime activation. The preflight accepts both recorded simulation checksum schemas, validates every country run manifest, rejects unsafe declared paths/runtime ownership fields/UUIDs/activation flags, and fails closed for staging/production.
- Latest reconciled local evidence: `npm test` and Player Terminal verify passed; focused preflight tests passed 9/9; design mode checked 47 JSON files with 0 structural errors and 42 blockers; staging mode exited nonzero. The blockers include ten absent 320-record universe JSONLs, incomplete active-country coverage, 50 unverified map points, ten incomplete arrival packages, Northreach evidence gaps, and checksum/file mismatches in newly added Thaloris/Yrethia simulation records.
- No staging/runtime evidence exists. CI for published head `f49192bfd9e2e452313523c3011f9b2c71f792a7` was pending at ledger update.
- Next exact seed item: commit and reconcile the ten referenced 320-record country universe JSONLs with checksums, then rerun the preflight until the 3,200-record count and uniqueness claims are evidence-backed. Runtime importer work remains blocked by stable-ID storage and Backend compatibility.

### 2026-07-18 — Contract acceptance, security, rate-limit, and staging-preflight continuation

- `BETA-CONTRACT-001` through `BETA-CONTRACT-003`: `IMPLEMENTED_NOT_MERGED` on PR #158 through head `7931815f99d529bdf229e09fdabb79955163020b`. Added public route `POST /players/me/contracts/:contractKey/accept`, service-role-only transactional RPC `accept_player_contract_by_key(uuid, uuid, text)`, migration `20260718112000_accept_player_contract_by_key_v2.sql`, Classroom API dispatch, nine focused route/handler/repository tests, Backend smoke registration, contract documentation, and capability-manifest `2026-07-18.2`. No Player Terminal wiring, deployment, or runtime evidence exists.
- `BETA-AUTH-004`/`006`: additive authorization, payload-privacy, and redacted browser/artifact leak-audit suites were published at `5944fd5127289c659909e6b608858345672fdd4d`. Local evidence included 14 new checks, ten existing request-scope checks, and all Player smoke suites. Head `5944fd5127289c659909e6b608858345672fdd4d` passed Repository Quality #364, Admin API #587, Backend Typecheck #973, and Database Replay #115. Legacy login/bootstrap UUID DTOs and connected evidence remain blockers.
- `BETA-AUTH-005` / `OPS-RATE-001`: shared rate-limit foundation published at `330a134a2c6681cfbf7200d67b01c844c66cb5cc`. Added migration `20260718173000_add_shared_request_rate_limits_v1.sql`, table `request_rate_limit_buckets`, service-role-only RPC `consume_request_rate_limits_v1(jsonb)`, HMAC keying, policies, repository/service/HTTP helpers, 12 focused tests, and two evidence documents. It stores no raw IP, token, action composite, player UUID, or game UUID. Route/login wiring, staging configuration, SQL concurrency, tuning, cleanup, and runtime evidence remain open; no capability is advertised.
- Phase 5 staging-preflight support: PR #169 / `agent/staging-readiness-preflight-v1` published commit `7d3c62c377c57bd5e90cf59336fbea58d7bc55db` with seven files, eight focused tests, a names-only secret inventory, deterministic migration/function facts, fail-closed evidence validation, template, operator guide, and protected manual workflow. It adds no migration, route, RPC, credential, deployment, or runtime evidence and remains `IMPLEMENTED_NOT_MERGED`.
- Required CI on PR #158 head `330a134a2c6681cfbf7200d67b01c844c66cb5cc`: Repository Quality #408 and Admin API #602 passed; Backend Typecheck #988 and Database Replay #130 were running at ledger update. PR #169 Repository Quality #409, Database Replay #131, and Staging Readiness Preflight #1 were running.
- Next exact unblocked Backend item: `BETA-INV-003`, followed by the remaining Inventory redemption workflow on PR #158. Next exact operational item: `OPS-ARTIFACT-001`/`002` on PR #169. `SEED-PREFLIGHT-001` is now implemented-not-merged; the next seed item is the ten 320-record universe JSONL sources and checksums.

### 2026-07-18 — Player capability manifest tranche on PR #158

- Addressed `BETA-CAP-001` through `BETA-CAP-005` on branch `agent/player-backend-reconciliation-v2`, PR #158, commit `7d068bf31a67614bf31bc0ae45f564f4a18556a3`; all remain `IMPLEMENTED_NOT_MERGED` until the PR is merged and required evidence exists.
- Added authenticated, private/no-store `GET /players/me/capabilities`, schema version `1`, manifest version `2026-07-18.1`, and one reviewed endpoint allowlist that drives route/action capability flags. Unsupported legacy UUID-bearing routes, market orders, Contract acceptance, redemption, Store writes, and expansion systems remain fail-closed.
- Hardened stock asset and watchlist route parsing so only exact direct and Edge Function prefixes are accepted; spoofed leading path segments are rejected.
- Changed 17 capability-tranche files: the capability contract/handler/route modules and tests, Classroom API dispatch, stock route parsers and tests, Backend scripts, two Backend audit documents, two capability evidence documents, and this roadmap. The branch reconciliation also preserves the 11 current-`main` files from PRs #164 through #167.
- Added no migrations, database functions, RPCs, scheduled jobs, deployment workflows, or runtime configuration. Added one HTTP route and no newly advertised economic write operation.
- Local evidence: `npm test` passed; `npm --prefix player-terminal run verify` passed; `npm --prefix backend run test:player-capabilities` passed 8/8; `npm --prefix backend run test:player-market-assets` passed 45/45; `npm --prefix backend run typecheck` passed; `git diff --check` passed. Full local Backend smoke and `typecheck:all` reached the Admin API/Deno check but could not fetch the pinned `https://esm.sh/@supabase/supabase-js@2.108.2` import because the local sandbox blocks that host; no test assertion failed before the environmental fetch block.
- PR CI evidence on head `5e3969d453c522fcced2b52901ce0df5ce8c45b8`: Repository Quality #363, Admin API Check #586, Backend Typecheck #972, and Database Replay #114 passed; replay evidence includes migration-source validation, zero-state replay twice, and rebuilt database lint.
- Runtime evidence: none. Isolated staging, deployment, and live route probes remain required.
- Remaining blockers for the capability tranche: review, merge to `main`, post-merge verification, and later `BETA-CAP-006` reconciliation after each subsequent Phase 1 tranche.
- Superseded next item: `BETA-CONTRACT-001`, now implemented-not-merged on PR #158; `BETA-INV-003` is the next Backend item.

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
