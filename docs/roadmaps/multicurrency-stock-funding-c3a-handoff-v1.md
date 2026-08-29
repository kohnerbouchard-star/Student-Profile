# Multi-Currency Stock Market Funding C3A Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C3A`  
**Status:** `C3A_CANDIDATE — CERTIFICATION_PENDING`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Parent C2 implementation:** `9b95009dd7e73ed70987a0a99716d3ee32f2662d`  
**Parent C2 clean handoff:** `ba033ac4a7759d068233513431891fc9de3ae95a`  
**Merge or deployment authorized:** No

## Candidate result

C3A adds a compatibility-safe schema foundation for Stock Market listing-currency settlement without activating a new execution path.

- Stock templates and runtime securities receive one authoritative `listing_currency_code` resolved from the issuer country's active canonical currency.
- Existing Stock orders and trades receive immutable listing-currency snapshots while remaining in the `legacy` settlement-evidence family.
- Existing Stock holdings receive an immutable cost-basis currency equal to the runtime security listing currency.
- Stock orders gain nullable C0 funding, B2 transaction, market-liquidity, destination-account, and price-tick evidence fields for later C3 settlement tranches.
- A guarded, forced-RLS Stock-domain binding maps each game/listing currency to the canonical zero-balance B2 `stocks.market-liquidity` Checking account.
- Liquidity identity initialization is idempotent and cannot post ledger entries, alter balances, or create a monetary faucet.
- Historical direct-ledger orders remain readable without fabricated C0/B2 evidence.
- The existing calendar-gated execution RPC and legacy immediate execution remain unchanged in C3A.
- No Stock wallet, shadow balance, purchase quote command, new order book, limit-order implementation, partial-fill implementation, or Player execution cutover is introduced.

## Canonical candidate files

- `backend/supabase/migrations/20260827110000_multicurrency_stock_funding_schema_v1.sql`
- `backend/supabase/migrations/20260827110500_multicurrency_stock_funding_assertions_v1.sql`
- `scripts/multicurrency-stock-funding-schema-contract.mjs`
- `scripts/multicurrency-stock-funding-schema-database.mjs`
- `.github/workflows/multicurrency-stock-funding-v1.yml`
- deterministic architecture inventory update

The superseded `20260829100000_multicurrency_stock_funding_schema_v1.sql` draft and its stale duplicate contract are not part of the canonical C3A lineage.

## Required certification before completion

C3A remains pending until one exact candidate SHA passes:

- PR-bound exact-path authority;
- C3A source and scope contract;
- migration validation;
- Backend and Edge typecheck;
- retained Stock handler/repository tests;
- deterministic architecture inventory;
- two complete zero-to-head database replays;
- C3A rebuilt-database acceptance after each replay;
- rebuilt-schema lint;
- retained Player Terminal market and Banking contracts;
- the required inherited B1/B2/C0/C1/C2, Database Replay, calendar/timezone, repository-quality, security, and Player gates triggered by the exact head.

After those gates pass, this record must be updated with the immutable exact implementation SHA and evidence. A later documentation-only SHA must not replace the tested implementation identity.

## Next boundary

C3B remains closed. No Financial Markets funding quote command, buy settlement, sell-proceeds cutover, Player API/UI change, merge, deployment, scheduler change, secret mutation, staging/production SQL, or live-database operation is authorized by this pending handoff.
