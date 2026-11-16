# Multi-Currency Store Funding Implementation Handoff v1

## Canonical status

- Roadmap item: `BUSINESS-V2-10A4C1`.
- Owner branch: `feat/multicurrency-store-funding-v1`.
- Stacked draft PR: #674, based on `feat/multicurrency-funding-core-v1` / draft PR #673.
- Parent C0 implementation and verification source: `fd1511d716c1efd291cf6f45415a32a8d7550db4`.
- Parent C0 clean documentation handoff/base: `0aec6cd3b97058a918ff60acdef0143cfcd97d06`.
- **Exact C1 implementation and verification source:** `1cf6f413f10a761265cdec6076ceb9b2b3afcbf5`.
- **Permanent C1 certification run:** `33114174603`.
- **Retained connected Store certification run:** `33114174711`.
- Canonical status: `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE`.
- This and all later documentation-only commits must never replace `1cf6f413f10a761265cdec6076ceb9b2b3afcbf5` as the tested C1 implementation identity.
- PR #674 remains draft, open, mergeable, unmerged, and undeployed.

## Certification issue resolved without source change

The first exact-head connected Store job completed the Store purchase, payment, Inventory, receipt, replay, withdrawal-ordering, and two-game-isolation evidence, but its strict browser assertion rejected two console errors. The sanitized artifact showed one transient bodyless `503` for `GET /players/me/contracts` and one for `GET /players/me/messages` during the second-game login fan-out. Each independent read retried automatically and returned `200` one second later. Neither request was a Store quote, settlement, receipt, Banking, FX, or Inventory mutation.

The failed job was rerun at the unchanged implementation SHA. Exact-SHA rerun job `98676659699` passed the two-browser journey, privacy scan, evidence publication, and final enforcement. No application source, browser assertion, resilience rule, Store settlement invariant, C0 funding rule, B1 fixing rule, B2 clearing rule, or architecture ratchet was weakened.

## Implemented authority

C1 makes both Store supply classes consume the certified C0 purchase-funding authority while preserving Store ownership of commercial and Inventory semantics:

- seeded/NPC bills remain denominated in the Store item currency and credit the named game-scoped `store.seeded-revenue` Checking account;
- Business seller-offer bills remain denominated in the offer currency and credit the seller Business's canonical active Checking account;
- a Buyer may allocate the exact Store bill across one to three unique canonical Player Checking accounts;
- same-currency legs use rate `1`, zero spread, and no FX facility;
- foreign legs consume C0's retail checkout policy and the accepted B1/B2 fixing, clearing, reserve, and bounded-liquidity authorities;
- Store quote and receipt identities remain distinct from `pfq_...` and `pfr_...` funding evidence;
- Store remains authoritative for item/offer identity, price, stock, withdrawal eligibility, quote lifecycle, Inventory delivery, acquisition basis, Business COGS/margin, and Store-root-first locking;
- C0 remains the only funding quote/composer authority, while B2 remains the only balanced Banking and FX-clearing authority;
- matching replay resolves before mutable price, stock, balance, hold, fixing, or facility reinterpretation; conflicting reuse fails closed;
- payment, target credit, FX effects, Inventory movement, Store receipt, funding receipt, quote consumption, and seller/system evidence commit atomically or roll back together.

C1 creates no Store wallet, duplicate FX engine, reusable foreign balance, Savings checkout path, parallel Inventory projection, or alternate Store money journal.

## Durable implementation surface

### Forward migrations

- `backend/supabase/migrations/20260827093000_multicurrency_store_funding_schema_v1.sql`
- `backend/supabase/migrations/20260827093500_multicurrency_store_funding_quote_commands_v1.sql`
- `backend/supabase/migrations/20260827094000_multicurrency_store_funding_settlement_v1.sql`
- `backend/supabase/migrations/20260827094500_multicurrency_store_funding_assertions_v1.sql`

The schema binds seeded and Business Store quotes and receipts to C0 funding quote/receipt, B2 Banking transaction, recipient account, context hash, and idempotency evidence. Historical compatibility rows remain readable, but funded receipts cannot fabricate the old single-ledger-entry cross-currency model.

The quote commands preserve Store identity, normalize the bill to the target currency's supported minor unit, resolve the canonical recipient account, bind immutable Store context to one C0 quote, and cap Store usability at the earlier Store or funding expiry.

The settlement commands preserve Store-root-first locking, validate Store/C0 context equality, invoke C0 composition inside the Store transaction, deliver canonical Inventory, preserve Buyer acquisition basis and Business COGS/margin, consume both quotes once, and publish bounded Store plus nested funding evidence.

### Public Store integration

- `backend/src/domains/store/contracts/playerStoreFundingPublicContracts.ts`
- `backend/src/domains/store/infrastructure/playerStoreFundingPublicResponse.ts`
- `backend/src/domains/store/infrastructure/supabasePlayerStoreFundingPublicRepository.ts`

