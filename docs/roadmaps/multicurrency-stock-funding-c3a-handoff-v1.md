# Multi-Currency Stock Market Funding C3A Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C3A`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Exact C3A implementation SHA:** `f5fb9716ee4a8ab209cbc535d3583925c6d261c7`  
**Parent C2 implementation:** `9b95009dd7e73ed70987a0a99716d3ee32f2662d`  
**Parent C2 clean handoff:** `ba033ac4a7759d068233513431891fc9de3ae95a`  
**Merge or deployment authorized:** No

## Certified result

C3A establishes the compatibility-safe schema foundation for Stock Market listing-currency settlement without activating a new execution path.

- Stock templates and runtime securities have one authoritative `listing_currency_code` resolved from the issuer country's active canonical currency.
- Existing Stock orders and trades have immutable listing-currency snapshots while remaining in the `legacy` settlement-evidence family.
- Existing Stock holdings have an immutable cost-basis currency equal to the runtime security listing currency.
- Stock orders contain nullable C0 funding, B2 transaction, market-liquidity, destination-account, and price-tick evidence fields for later C3 settlement tranches.
- A guarded, forced-RLS Stock-domain binding maps each game/listing currency to the canonical zero-balance B2 `stocks.market-liquidity` Checking account.
- The game-scoped liquidity binding is registered with the canonical resumable game-data purge registry; the global B2 purge invariant remains fail-closed.
- Liquidity identity initialization is idempotent and cannot post ledger entries, alter balances, or create a monetary faucet.
- Historical direct-ledger orders remain readable without fabricated C0/B2 evidence.
- The existing calendar-gated execution RPC and legacy immediate execution remain unchanged in C3A.
- No Stock wallet, shadow balance, purchase quote command, new order book, limit-order implementation, partial-fill implementation, or Player execution cutover is introduced.

## Canonical implementation files

- `backend/supabase/migrations/20260827110000_multicurrency_stock_funding_schema_v1.sql`
- `backend/supabase/migrations/20260827110500_multicurrency_stock_funding_assertions_v1.sql`
- `backend/supabase/migrations/20260827111000_multicurrency_stock_funding_purge_registry_v1.sql`
- `scripts/multicurrency-stock-funding-schema-contract.mjs`
- `scripts/multicurrency-stock-funding-schema-database.mjs`
- `.github/workflows/multicurrency-stock-funding-v1.yml`

The superseded `20260829100000_multicurrency_stock_funding_schema_v1.sql` draft and its stale duplicate contract are not part of the canonical C3A lineage.

## Exact-head certification evidence

The exact implementation SHA `f5fb9716ee4a8ab209cbc535d3583925c6d261c7` passed the permanent C3A source and database gate and every inherited workflow triggered for that exact head:

- `multicurrency-stock-funding-v1` — run `33245689981` — success;
- `Database Replay` — run `33245690010` — success;
- `Backend Typecheck` — run `33245690000` — success;
- `banking-fx-clearing-v1` — run `33245689996` — success;
- `Business Player Store Cutover V2` — run `33245689980` — success;
- `Exchange Calendar Runtime` — run `33245689984` — success;
- `Required Game Market Timezone` — run `33245689991` — success;
- `Repository Quality` — run `33245689987` — success;
- `Supply Chain Security` — run `33245690004` — success;
- `Admin API Check` — run `33245690031` — success;
- `Staging Readiness Preflight` — run `33245690011` — success.

The C3A workflow itself completed both zero-to-head database replays, rebuilt-database acceptance, purge-registry verification, deterministic architecture inventory verification, migration validation, typecheck, and rebuilt-schema lint.

## Source-of-truth rule

`f5fb9716ee4a8ab209cbc535d3583925c6d261c7` is the immutable C3A implementation identity. Later documentation or C3B commits must not replace it as the tested C3A source.

## Next boundary

C3B is now authorized. C3B may add the immutable immediate-buy Stock quote and bind it to one C0 purchase-funding quote. C3B must not move money or shares, consume either quote, create an order or trade, alter the Player API/UI, activate sell settlement, merge, deploy, change schedulers or secrets, run staging/production SQL, or mutate a live database.
