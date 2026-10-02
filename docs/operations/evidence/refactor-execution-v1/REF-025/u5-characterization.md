# REF025a / U5 loan characterization

Status: IMPLEMENTED_NOT_MERGED; REF025 remains BLOCKED. No runtime completion credit.
Accepted by parent on 2026-10-02: characterization only, four exact paths,
hard 399 semantic-line ceiling. Scope recorded before test edits.
Base: `b7f0e1374163f665124cc2ff02e9f4313ccb6679` (fresh main).
Branch: `refactor/ref-025a-characterization`; parent reviews and merges.

## Exact scope

- `backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.test.ts`
- `backend/supabase/functions/admin-api/businessBankingOperations.test.ts`
- `scripts/business-banking-runtime-contract.mjs`
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-characterization.md`

Allowed: characterize existing denial order, query/currency representation,
borrower/account binding and servicing/replay behavior with synthetic fixtures
and explicit SQL source assertions. Known defects are recorded, not repaired.
No production source, migration, manifest, workflow, policy or other evidence edit.
Treasury's accepted public contract/single-RPC extraction stays intact.
Protect #668 context/global ledger/backend manifest, #736 Player runtime auth,
REF042 Player API/app/Inventory/realtime, REF040 Markets, #624 UI, and all nine
U1 hosted guards. No live access, captures, dispatches, deployment or restoration.
REF027 still depends on REF025 and REF026; no status/dependency edits here.

## Validation plan and evidence levels

Use pinned Node 22.23.1 / Deno 2.9.3 and frozen locks; strip inherited secrets.
Run both owning Deno test files, the runtime source contract, existing Banking
read/FX/Business workspace and economic simulations, then safe shared checks.
Record exact-head CI separately. HTTP/repository mocks test real application
code but do not execute SQL. SQL assertions characterize source, not transaction,
concurrency, replay or rollback outcomes in a database. No DB proof claimed.
Rollback is a normal revert of these four test/evidence files only.

## CI preflight

Business Banking Runtime matches both test paths and the runtime script, runs
both Deno files, economic simulations and source contracts. Backend Typecheck
matches backend/** and runs typecheck:all plus full smoke, including Banking/FX
and economic-ledger invariants. Database Replay does not match these four paths.
The Admin test path also matches Banking FX Clearing's backend/supabase/**
filter: exact-head certification, disposable local DB reset/acceptance/lint.
Business Economy V2 matches the domain test/runtime script. None is a live probe.
The standalone Database Replay trigger gap would require adding the two test
paths and runtime script to its PR filter, if required by the parent; this is
reported before any workflow edit. No dispatcher or hosted guard is changed.
Database/race qualification remains NOT_RUN locally, not inferred from mocks.
No workflow amendment is included or authorized in this four-file child.

## Results

Pinned tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Source tests use
synthetic fixtures and an empty inherited environment. Dependency acquisition
uses only proxy/CA configuration with repository locks unchanged.

- Baseline owning Deno files: 12/12 passed before edits. Candidate: 19/19 passed
  (five new Player handler/repository cases, two new Admin cases).
- PASS: `node scripts/business-banking-runtime-contract.mjs`, including explicit
  SQL source assertions for application, review, payment, servicing and recovery.
- PASS: backend `test:player-banking-public` 38/38,
  `test:player-banking-fx` 16/16, `test:economic-ledger-invariants` 25/25.
- PASS: `node --experimental-strip-types --test
  scripts/business-banking-economic-simulation.test.mjs` 8/8; Player
  `banking-read`, `banking-fx`, `business-workspace`; high-priority guards 80;
  both legacy-runtime audits; secret scan; `git diff --check`.
- PASS: existing Phase15 production-workflow contract 4/4 (all nine guards kept).
- BLOCKED: full `typecheck:all` and smoke encounter the frozen esm.sh
  Supabase 2.108.2 import download failure. Backend TypeScript check passed;
  full Edge roots and later smoke suites are not certified by partial passes.
- FAIL: `npm test` stops at architecture inventory determinism. New tests add
  one lexical compatibility-marker entry and one over-500-line test entry.
  Generated inventory was inspected and restored because it is outside scope;
  preserving assertions requires separately approved generated-file reconciliation.
  No threshold, test, or workflow is weakened to obtain green results.
- NOT_RUN: local database, transaction races, injected SQL rollback, connected
  browser/staging or production qualification. Exact-head CI tracked in draft PR.

## Characterized behavior and limits

HTTP envelope/body/method denial precedes configuration; configuration precedes
scope and repository construction. The injected denial tests do not authenticate
real sessions. Application rounds to two decimals, forwards server scope and
account intent once, and returns the existing private/no-store pending envelope.
Admin recovery aliases use the supplied server scope and one RPC; invalid review
decision wins over invalid replay key. Outer Admin authentication remains separate.

The real Loans repository, exercised with a recording synthetic client, uses
one economic-context RPC plus five queries for zero/one/two returned businesses.
Only products filter currency; borrower loans filter game/player, business keys
filter game/owner. Credit defaults, payment count, ordering, limits and schedules
remain characterized. Two synthetic currencies total 30.8 without currency fields:
this preserves a known representation limitation, not evidence of live mixed loans.

SQL source checks preserve legacy borrower/account guard predicates, same-currency
balance locks, interest-first payment and installment advancement. They also freeze
known limitations: payable-state denial before repayment receipt lookup; approval
replay by terminal application state; recovery replay by audit key without payload
hash. No runtime reproduction, policy correction or stronger replay claim is made.
Production debt/query counts: unchanged; zero production files or ports moved.
Remaining callers: Player/retained Classroom loan dispatch, Player Loans UI,
Admin loan review/recovery/supervision, autonomous loan servicing. No retirement.

## First-slice recommendation for owner review (not approval)

Preserve every legacy obligation, bound account, term, schedule and repayment right.
New obligations identify business liability independently of the initiating player;
canonical Business control authorizes actions on that business, never ownership
inferred from purpose text. Use its stable game/business/currency account identity
for disbursement and repayment, with actor identity recorded separately. A mandate
change changes permission, not debt. No guarantees, collateral, implicit FX or
personal recovery liability is inferred.
Available affordability data include ledger game/business/currency identity,
positive amounts, source/action and timestamps; existing business financial
statements also distinguish operating/financing flows. Legacy affordability uses
84-day inflows, existing exclusions and product limits, but mixes Checking and
business accounts; only player credit profiles currently supply a score.
Recommend business-only qualifying inflows with existing window/exclusions/limits;
no new risk thresholds. For the smallest first slice, explicitly review using the
originating operator's existing score only as an application eligibility gate,
not a guarantee or transferable business score. New-business default would affect
the business obligation, not silently damage a later operator's personal credit.
Preserve existing accrual, delinquency/default thresholds and staff restructuring
where applicable. Owner must approve these three concrete choices: business-only
income basis, applicant-score eligibility, and business-only default attribution.
If applicant-score eligibility is rejected, a separate business credit policy is
needed before origination; do not manufacture a score or bypass product thresholds.
Other U5 children remain unapproved. Parent controls policy, review and merge;
REF025 remains BLOCKED and REF027 still requires REF025 plus REF026.
