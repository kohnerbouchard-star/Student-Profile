# Business V2 Phase 14A — Financial reporting

Status: `IN_PROGRESS`. Item `BUSINESS-V2-14A`; first bounded tranche `BUSINESS-V2-14A1`.
14A1 implementation status: `IMPLEMENTED_NOT_MERGED`; exact verified source `c3647db988f2be8edd52b1656e640b388b2fc00f`.
Draft PR: #684. Forward migration: `20260918014630_business_financial_reporting_v1.sql`.
Permanent verification: `.github/workflows/business-financial-reporting.yml`, source contract and disposable database acceptance in `scripts/business-financial-reporting-*.mjs`.
Owner: `feat/business-financial-reporting-v2`, based on the merged and verified Phase 13 predecessor. The owner authorized merging Phases 12/13 and starting Phase 14 on 2026-09-18. Publication is a draft PR; no deployment or live database application is authorized.

## First tranche: closed-period evidence

Add a read-only, service-only `read_owned_business_financial_reports_v1(uuid,uuid)` RPC. The trusted service supplies the authenticated game and Player; the canonical current-owner resolver rejects missing, wrong-game, exited and ambiguous ownership. Browser roles cannot invoke it. A private shared read accepts resolved Business identity; a private projection explicitly selects safe fields from existing immutable period-close receipts.

The response contains at most the latest 50 completed periods, descending by exact period number, plus a truncation flag determined by a 51st row. Empty history stays empty. Reads do not create payroll clocks, close periods, update balances, write inventory, or manufacture historical snapshots. Existing close receipts already bind committed Store sales, payroll and tax to guarded server-owned operating periods.

Each period exposes its public receipt key, period number, dates, reporting currency, Store receipt count, sales/COGS/gross profit by currency, payroll due/paid/unpaid and tax by currency. Money and period numbers become decimal text inside PostgreSQL before JSON serialization. Internal IDs, metadata, request hashes, idempotency keys, leases and raw rows never enter the response. Currencies are not combined or converted using current FX rates.

## Accounting boundary

This is **partial operating evidence**, not an income statement, balance sheet or cash-flow statement. All three are explicitly unavailable. `netIncome`, valuation, IPO eligibility and inferred historical asset balances are absent.

Manufacturing completion (`20260823110300_business_manufacturing_completion_v2.sql`) capitalizes allocated labor into finished inventory cost, which later enters Store COGS. Subtracting the entire payroll again from gross profit would double-count that allocated labor. Full statements require period-aligned labor capitalization reconciliation, inventory/equipment and liability opening/closing evidence, and canonical bank-flow classification. Current cash, inventory or cached Business aggregate columns cannot reconstruct those historical values reliably.

Payroll in this response is the immutable obligation/payment evidence recorded at close. Tax is also as of close; later recovery payments must not rewrite the historical report. A later reporting tranche must distinguish as-of-close statements from current outstanding liabilities.

The existing Player resolver allows current owners of nonclosed Businesses. Closed/transferred ownership reporting policy and historical-owner access are not expanded by this RPC. No HTTP route or UI consumes it in 14A1; later adapters must preserve server-derived identities, capability/rate limits, no-store transport and safe DTOs.

## Verification and rollout

- Permanent source contract enforces a forward migration, no DML/clock initializer, canonical ownership and game scope, exact decimal projection, bounded output and least-privilege grants.
- Disposable database acceptance runs after two independent zero-to-head replays: real Store purchase and idempotent replay, actual guarded period close and replay, empty/open/zero-sale periods, immutable historical evidence, two-game isolation, exited/wrong/ambiguous ownership, role/helper denial, read-only transactions, large decimals, negative gross profit, multiple currencies and a 51-period window.
- Database Replay retains repository lint; the reporting workflow also runs security/performance advisors. Inherited findings must remain visible and are not reporting certification.
- Existing Phase 11–13, Player, Admin, Store, Banking/FX and repository workflows remain required where triggered. No retained assertion or architecture ceiling is relaxed.

Apply the additive forward migration only through a separately authorized release. It adds functions only, with no new table, table privilege, economic writer, scheduler, dependency or purge-registry change. An eventual consuming API must deploy after the migration; corrections after live application require another forward migration.

## Verified starting checkpoint — 2026-09-18

At source `c3647db988f2be8edd52b1656e640b388b2fc00f`, all 25 applicable workflows, 50 applicable checks and Vercel status passed. One staging-only workflow and six manual release/staging/preview checks skipped as expected; no reporting or retained journey/browser/load gate was skipped. Exact workflow identities are retained in `business-v2-current-checkpoint-v1.json`.

- Reporting run `35297504381`: source job `105452976974` and database job `105452976705` passed. The full reporting acceptance ran successfully twice after independent zero-to-head replays. The advisors gate passed; this is not a claim that the repository has no inherited advisor findings.
- Retained connected run `35297504137`, job `105453070102`, executed and passed Business/World journeys, both 30/40-player load profiles and final enforcement. Retained Store, Banking/FX, Admin supervision/browser, database replay/lint, typecheck and repository quality also passed.
- The first database attempt correctly rejected a test fixture that rewound a completed sales period. The repaired fixture seeds overdue history once and allows canonical closes to advance 51 contiguous periods. No receipt-assignment guard, economic writer or historical migration was changed.
- Phase 12/13 are merged. Their merged main passed all 26 applicable post-merge workflows; three expected skips kept release writers idle. Phase 14A1 remains a draft, with no staging/production deployment or live SQL. Documentation followups retain the exact tested source above rather than becoming replacement implementation identities.

## Remaining Phase 14 sequence

1. Finish 14A: reconcile labor capitalization and period-end evidence; define and verify complete statements/fundamentals; add authenticated adapters and Player/Admin reporting views with connected acceptance.
2. 14B: common-equity invariants for C corporations.
3. 14C: fixed-price primary IPO eligibility, terms and issuance.
4. 14D: versioned Business events into Financial Markets; never write Market-owned tables directly. Existing Financial Market/Portfolio remains the secondary trading surface.

The first tranche starts Phase 14. It does not certify Phase 14A or the full Phase 14. `BETA-LIVE-MIGRATION-PARITY-001` remains a separate release/runtime blocker.
