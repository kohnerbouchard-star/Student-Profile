# Multi-Currency Stock Market Funding Intake Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C3`  
**Status:** `INTAKE_COMPLETE — IMPLEMENTATION_NOT_STARTED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Parent branch:** `feat/multicurrency-marketplace-funding-v1`  
**Exact parent C2 implementation and verification source:** `9b95009dd7e73ed70987a0a99716d3ee32f2662d`  
**Exact parent C2 clean documentation handoff/base:** `ba033ac4a7759d068233513431891fc9de3ae95a`  
**C3 PR authority commit:** `435cc79096f8ef8032d079de383da9d12ad05c8d`  
**Production deployment authorized:** No

## Intake completed

- Re-read the live C2 parent and confirmed PR #675 remains the certified, unmerged parent tranche.
- Verified that no pre-existing `feat/multicurrency-stock-funding-v1` branch or C3 pull request existed.
- Audited the active Stock schema, trading RPCs, exchange-calendar wrapper, Player API contracts/repository, Player Market page, and market-order flow.
- Corrected the planning assumption that C3 must integrate a live order book. The parent implements immediate market fills only.
- Locked C3 to listing-currency authority, one-to-three-account C0 buy funding, balanced B2 sell proceeds, exact price/tick quoting, and Player UI/API convergence.
- Explicitly excluded limit orders, partial fills, queued orders, time-in-force, order cancellation, short selling, margin, derivatives, corporate actions, IPO publication, and price-engine/calendar changes.
- Established PR #676 and its PR-specific cross-cutting authority with deployment, live mutation, and secret-value permissions disabled.

## Controlling records

- `docs/roadmaps/multicurrency-stock-funding-scope-v1.md`
- `docs/roadmaps/multicurrency-stock-funding-authority-audit-v1.md`
- `docs/roadmaps/multicurrency-stock-funding-implementation-plan-v1.md`
- `docs/operations/contracts/player-cross-cutting/pr-676.json`

## Resolved architecture

Financial Markets remains authoritative for:

- stock templates and per-game runtime assets;
- issuer country, ticker, price state, price ticks, market session, and stale-price decisions;
- immediate order and fill identity;
- holdings, average cost, realized P&L, no-short-selling, replay, and game isolation;
- Stock API, DTO, and Player Market behavior.

C0 remains authoritative for immediate-buy funding from one to three Player Checking accounts, including retail checkout FX. B1 remains authoritative for daily fixings. B2 remains authoritative for Checking accounts, balances, holds, balanced journals, FX clearing, reserve, liquidity caps, and facility evidence.

C3 introduces one named game/currency B2 system Checking account, `stocks.market-liquidity`, as the monetary counterparty for the retained synthetic immediate-fill market. Buys credit it through C0; sells debit it through balanced B2 settlement. It is not a Stock wallet or a source of unbounded money.

## First authorized implementation tranche

C3A may now begin and is limited to:

1. immutable listing-currency fields and deterministic issuer-country backfill;
2. listing/basis currency metadata on holdings/orders/trades;
3. legacy-versus-C3 evidence-family columns and constraints;
4. named market-liquidity account identity and trusted initialization evidence;
5. schema assertions, source contract, complete replay, and lint.

C3A must not change the active buy/sell runtime path, Player request body, or Player UI. C3B remains closed until C3A passes its own exact-head structural and replay gates.

## Safety state

No merge, deployment, scheduler installation or change, secret mutation, staging/production SQL, or live-database mutation occurred during intake. PR #676 must remain draft, open, unmerged, and undeployed throughout implementation and certification.
