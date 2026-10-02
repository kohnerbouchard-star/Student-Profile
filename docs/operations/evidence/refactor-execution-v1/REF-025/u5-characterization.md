# REF025a / U5 loan characterization

Status: IMPLEMENTED_NOT_MERGED; REF025 remains BLOCKED. No runtime completion credit.
Accepted by parent on 2026-10-02: characterization in four exact paths,
hard 399 semantic-line ceiling (397 total added/deleted physical lines). Scope recorded before test edits.
Parent subsequently approved only the fifth generated inventory path below.
Base: `b7f0e1374163f665124cc2ff02e9f4313ccb6679` (fresh main).
Branch: `refactor/ref-025a-characterization`; parent reviews and merges.

## Exact scope

- `backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.test.ts`
- `backend/supabase/functions/admin-api/businessBankingOperations.test.ts`
- `scripts/business-banking-runtime-contract.mjs`
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-characterization.md`
- `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`

Inventory delta: two test-only entries; compatibility count 209 -> 210 and
oversized count 99 -> 100. No ceiling or unrelated inventory change.
The unchanged 209 compatibility ceiling fails; this is not waived.

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
Rollback is a normal revert of these five test/evidence files only.

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
No workflow amendment is included or authorized in this child.

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
- FAIL: `npm test` initially stopped at inventory determinism; approved regeneration
  fixes that mismatch but the unchanged architecture ratchet now rejects 210
  compatibility-marker files against maximum 209. Both additions are test-only.
  No threshold, assertion, test title or workflow is weakened to obtain green.
  This remains a merge blocker, not backend or economic qualification credit.
- NOT_RUN: local database, transaction races, injected SQL rollback, connected
  browser/staging or production qualification. Exact-head CI still required.

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
Proposed business income: sum positive ledger amounts scoped by game, stable
business identity and loan currency in the preceding 84 days, across operators;
exclude source_domain banking/loans and source_action capitalization_in /
ownership_cash_transfer_in / capital_contribution_in / ipo_primary_subscription. Exclude personal
Checking/Savings; no converted currencies. Current legacy business applications
instead filter player_id and admit both Checking and the business account.
Income per installment = round((sum / 12) * max(payment_frequency_cycles, 1), 2).
Ratio = 100 if income <= 0, otherwise min(100, round(payment / income, 6)); reject
above the product's maximum_payment_to_income. Existing Working Capital seed is
0.45, but the authoritative product row may be staff-modified; no hardcoded new cap.
The exact inputs/formula are in 20260806093000_provision_player_banking_and_credit_v1.sql.
The last two exclusions are proposed additions, based on existing accounting
capital classifications; owner approval is required, not implied by this evidence.

Applicant-score proposal: retain recalculate_player_credit_v1(game, actor) at
application and compare to that offer's minimum_credit_score. Working Capital's
seed threshold is 600 (generic table default 550); the product row is authoritative.
This is operator eligibility, not a business credit score or personal guarantee.
Current default attribution: service_player_loan_status_v1 marks loans by product
thresholds and recalculates credit for each loan.player_id. The credit function
counts every defaulted loan for that game/player, including business-linked loans,
subtracting 120 per default before clamping the score to 300..850. It also subtracts
35 per counted delinquent posted-payment join row; this is not a per-business model.
Both functions originate in 20260721120000_add_business_banking_credit_runtime_v1.sql.
Recommend no personal credit damage for new business defaults; this differs from
legacy behavior and requires approval. Existing accrual (principal * annual_rate *
days / 365 rounded to 2 decimals), product grace/default days and staff recovery
remain candidates for preservation, not permission to change liability attribution.
Owner choices: approve business-only income with named exclusions; applicant-score
eligibility using product thresholds; business-only default attribution. No invented
risk thresholds, guarantees or FX. If applicant-score eligibility is rejected,
origination needs an approved business-credit policy before implementation.
Other U5 children remain unapproved. Parent controls policy, review and merge;
REF025 remains BLOCKED and REF027 still requires REF025 plus REF026.
