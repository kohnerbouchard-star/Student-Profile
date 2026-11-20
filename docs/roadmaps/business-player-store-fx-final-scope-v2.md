# Business Player Store / FX Final Convergence Scope v2

**Roadmap item:** `BUSINESS-V2-10A4D`
**Status:** `IMPLEMENTED_NOT_MERGED`
**Branch:** `feat/business-player-store-fx-final-v2`
**Draft PR:** #679
**Parent branch:** `feat/business-multicurrency-treasury-v1`
**Parent C4 implementation:** `46bfc611834dca4db3084d9dce8197c499d61fcd`
**Parent C4F controller:** `51ffd008ed84f6a9acd029c8941b3f9b40733735`
**Exact implementation and verification source:** `e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b`
**Merge or deployment authorized:** No

## Decision

10A.4D is the final Player Store/FX convergence tranche. It composes the already-certified C1 funded Store authority into the live authenticated Store handler for both seeded/NPC and Business seller offers. It does not create another Store, Banking, FX, funding, Inventory, receipt, or seller-proceeds authority.

The browser may select one to three canonical Player Checking accounts and ordered allocation intent. Every non-final allocation supplies a positive listing-currency contribution; the final allocation supplies no target amount, so the server derives the exact remainder only after authoritative Store pricing and currency precision are fixed. Purchase confirmation accepts only the immutable Store quote key and idempotency intent.

The accepted C4 defaults and boundaries remain unchanged:

- offer/item currency, offer version, price, quantity, target account, seller proceeds, Store receipt identity, and listing custody are server-owned;
- C0 owns the exact target-credit funding quote/composer and B1/B2 own fixing, FX, holds, balanced posting, clearing, liquidity, reserve capacity, and public Banking evidence;
- seeded/NPC and Business seller offers use the same funded runtime boundary;
- Store purchase-versus-withdrawal ordering and Inventory delivery remain canonical;
- no legacy purchase mutation path remains reachable from either Player Edge root.

## Verified predecessor and current defect

The exact C4 implementation `46bfc611834dca4db3084d9dce8197c499d61fcd` passed all 31 PR-triggered workflows. Its clean handoff/controller is `51ffd008ed84f6a9acd029c8941b3f9b40733735`.

At that controller head:

- `SupabasePlayerStoreFundingPublicRepository` already wraps the certified funded seeded and Business Store RPCs;
- the live `playerStorePublicHttpHandler.ts` still instantiates legacy mutation-capable Store repositories for quote and purchase routes;
- generic response projections can discard nested funding quote/receipt evidence;
- Business offer catalog code still enforces same-currency purchasability;
- Player Store UI and tests still render `LOCAL WALLET`, `LOCAL AVAILABLE BALANCE`, THD, and same-currency-only copy;
- the persisted funded quote normalizers require every allocation amount before authoritative dynamic Store pricing, so a server-derived final remainder needs one forward function-only repair migration.

The earlier loopback-Origin readiness failure is not reproduced at the C4 handoff. 10A.4D must not broaden production CORS. It may repair only an exact loopback test-probe defect if the permanent connected workflow proves one remains.

## Backend convergence

The live handler must:

- instantiate `SupabasePlayerStoreFundingPublicRepository` once for funded quote, settlement, and receipt reread;
- route seeded/NPC quote and purchase to `createSeededQuote` / `settleSeededPurchase`;
- route Business offer quote, purchase, and receipt reread to `createBusinessOfferQuote` / `settleBusinessOfferPurchase` / `readBusinessOfferReceipt`;
- retain narrow read-only adapters for seeded catalog/history and Business offer-product reads;
- never instantiate a legacy mutation-capable repository behind a narrower TypeScript interface;
- preserve authenticated `PlayerRequestApplicationContext`, private `no-store`, public keys, rate-limit, CSRF, same-origin, and two-Edge-root behavior.

Static evidence must prove neither runtime root can reach the legacy quote/purchase methods or `purchase_quoted_store_item`.

## Public contracts and response evidence

Quote intent contains only:

- quantity and expected Store/offer version;
- one to three ordered, unique Player Checking public keys;
- positive canonical listing-currency target amounts for every non-final allocation;
- `targetAmount: null` for the final allocation;
- idempotency intent.

Funded quote and receipt responses preserve and validate offer/item currency and version, Store target amount/account, seller proceeds, context digest, funding quote/receipt identity, source debit and target contribution lines, accepted fixing, spread, rounding, FX disclosure, transaction keys, Store receipt identity, and immutable reread equality. Internal UUIDs and request hashes are rejected at public parsing and response boundaries.

Stable public errors must cover account ownership/type/game, duplicate account, precision, final-remainder, funding expiry, capacity, hold, quote conflict, Store version/custody, withdrawal, and committed-success refresh states.