These files enforce public-key-only allocation input, trusted server scope, bounded C0 evidence projection, stable error mapping, and recursive internal-UUID denial. The inherited authenticated Store surface consumes this authority without creating a separate client balance or exchange-rate cache.

### Permanent verification

- `.github/workflows/multicurrency-store-funding-v1.yml`
- `scripts/multicurrency-store-funding-contract.mjs`
- `scripts/multicurrency-store-funding-database.mjs`
- `docs/operations/contracts/player-cross-cutting/pr-674.json`
- `docs/roadmaps/multicurrency-store-funding-scope-v1.md`

## Exact-head verification on `1cf6f413f10a761265cdec6076ceb9b2b3afcbf5`

### Permanent C1 gate

**`multicurrency-store-funding-v1` — PASS** (`33114174603`):

- source and scope job `98664460581` — success;
- disposable PostgreSQL, zero-to-head replay twice, C1 database acceptance, and rebuilt-schema lint job `98664460167` — success.

The C1 database acceptance covers seeded/NPC and Business-offer quoting and settlement; one-, two-, and three-account allocations; same, mixed, and foreign source currencies; exact recipient credit; stock and Buyer Inventory movement; immutable Store/C0 evidence; replay/conflict; expiry; balance, hold, fixing, facility, stock, version, and withdrawal races; rollback; privacy; and two-game isolation.

### Retained connected Store gate

**`Business Player Store Cutover V2` — PASS** (`33114174711`) with all six jobs successful:

- connected authenticated Buyer/seller journey in two games — `98676659699`;
- complete database replay twice and lint — `98676660883`;
- standalone Player Terminal and full Chromium — `98676661493`;
- serial settlement, ordering races, and two-game isolation — `98676700370`;
- retained Store authority, repository quality, and supply-chain security — `98676700536`;
- public Store projection, capabilities, rate limits, Backend TypeScript, and all Edge roots — `98676705692`.

### Complete exact-head workflow inventory

All 20 pull-request-triggered workflows returned for the implementation source completed successfully:

- `multicurrency-store-funding-v1` — `33114174603`;
- `Business Player Store Cutover V2` — `33114174711`;
- `banking-fx-clearing-v1` — `33114174729`;
- `Database Replay` — `33114174644`;
- `Backend Typecheck` — `33114174728`;
- `Repository Quality` — `33114174740`;
- `Supply Chain Security` — `33114174605`;
- `Runtime Interaction Wiring` — `33114174607`;
- `Business Store Atomic Settlement V2` — `33114174623`;
- `Business Store Offer-Aware Quotes V2` — `33114174722`;
- `Business Store Listing Inventory V2` — `33114174777`;
- `Business Store Withdrawal Safety V2` — `33114174608`;
- `Business Store Seller Offers V2` — `33114174732`;
- `Business Timed Manufacturing V2` — `33114174490`;
- `Business Workforce Payroll V2` — `33114174654`;
- `Business Economy V2` — `33114174611`;
- `Exchange Calendar Runtime` — `33114174646`;
- `Required Game Market Timezone` — `33114174606`;
- `Admin API Check` — `33114174530`;
- `Staging Readiness Preflight` — `33114174723`.

No failed, cancelled, timed-out, action-required, queued, or in-progress workflow remained at implementation certification. Conditional diagnostic and unauthorized release/deployment paths remained skipped where not applicable.

## Exit result

- Store-owned seeded/NPC and Business-offer identity: **met**.
- One-to-three canonical Player Checking accounts and exact funded-total equality: **met**.
- Same-currency and certified retail checkout FX funding: **met**.
- Exact named Store-system or seller-Business Checking credit: **met**.
- Atomic C0/B2 funding, Store stock, Buyer Inventory, receipt, COGS/margin, and quote lifecycle: **met**.
- Replay, conflict, expiry, rollback, stock/withdrawal/balance/hold/fixing/facility races, and two-game isolation: **met**.
- Public-key-only browser boundary and no competing Store FX/Banking/Inventory authority: **met**.
- Complete source, database, Backend/all Edge, repository, security, Player, Chromium, and connected exact-head matrix: **met**.
- Merge, deployment, scheduler, secrets, staging/production SQL, and live-environment completion: **not claimed**.

## Next authorized roadmap item

`BUSINESS-V2-10A4C2` may begin on a new stacked branch `feat/multicurrency-marketplace-funding-v1` from the clean C1 documentation handoff.

C2 is limited to making Marketplace settlement preserve listing currency and consume the shared C0 funding authority without competing treasury balance writes. Stocks remain C3, Business foreign-Checking treasury/procurement remains C4, and final Store/FX convergence remains 10A.4D. No merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation is authorized by this handoff.
