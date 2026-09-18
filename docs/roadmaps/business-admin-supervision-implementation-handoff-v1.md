# Admin Business Supervision Implementation Handoff v1

**Roadmap item:** `BUSINESS-V2-13` (13A–13F)
**Status:** `IMPLEMENTED_NOT_MERGED` — all 33 exact-source workflows passed
**Branch:** `feat/admin-business-supervision-v2`
**Draft PR:** [#682](https://github.com/kohnerbouchard-star/Student-Profile/pull/682)
**Certified implementation and verification source:** `949da9f91990eeeee2cd815541446a5b64130664`
**Parent Phase 12 implementation:** `76539c5cfcff612a322963e303e727e6edc7f7ed`
**Stacked Phase 12 documentation base:** `d6ddb52f38da1ad931ba56600b49786f11f11ac6`
**Merge or deployment authorized:** No

## Result and boundaries

13A supplies the game-scoped directory and independently loaded public-key Business drawer. 13B–D supply 22 bounded canonical evidence sections. 13E closes with an explicit **no-intervention** decision: there are no new economic commands or override forms. 13F owns the source, database, browser, retained regression and handoff evidence below.

| Area | Evidence sections |
| --- | --- |
| Inventory and production | Locations; stockroom; equipment; manufacturing; production readiness |
| Workforce | Employee history; workforce utilization; payroll |
| Store and finance | Offers/withdrawals; committed sales; Checking; FX orders; FX receipts |
| Operating periods | Period close receipts; period claims; tax assessments |
| Ownership and supervision | Ownership positions; corporate share structure; governance; compliance; activity; audit |

The directory returns at most 2,000 ordered Businesses and reports truncation. Detail sections return at most 100 source-ordered rows with explicit truncation. Canonical treasury's latest-50 FX windows are labelled. Empty, unavailable and partial evidence never implies a zero balance or financial-health certification. Historical unpaid payroll/tax flags are evidence, not a computed current-liability total. Ownership/voting basis points use the full active-position denominator before limiting rows.

All monetary/quantity evidence remains decimal text across the database/JavaScript boundary, including identity capitalization. Currencies are not combined. Internal UUIDs, private Player/account identities, credential material and arbitrary metadata are excluded by explicit DTO allowlists and defensive browser normalization.

## Authority and compatibility

The existing authenticated, capability-checked Admin GET routes remain the entrypoints:

- `GET /games/:gameId/businesses`
- `GET /games/:gameId/businesses/:businessKey`

The service-only `read_admin_business_supervision_v2(uuid,uuid,text)` snapshot requires the same-game owner, active `game_admin` staff and a `business.manage` grant. It accepts only the trusted server game/staff context and validated public Business key. Admin does not supply or impersonate a Player. Existing authentication, MFA, capability normalization, rate limits, no-store handling and sanitized errors remain intact.

Seven existing Player reads delegate to private Business-scoped helpers. Their calculation bodies are mechanically verified against their previous canonical definitions. Player signatures, return contracts, security-definer boundaries and ownership resolution are retained; private helpers are security-invoker and cannot be executed directly by service_role, authenticated or anonymous clients. The new snapshot is STABLE and acceptance executes it inside PostgreSQL-enforced READ ONLY transactions.

Closed Businesses retain their historical sections. The existing active-only readiness calculation is not changed or invoked for closed Businesses; readiness is explicitly unavailable instead of blocking the entire historical snapshot. Equipment durability and repair remain explicitly unsupported.

## Implementation surface

- `admin/v2/src/routes/business/{BusinessApi,BusinessController,BusinessRoute,BusinessSupervisionModel,BusinessSupervisionView}.js`
- `admin/v2/styles/routes/business.css`
- `backend/supabase/functions/admin-api/businessBankingOperations.ts`
- `backend/supabase/functions/admin-api/businessSupervisionProjection.ts`
- Focused API/projection tests and separated reusable Banking test support.
- CLI-generated forward read-function migrations:
  - `20260917214421_admin_business_supervision_v2.sql`
  - `20260917214558_admin_business_supervision_snapshot_v2.sql`
- `scripts/admin-business-supervision-contract.mjs`
- `scripts/admin-business-supervision-database.mjs`
- `scripts/admin-v2-business-browser-smoke.mjs`
- `.github/workflows/admin-business-supervision.yml`
- Exact-path PR #682 manifests under Admin supervision and retained Player verification.
- The retained Admin Browser E2E branch filter includes the existing stacked Phase 12 base.

No pre-Phase-13 applied migration, persistence table, scheduler, secret, runtime dependency or economic mutation authority was changed. Legacy Admin/Loans handlers retain their existing bounded contracts. Architecture inventory remains 1,217 source files with all debt ceilings unchanged, including the 100 oversized-file ceiling.

## Verification evidence

All 33 workflows and 68 applicable jobs below completed successfully on 2026-09-17 for exact implementation `949da9f91990eeeee2cd815541446a5b64130664`; two non-applicable jobs were expected skips. Superseded candidates and successful retries from older SHAs are not substitutes for this source.

The permanent Phase 13 run is [35282299961](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299961):

| Gate | Job |
| --- | --- |
| Source, authority, canonical body parity, privacy and precision | 105406775616 |
| Two fresh zero-to-head replays and database acceptance | 105406775583 |
| Desktop/mobile browser acceptance | 105406775177 |

Database acceptance covers all 22 sections, PostgreSQL read-only enforcement, two-game scope, multiple owners, exact percentages, >100-row truncation, private-metadata exclusion, permission/role/staff/game-owner denials, anonymous/authenticated denial, private-helper denial, closed history and retained Player ownership wrappers.

Browser acceptance runs eight scenarios at both 1440×1000 and 390×844: ready, empty directory, empty sections, failed read/retry, detail retry, stale refresh, loading dismissal/late response, and denied permission. It checks all 22 section selections, horizontal overflow, Korean/long labels, UUID/metadata suppression, exact large decimals, reduced motion, keyboard containment, Escape closure, opener restoration and absence of mutation requests/browser errors. Retry replaces focused content without dropping focus onto document.body.

Browser artifact `10523190425`, SHA-256 `a6c78ff8e624fb47285dd2cc756ec75d0945f03147dd5480559b1f34495f2bd0`, contains the 16 passing scenario results and desktop/mobile screenshots. Screenshots were visually inspected. Artifact retention ends 2026-10-01; permanent scripts and run identities allow reproduction after artifact expiry.

Local verification at this source: full root `npm test` with Node 22.23.1/npm 10.9.8; 86 Admin V2 tests; 12 focused Deno tests; 7 retained authority tests; backend TypeScript; 420 unique migration versions; canonical-body/privacy/precision contracts; generated inventory and unchanged architecture ratchets.

### Exact-source workflow ledger

| Workflow | Run |
| --- | --- |
| Admin API Check | [35282299887](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299887) |
| Admin Browser E2E | [35282299979](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299979) |
| Admin Bundle Contract Audit | [35282299822](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299822) |
| Admin Business Supervision | [35282299961](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299961) |
| Admin Shell Smoke | [35282299983](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299983) |
| Admin V2 Loans | [35282299982](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299982) |
| Backend Typecheck | [35282299911](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299911) |
| banking-fx-clearing-v1 | [35282299841](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299841) |
| Business Banking Runtime | [35282299837](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299837) |
| Business Economy V2 | [35282299956](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299956) |
| Business Player Store Cutover V2 | [35282299876](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299876) |
| Business Store Atomic Settlement V2 | [35282299966](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299966) |
| Business Store Listing Inventory V2 | [35282299879](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299879) |
| Business Store Seller Offers V2 | [35282299846](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299846) |
| Business Store Withdrawal Safety V2 | [35282299867](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299867) |
| Business Timed Manufacturing V2 | [35282299883](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299883) |
| Business Workforce Payroll V2 | [35282299889](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299889) |
| business-multicurrency-treasury-v1 | [35282299872](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299872) |
| business-player-store-fx-final-v2 | [35282299893](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299893) |
| business-store-sales-convergence-v2 | [35282300035](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282300035) |
| Database Replay | [35282299830](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299830) |
| Environment Neutral Browser | [35282299962](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299962) |
| Exchange Calendar Runtime | [35282299856](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299856) |
| multicurrency-marketplace-funding-v1 | [35282299891](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299891) |
| multicurrency-stock-funding-v1 | [35282299951](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299951) |
| multicurrency-store-funding-v1 | [35282299874](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299874) |
| Player Terminal Verify | [35282299834](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299834) |
| Progression Runtime | [35282299985](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299985) |
| Repository Quality | [35282299978](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299978) |
| Required Game Market Timezone | [35282300004](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282300004) |
| Runtime Interaction Wiring | [35282299938](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299938) |
| Staging Readiness Preflight | [35282299831](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299831) |
| Supply Chain Security | [35282299932](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35282299932) |

The retained matrix includes actual Store settlement/withdrawal, Banking/FX, payroll/labor, equipment/manufacturing, Player/Admin browser and Phase 11 sales/tax/period-close regression. Database replay/lint and the Phase 11 rebuilt-schema advisor lane remain enabled; inherited lint findings are not misrepresented as zero findings.

Two non-applicable jobs are expected skips: Staging Readiness Preflight job `105406775961` runs only on manual staging dispatch, and Workforce Payroll job `105406776517` writes the old Phase 4A inventory only for PR #657. Neither is a Phase 13 verification gate or authorized live action. No required Phase 13 gate is skipped.

## Repairs encountered during verification

- Repaired the inherited PR #682 retained-verification manifest and generated inventory; 13A repair `435f04775f9a5fd229ada71afc9054f3cc90a10f` passed all 30 workflows then triggered.
- Fixed the suspended-staff test fixture to honor its required timestamp.
- Fixed closed-history snapshots without changing canonical active-only Player readiness.
- Kept drawer focus when a Retry control is removed during async content replacement.
- Scoped the stale-refresh test to the Business refresh action, not the shell's separate freshness control.
- Preserved capitalization decimal text and rejected every UUID version in identity text.
- Earlier retained legacy attendance-modal Tab-wrap runs timed out on unchanged source, then passed unchanged on retry/new head. No legacy code, timeout, assertion or security boundary was weakened.

## Source identity, rollout and next item

This certified implementation SHA is immutable. Documentation/controller commits only record evidence and must not replace it as the tested implementation identity.

A future separately authorized deployment must apply the two migrations before the changed Admin API. Existing Player wrapper signatures remain compatible. Any correction after deployment must be a new forward migration; do not edit applied history or execute ad hoc live SQL.

At the original certification checkpoint PR #682 was draft, unmerged and undeployed. On 2026-09-18 the owner explicitly authorized merging and starting Phase 14. This supersedes the earlier merge/Phase 14 hold. Deployment, live SQL/data changes and scheduler/secret changes remain outside that direction. `BETA-LIVE-MIGRATION-PARITY-001` remains a separate release/runtime blocker, so this checkpoint cannot be `VERIFIED_COMPLETE`.

Next dependency: `BUSINESS-V2-14A` financial reporting after the Phase 13 merge checks pass. Owner direction to start it is now recorded; this handoff itself does not implement Phase 14.

## Main-target merge verification follow-up

Phase 12 merged as `b09905c066016ae1523d2f0a991e86f2f60c70db`; PR #682 now targets `main`. Release workflows require explicit manual deployment authorization, including the Admin production cutover path. Merging alone must not deploy.

The expanded main-target checks exposed stale verification inputs. The button ledger now counts 38 active Admin mutations after Phase 13E removed `business.setBusinessCompliance`; the permanent Business API/route tests still enforce that action's absence. News & Events permission smoke now supplies the complete active-game bootstrap, verifies that the server bootstrap was intercepted, and matches the current `News & Event Monitor` route heading. Its permission-denial, zero protected reads, UUID privacy and browser assertions remain intact. These repairs do not change application or database behavior.

Candidate `552b2e045068279bb9d2c88b9854c13a3f059b24` passed 50 workflows with one expected staging-only skip. The remaining multiplayer/load workflow failed before fixture creation because its disposable Edge gateway returned 500/502/503 during the short startup probes. The workflow now waits for the gateway to publish its browser-safe local configuration, then invokes the existing bounded, localhost-only `restartLocalEdgeRuntime` helper before the strict Edge probes, as the other connected suites already do. A permanent source regression binds this startup ordering; no timeout, journey, load profile, assertion or enforcement step is removed. The explicit static-ready handoff fixes the missing-config race observed on the first recovery candidate.