## Forward migration boundary

Generate one migration from this live predecessor with `supabase migration new`; do not preassign or reuse a timestamp.

The first CLI invocation at 2026-08-31 03:13 UTC produced an empty `20260831031333` file that sorted before C4's reserved `20260831100000`–`20260831103000` migrations. That untracked file was removed without content. The installed CLI has no timestamp override, so the validated SQL was generated again through the CLI and reconciled using Supabase's documented newer-predecessor procedure: its generated file was renamed to the mechanically next version `20260831103001_business_player_store_fx_final_v2.sql`. No predecessor file changed and no tranche timestamp was preassigned.

The migration is function-only and must:

- preserve the inherited all-positive allocation form for historical replay and retained C1 callers;
- accept ordered final-null intent for the authenticated Player Store quote functions;
- derive Store price, target currency, and target minor-unit precision first;
- compute one exact positive final remainder and reject zero/negative, overfunded, malformed, duplicate, or non-final-null intent;
- hash the original ordered intent for deterministic idempotency conflict before live-state reinterpretation;
- pass only concrete allocations to the unchanged C0 composer;
- preserve Store/C0/B2 lock ordering and avoid pre-locking accounts;
- use `SECURITY DEFINER`, fixed `search_path`, explicit execute revokes from `public`, `anon`, and `authenticated`, and service-only grants.

The forward repair may add only the persisted system-offer evidence proven necessary by the audit: nullable `seller_offer_id`, `seller_offer_version`, and `available_quantity_at_quote` bindings on existing Store quotes; nullable `seller_offer_version_after` and `remaining_seller_quantity` results on existing Store purchases; their one game-scoped foreign key, two consistency checks, one bounded lookup index, and two immutable validation triggers. Historical rows remain nullable and untouched. No new table, balance, receipt authority, RLS change, direct table/DML grant, alternate C0/B2 composer, or purge-registry entry is authorized.

## Player Terminal boundary

The existing Store quote/review/receipt flow must add one-to-three active Checking allocation controls, final-remainder behavior, exact funded/remaining totals, accepted fixing/spread/rounding disclosure, immutable funding evidence, and quote invalidation on every changed intent.

Remove all `LOCAL WALLET`, `LOCAL AVAILABLE BALANCE`, THD conversion, same-currency settlement, and obsolete cross-currency error copy. Catalog reads remain available if Banking is unavailable, but checkout is disabled fail-closed. No optimistic balance, Inventory, receipt, seller proceeds, or FX result may be synthesized in the browser.

## Required permanent evidence

Add durable `business-player-store-fx-final-v2` static, database, concurrency, and connected-browser gates. Exact-head acceptance must prove:

- zero-to-head replay twice and rebuilt-schema advisors;
- seeded/NPC and Business offers both use the funded live handler;
- one-, two-, and three-account same/mixed/all-foreign allocation intent, final remainder, precision, replay, and conflict;
- seller proceeds, Store receipt, funding evidence, Inventory delivery, and Banking balances reconcile exactly;
- purchase-versus-withdrawal races and reverse allocation order preserve canonical locking;
- malformed public keys/UUID injection, wrong account type/owner/game, duplicate accounts, stale version, expiry, hold, liquidity, and capacity fail closed;
- two authenticated browsers complete a cross-currency purchase and the seller observes proceeds;
- two games with identical public-looking data remain isolated;
- no legacy Store purchase authority is composed;
- retained C0-C4, Store, Marketplace, Stocks, Banking, Inventory, workforce, manufacturing, Backend/all Edge, Player Chromium, accessibility, security, and repository gates pass.

## Certification result

The locked scope is implemented at exact source `e0bebfc3e774f2c7fa6e91d88b899862e7ca1d8b`. All 35 pull-request-triggered workflows returned for that SHA passed. Permanent run `33377788370` passed source, replay/database/concurrency, Player desktop/mobile/accessibility, and the connected two-browser/two-game Store journey; retained Store cutover run `33377788283` passed its connected Buyer/seller journey and withdrawal-race evidence. The implementation adds the one forward migration, composes one funded mutation authority in both Edge roots, preserves full funding evidence for seeded and Business offers, and removes same-currency wallet assumptions without changing C0/B2 authority or stored economics.

## Safety and next boundary

This branch and its pull request remain draft, unmerged, and undeployed. No scheduler/cron, secret, staging/production SQL, staging/production deployment, or live-data mutation is authorized. Disposable local/CI database mutation is permitted only for replay and acceptance evidence.

`BETA-LIVE-MIGRATION-PARITY-001` remains a release/runtime blocker. Phase 11 is the next item only after this exact implementation receives a separate clean documentation handoff and checkpoint/controller head.
