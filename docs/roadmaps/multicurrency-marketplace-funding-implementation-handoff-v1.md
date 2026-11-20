# Multi-Currency Marketplace Funding Implementation Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C2`
**Status:** `IMPLEMENTED_NOT_MERGED`
**Branch:** `feat/multicurrency-marketplace-funding-v1`
**Draft PR:** #675
**Exact implementation and verification source:** `9b95009dd7e73ed70987a0a99716d3ee32f2662d`
**Parent C1 implementation source:** `1cf6f413f10a761265cdec6076ceb9b2b3afcbf5`
**Parent C1 clean handoff:** `065d1a76135589625e4d60f7e109e6cce8d4084f`
**Merge or deployment authorized:** No

## Implemented result

C2 integrates the shared C0 purchase-funding authority into Player-to-Player Marketplace resale while preserving Marketplace ownership of listing, reservation, order, dispute, fee, tax, Inventory custody, and listing-first serialization.

- Listing currency remains the authoritative bill, settlement, receipt, dispute, and refund currency.
- A buyer may allocate the exact Marketplace buyer total across one, two, or three canonical active Checking accounts.
- Same-currency legs use rate `1`; foreign legs consume the accepted B1 fixing, C0 1.00% retail checkout spread, and B2 clearing, reserve, hold, and liquidity authority.
- The browser supplies only public account keys, quantity/version intent, exact target-currency allocations, and bounded idempotency intent. It cannot author price, fee, tax, recipient, FX rate, source debit, or scope.
- C0 buyer funding, Marketplace seller/fee/tax distribution, canonical Inventory delivery, listing mutation, reservation consumption, order completion, and immutable evidence commit atomically.
- Funded refunds reverse the original source-account debits and original FX evidence rather than applying a current fixing.
- Legacy direct purchase is retired behind an authenticated bounded compatibility tombstone.
- Legacy Marketplace posting constraints remain compatible while new funded settlement/refund groups are explicitly admitted; optional zero-value fee/tax postings are not written.
- Public responses expose opaque Marketplace, funding, Banking, and account keys without internal UUIDs.

## Forward migrations

- `20260827100000_multicurrency_marketplace_funding_schema_v1.sql`
- `20260827100500_multicurrency_marketplace_funding_quote_v1.sql`
- `20260827101000_multicurrency_marketplace_funding_settlement_v1.sql`
- `20260827101500_multicurrency_marketplace_funding_refund_v1.sql`
- `20260827102000_multicurrency_marketplace_funding_assertions_v1.sql`
- `20260827102500_multicurrency_marketplace_funding_purge_registry_v1.sql`
- `20260827103000_multicurrency_marketplace_inventory_projection_order_v1.sql`
- `20260827103500_multicurrency_marketplace_financial_posting_compatibility_v1.sql`

## Exact-source certification evidence

- Permanent C2 source, two-replay database, concurrency, lint, and connected-browser gate — run `33142563231` — PASS.
- Database Replay — run `33142563190` — PASS.
- Player Terminal Verify with full Chromium — run `33142563193` — PASS.
- Banking FX clearing — run `33142563236` — PASS.
- Retained C1 Store funding — run `33142563169` — PASS.
- Retained C0 source identity, two replays, Banking/C0 serial acceptance, observed concurrency, and lint — run `33143124382` — PASS.
- Independent Marketplace desktop/mobile Chromium plus two-replay database certification — run `33143316570` — PASS.
- Business Store Listing Inventory V2 rerun attempt 2 — run `33142563234` — PASS without implementation changes.

The first inherited Store-listing Chromium attempt is not counted. Attempt 2 replaced it as the accepted workflow outcome and completed successfully on `9b95009dd7e73ed70987a0a99716d3ee32f2662d`.

## Safety and exclusions

PR #675 remains draft, open, unmerged, and undeployed. No merge, staging or production deployment, scheduler installation/change, secret mutation, staging/production SQL, or live-database mutation occurred.

C2 does not alter Store settlement, Stock Market settlement, Business foreign-currency treasury/procurement, B1 fixing policy, B2 standard/instant FX timing or pricing, or C0 retail funding policy.

## Next checkpoint

`BUSINESS-V2-10A4C3` — Stock Market multi-currency funding — may begin only on a separate stacked draft branch from the clean C2 documentation handoff. Financial Markets must remain the authority for assets, exchanges, orders, fills, trades, fees, holdings, cost basis, and market-time rules while consuming C0/B1/B2 for listing-currency purchase funding.
