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

- Runtime securities receive an authoritative `listing_currency_code` with deterministic `ECO` backfill for existing rows.
- Existing Stock orders and trades receive immutable listing-currency snapshots for forward compatibility.
- Existing Stock holdings receive a cost-basis currency snapshot.
- A private, guarded, RLS-protected Financial Markets purchase-quote table can bind a future Stock commercial quote to one C0 purchase-funding quote.
- Future funding, Banking-transaction, settlement-transaction, fee, net-settlement, and sell-proceeds evidence columns are nullable and compatibility-safe for historical rows.
- Canonical currency and C0 quote references are discovered from the rebuilt certified schema rather than duplicated.
- The existing calendar-gated execution RPC and legacy immediate execution remain unchanged in C3A.
- No Stock wallet, shadow balance, new order book, limit-order implementation, partial-fill implementation, or Player execution cutover is introduced.

## Candidate files

- `backend/supabase/migrations/20260829100000_multicurrency_stock_funding_schema_v1.sql`
- `backend/supabase/migrations/20260829100500_multicurrency_stock_funding_assertions_v1.sql`
- `scripts/multicurrency-stock-funding-contract.mjs`
- `scripts/multicurrency-stock-funding-database.mjs`
- `.github/workflows/multicurrency-stock-funding-v1.yml`
- deterministic architecture inventory update

## Required certification before completion

C3A remains pending until one exact candidate SHA passes:

- PR-bound exact-path authority;
- C3 source and scope contract;
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
