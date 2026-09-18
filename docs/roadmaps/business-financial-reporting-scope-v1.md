# Business V2 Phase 14A — Financial reporting

Status: `IMPLEMENTED_NOT_MERGED`. Exact certified implementation: `aed8c3f6462d927cec3ebc55602854d48a460a9b`. Owner: `feat/business-financial-reporting-v2`, draft PR #684, based on Phase 13 merged main `4a9674ed9ca0565c828093fe100aa658ef4faaa6`. The owner authorized all Phase 14 implementation/verification stages on 2026-09-18; deployment, live SQL, scheduler and secret changes remain outside that authorization.

## Implemented reporting contract

Phase 14A now includes immutable closed-period income statements, balance sheets and cash-flow statements, authenticated Player Finance presentation and read-only Admin supervision. The original 14A1 partial-evidence RPC remains a compatibility read; its unavailable-statement flags describe that endpoint, not the separate complete-statement projection.

Statements are captured by the canonical operating-close transaction. They use the guarded server-owned period's exclusive due timestamp. Revenue and COGS come from committed Store receipts. Wages and tax accrue to the operating period; late payroll and tax cash settlements enter their actual payment interval and never rewrite an earlier statement. Canonical manufacturing completion capitalizes allocated labor, preventing a second expense when that labor enters sold-inventory COGS.

Append-only observations retain inventory/equipment carrying values and loan principal/interest. Opening and closing cash derive from the canonical ledger. Owner inventory contributions are capital, not income. Loan principal, interest and origination fees remain separate. Settled procurement funding quotes supply historical FX reference rates; their source spread is expense and currency reallocation is shown explicitly. Currencies are presented separately without current-rate consolidation.

Each statement reconciles the change in equity to capital, currency movements and income, and the change in cash to classified flows. Both residuals must be exactly zero, costs must be known, obligations nonnegative and cash entries classified before status can be `complete`. Missing history is `incomplete_history`; unsupported or inconsistent evidence is `unreconciled`. There is no balancing plug or manufactured historical balance. Existing Businesses receive an observation baseline without a false inception claim.

## Authenticated reads and views

`read_owned_business_financial_statements_v1(uuid,uuid)` uses the canonical current-owner/game resolver. Private helpers are inaccessible to browser and service roles directly. Reads are STABLE, accept PostgreSQL READ ONLY transactions and never initialize clocks or mutate economic state. They return at most 50 immutable statements, with a 51st-row truncation sentinel and an explicit historical-coverage flag.

Money and period numbers remain decimal text from PostgreSQL through strict Backend allowlists into Player/Admin views. Raw rows, internal UUIDs, request hashes, leases, idempotency keys and arbitrary metadata are excluded. Existing authentication, server-derived scope, capabilities, rate limits and private/no-store responses remain the transport boundary.

The existing Player Business workspace read composes `financialReporting`; Finance displays separate income, balance and cash-flow tables per currency. Disclosure controls are keyboard operable and wide amounts scroll within labelled regions. Empty history, unavailable data, incomplete/reconciliation status and a failed refresh are distinct. A stale refresh retains the immutable cached statements with a notice.

The existing Admin Business snapshot adds three bounded statement sections, making 25 sections in total. It retains game-owner/MFA/capability checks and introduces no financial mutation or compliance intervention.

## Implementation surface

CLI-generated forward migrations:

- `20260918014630_business_financial_reporting_v1.sql`: original 14A1 closed-period operating evidence.
- `20260918032342_business_accounting_evidence_v1.sql`: private reporting coverage, immutable position observations and statement storage.
- `20260918032648_business_financial_statements_v1.sql`: accrual reconciliation, canonical close observer and bounded statement reads.
- `20260918034225_business_reporting_adapters_v1.sql`: existing Player/Admin read composition.
- `20260918035524_business_reporting_purge_convergence_v1.sql`: guarded purge-registry/order convergence, preserved request-bound purge writers and observer suppression only during authorized canonical deletion.

Backend implementation is in `businessFinancialReportingProjection.ts` and the existing Business stockroom read repository; Admin projection/model, Player `business-financial-reporting.js` and workspace composition consume safe evidence. Permanent source, database and browser gates live in `.github/workflows/business-financial-reporting.yml` and `scripts/business-financial-reporting-*.mjs`. The existing connected Business journey asserts that reporting arrives through the authenticated workspace read.

The purge change adds the three new reporting tables to the canonical registry and child-first order. Registry/FK/order fingerprints become 205/452/204 entries; final cursor is 205. It rejects an already advanced nonterminal purge cursor. Source parity verifies the frozen writer bodies differ only in these fingerprints/counts. Existing request, entitlement, environment, table-token and final zero-row checks remain unchanged. Inventory/loan observers suppress new reporting evidence only when the exact request-bound deletion token authorizes their source table.

## Verification and rollout

