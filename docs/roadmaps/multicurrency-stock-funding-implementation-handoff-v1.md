# Multi-Currency Stock Market Funding Implementation Handoff v1

**Roadmap item:** `BUSINESS-V2-10A4C3`  
**Certification checkpoint:** `BUSINESS-V2-10A4C3F`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Exact implementation and verification source:** `058162d7b9688809e885d9e6fe77ed42978c7a03`  
**Certified predecessor C3D implementation:** `9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15`  
**Merge or deployment authorized:** No

## Certified result

C3 completes the Stock Market multi-currency funding boundary while preserving Financial Markets as the authority for assets, listing currency, exchange state, price/tick evidence, holdings, orders, trades, cost basis, and realized P&L.

- C3A establishes immutable Stock listing currency, named game-scoped market-liquidity Banking accounts, and mutually exclusive legacy/current execution-evidence families.
- C3B creates replay-first immutable immediate-buy quotes bound to one authoritative C0 purchase-funding quote. The quote fixes public ticker, quantity, price/tick, listing-currency gross value, one-to-three canonical Checking allocations, expiry, and funding/FX disclosure without moving money or shares.
- C3C settles an accepted buy quote atomically. C0/B1/B2 funding credits the named Stock market-liquidity account, holdings increase exactly once, listing-currency average cost is updated, one filled order/trade is recorded, both quotes are consumed, and every monetary/share/evidence mutation rolls back together on failure.
- C3D settles immediate sells atomically. Shares decrease exactly once, market liquidity is debited, one Player-selected canonical Checking account in listing currency is credited through balanced B2 Banking authority, realized P&L remains listing-currency evidenced, and replay/conflict/concurrency behavior fails closed.
- C3E cuts the authenticated Player API and Player Terminal onto the certified quote, settlement, Banking-read, and public-key boundaries. Listing currency is published through Stock reads; immediate buys use an explicit quote-review-confirm flow with one to three Checking accounts; immediate sells require one public destination Checking account; immutable receipts, proceeds, FX disclosure, expiry, replay, and refresh-recovery states are visible without exposing internal UUIDs or browser-authored monetary outcomes.
- The retained `buy_now` gateway action is API-level orchestration over the same C3B quote and C3C settlement authorities. The retired legacy one-step Player Stock order body remains an authenticated bounded `410 stock_market_trading_retired` compatibility response.
- Unsupported limit/queued/partial-fill execution, margin, short selling, Stock wallets, parallel balance caches, browser-authored trusted prices/rates/UUIDs, and the unbacked fee estimate remain absent.

## Exact-source certification evidence

Exact implementation `058162d7b9688809e885d9e6fe77ed42978c7a03` passed every pull-request-triggered workflow returned for that exact head: 27 completed runs, 27 successful conclusions, and no remaining failure, cancellation, timeout, pending, or in-progress result.

- `multicurrency-stock-funding-v1` — run `33333720161` — success.
- Database Replay — run `33333720099` — success.
- Backend Typecheck — run `33333720086` — success.
- Repository Quality — run `33333720116` — success.
- Supply Chain Security — run `33333720117` — success.
- Admin API Check — run `33333720143` — success.
- Staging Readiness Preflight — run `33333720035` — success.
- Player Terminal Verify — run `33333720103` — success.
- Environment Neutral Browser — run `33333720063` — success.
- Exchange Calendar Runtime — run `33333720091` — success.
- Required Game Market Timezone — run `33333720029` — success.
- `banking-fx-clearing-v1` — run `33333720102` — success.
- `multicurrency-store-funding-v1` — run `33333720039` — success.
- `multicurrency-marketplace-funding-v1` — run `33333720044` — success.
- Business Player Store Cutover V2 — run `33333720118`, attempt 2 — success.
- Business Store Atomic Settlement V2 — run `33333720030` — success.
- Business Store Listing Inventory V2 — run `33333720108` — success.
- Business Store Seller Offers V2 — run `33333720038` — success.
- Business Store Withdrawal Safety V2 — run `33333720147` — success.
- Business Banking Runtime — run `33333720031` — success.
- Business Economy V2 — run `33333720175` — success.
- Business Timed Manufacturing V2 — run `33333720084` — success.
- Business Workforce Hiring V2 — run `33333720052` — success.
- Business Workforce Payroll V2 — run `33333720053` — success.
- Progression Runtime — run `33333720075` — success.
- Runtime Interaction Wiring — run `33333720126` — success.
- World Runtime — run `33333720034` — success.

The permanent Stock gate ran two successful exact-head jobs:

- source, PR authority, C3A-C3E contracts, focused Player funding tests, Deno/backend checks, and deterministic architecture inventory — job `99316775315`;
- two zero-to-head C3B/C3C/C3D database replays, rebuilt-schema lint, and disposable-stack teardown — job `99316775418`.

The first attempt of Business Player Store Cutover V2 recorded one transient local edge-runtime `500` for `GET /players/me/stocks/portfolio` during concurrent shell startup. Its automatic retry recovered, and the connected Store settlement and isolation assertions completed, but the strict console-clean enforcement correctly prevented acceptance of that attempt. The complete workflow was rerun on the unchanged exact source. Attempt 2 passed all six jobs, including the connected two-browser/two-game journey, replay/lint, serial and concurrent settlement, retained authority checks, Player Chromium, Backend/all-Edge verification, privacy sanitation, and final result enforcement. No implementation code, economic invariant, privacy rule, or acceptance assertion was weakened.

## Source-of-truth rule

`058162d7b9688809e885d9e6fe77ed42978c7a03` is the immutable C3 implementation and verification identity. This documentation-only handoff and the later checkpoint-manifest commit must not replace it as the tested source. The commit adding this file is the clean C3F documentation handoff and is recorded separately by the authoritative checkpoint manifest.

## Safety and exclusions

PR #676 remains draft, open, unmerged, and undeployed. C3 does not authorize or perform a merge, staging or production deployment, scheduler installation/change, secret mutation, staging/production SQL, or live-database mutation.

C3 does not add a live order book, limit or queued orders, partial fills, short selling, margin, lending, derivatives, dividends, splits, corporate actions, Business IPO securities, Business-owned foreign Checking accounts, Business treasury FX, procurement funding, Store/Marketplace settlement rewrites, B1 fixing-policy changes, B2 standard/instant FX pricing or timing changes, C0 retail-spread changes, or a Stock wallet/balance authority.

The global release blocker `BETA-LIVE-MIGRATION-PARITY-001` remains unresolved and is not changed by C3 certification.

## Next checkpoint

`BUSINESS-V2-10A4C4` — Business multi-currency treasury and procurement — is the next authorized checkpoint after the separate checkpoint-manifest promotion commit.

C4 may add Business-owned foreign-currency Checking accounts, bounded server-authoritative treasury FX, and procurement funding while reusing the certified B1/B2/C0 authority. It must not reopen Stock settlement, create parallel money or FX authority, begin final 10A.4D Store/FX convergence prematurely, merge, deploy, alter schedulers or secrets, execute staging/production SQL, or mutate live data.