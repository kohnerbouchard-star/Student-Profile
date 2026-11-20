# Multi-Currency Stock Market Funding C3D Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C3D`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Exact C3D implementation SHA:** `9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15`  
**Parent C3C implementation:** `2426edf7a9d57eddd24f401c885d6abbb705f582`  
**Merge or deployment authorized:** No

## Certified result

C3D establishes replay-first atomic immediate-sell Stock settlement on top of the C3A listing-currency/liquidity foundation and B2 balanced Banking authority.

- The Player selects one public destination Checking account in the Stock listing currency.
- Replay is resolved before current price, liquidity, account, or holdings reinterpretation.
- Settlement revalidates market-open state, exact submitted price/tick, Player/session/game scope, sufficient unreserved holdings, destination ownership/status/currency, and available canonical Stock market liquidity.
- Market liquidity is debited and the Player destination Checking account is credited through one balanced B2 transaction; no direct Player-ledger credit or Stock wallet is introduced.
- Holdings are reduced exactly once, realized P&L remains listing-currency evidenced, and one filled sell order/trade is linked to the Banking settlement evidence.
- Matching replay returns the committed result; conflicting reuse fails closed.
- Failure injection proves rollback across monetary, holding, order, trade, and evidence stages.
- True concurrent oversubscription is exercised with independent database sessions; concurrent sells cannot double-pay proceeds or drive holdings negative.
- Permanent fail-closed acceptance covers closed market, price/tick mismatch, insufficient holdings, wrong destination authority/currency, and sufficient-shares/insufficient-market-liquidity behavior.
- The insufficient-liquidity fixture uses canonical Banking holds and database numeric values rather than direct balance writes or JavaScript monetary arithmetic.
- C3D does not add short selling, margin, partial fills, queued/limit-order execution, Player API/UI cutover, or changes to the Stock price engine, exchange calendar, scheduler, Store, Marketplace, or Business treasury.

## Exact-head certification evidence

Exact implementation `9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15` passed the complete pull-request workflow matrix associated with that exact head:

- `multicurrency-stock-funding-v1` — run `33283575189` — success.
- Database Replay — run `33283575244` — success.
- Backend Typecheck — run `33283575162` — success.
- Repository Quality — run `33283575148` — success.
- Supply Chain Security — run `33283575188` — success.
- Admin API Check — run `33283575171` — success.
- Staging Readiness Preflight — run `33283575217` — success.
- Exchange Calendar Runtime — run `33283575245` — success.
- Required Game Market Timezone — run `33283575135` — success.
- `banking-fx-clearing-v1` — run `33283575201` — success.
- Business Player Store Cutover V2 — run `33283575147` — success.

The dedicated Stock database lane replayed the C3B/C3C/C3D stack from zero twice, exercised serial buy/sell acceptance, C3D fail-closed market/liquidity vectors, true concurrent sell oversubscription, and rebuilt-schema lint successfully on the exact implementation SHA.

## Source-of-truth rule

`9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15` is the immutable C3D implementation and verification identity. This documentation commit and later C3E work must not replace it as the tested C3D source.

## Next boundary

C3E is now authorized: authenticated Player API and UI cutover.

C3E must publish listing currency through Stock read DTOs, replace active immediate-buy execution with C3B quote plus C3C settlement routes, extend immediate sell with one public listing-currency destination Checking account, reuse authoritative Banking account reads, add bounded one-to-three-account funding controls and FX disclosure, expose immutable receipts/proceeds, remove unsupported fee/limit-order execution affordances, and preserve same-origin authentication/CSRF/session/public-key and accessibility boundaries.

C3E must not create a Stock wallet/balance cache, permit browser-authored trusted UUIDs or monetary outcomes, add limit/queued/partial-fill execution, change the price engine/exchange calendar/scheduler, merge, deploy, mutate secrets, execute staging/production SQL, or mutate live data.