Exact implementation `aed8c3f6462d927cec3ebc55602854d48a460a9b` passed all 50 applicable workflows, 90 checks and Vercel status. One staging-only workflow and eight manual release/staging or historical branch-specific jobs skipped as expected. The full run/job matrix and skip reasons are recorded in `business-v2-current-checkpoint-v1.json` under `phase14a_certification`. Documentation handoffs preserve this source identity and have their own CI.

Permanent acceptance covers real Store quote/settlement/replay and canonical period close/replay; opening capital and contributed inventory; revenue, COGS, accrued tax, delayed cash and both exact reconciliations; empty/open/zero-sale periods; 51-period truncation; immutable evidence; same-game ownership and cross-game denial; browser-role/private-helper denial; read-only transactions; large exact decimals and negative amounts. Desktop/mobile browser acceptance checks disclosure, precision, keyboard focus, labelled overflow regions, accessible controls and page errors. The retained connected Business journey checks authenticated reporting composition; its new-Business scenario has no closed periods. Rich closed-statement browser data is a fixture, while real accounting reconciliation is proved by the database gate.

Retained Admin supervision, canonical purge/two-game isolation, Store, Banking/FX, stock funding, manufacturing/payroll, Player journeys and 30/40-player load, full database replay/lint/advisors, typechecks, repository and security gates remain required where triggered. No assertion or architecture ceiling is weakened.

Apply through a separately authorized release in migration order before deploying consuming API code. This phase adds three game-scoped reporting tables and observers, not a second money/inventory writer. Corrections after live application require a new forward migration. `BETA-LIVE-MIGRATION-PARITY-001` remains a separate release/runtime blocker.

## Full Phase 14A verification — 2026-09-18

Reporting run `35314969708` passed source `105504658884`, database `105504658675` and browser `105504658743`. The database acceptance passed after each of two fresh replays; advisors passed. All six desktop/mobile workspace/reporting cases passed. Browser artifact `10535280068` has digest `sha256:28dda04cc6ce22d990960097c036e79731ad8c597d987791f768e9bfda844c60` and expires 2026-10-02; permanent tests reproduce the evidence.

Connected run `35314969894`, job `105504621156`, passed Business/World, 30/40-player load and final enforcement. Store/purge convergence run `35314969533`, FX-final run `35314969767`, retained Admin, Banking, stock funding, replay/lint, Edge and repository checks passed at the same source. Local full root tests, focused Node/Deno tests, Backend TypeScript, migration uniqueness, authority, architecture, secret and diff checks passed. Local aggregate Edge checks could not download an uncached dependency; the exact-head CI typecheck passed.

The first resumed candidate exposed stale Admin section/format expectations and an incomplete purge integration. The repair updates the 25-section contract and canonical registry/order/frozen writer evidence without changing purge authorization. The new browser job initially installed a different package's Chromium, then exposed absent fixture runtime configuration. Both setup issues were corrected while retaining every reporting/page-error assertion. The previous connected FX console failure passed on the certified candidate with no weakened assertion.

Phase 14A remains a draft; no merge, staging/production deployment or live SQL occurred. The full phase remains open for 14B–14D.

## Verified starting checkpoint — 2026-09-18

At source `c3647db988f2be8edd52b1656e640b388b2fc00f`, all 25 applicable workflows, 50 applicable checks and Vercel status passed. One staging-only workflow and six manual release/staging/preview checks skipped as expected; no reporting or retained journey/browser/load gate was skipped. Exact workflow identities are retained in `business-v2-current-checkpoint-v1.json`.

- Reporting run `35297504381`: source job `105452976974` and database job `105452976705` passed. The full reporting acceptance ran successfully twice after independent zero-to-head replays. The advisors gate passed; this is not a claim that the repository has no inherited advisor findings.
- Retained connected run `35297504137`, job `105453070102`, executed and passed Business/World journeys, both 30/40-player load profiles and final enforcement. Retained Store, Banking/FX, Admin supervision/browser, database replay/lint, typecheck and repository quality also passed.
- The first database attempt correctly rejected a test fixture that rewound a completed sales period. The repaired fixture seeds overdue history once and allows canonical closes to advance 51 contiguous periods. No receipt-assignment guard, economic writer or historical migration was changed.
- Phase 12/13 are merged. Their merged main passed all 26 applicable post-merge workflows; three expected skips kept release writers idle. Phase 14A1 remains a draft, with no staging/production deployment or live SQL. Documentation followups retain the exact tested source above rather than becoming replacement implementation identities.

## Remaining Phase 14 sequence

After Phase 14A's exact green implementation and documentation handoff:

1. `BUSINESS-V2-14B`: common-equity invariants for C corporations.
2. `BUSINESS-V2-14C`: fixed-price primary IPO eligibility, terms and issuance.
3. `BUSINESS-V2-14D`: versioned Business events consumed by Financial Markets. Business does not write Market internals; the existing Financial Market/Portfolio remains the secondary trading surface.

Each successor retains one bounded draft PR and starts from its exact green predecessor. Full Phase 14 remains `IN_PROGRESS` until all four stages have their own implementation and verification evidence.
