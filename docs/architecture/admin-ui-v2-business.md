# Admin UI V2 — Business

**Owner branch:** `refactor/admin-ui-v2-business-v1`  
**Exact base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Production promotion authorized:** No

## Purpose and boundary

This tranche migrates only the Admin **Business** destination into the existing source-owned Admin V2 shell. It supervises the current authoritative player-business model. It does not create a second ownership, inventory, product, production, banking, loan, Store, Crafting, or economic-asset model.

The current schema stores one canonical `owner_player_id` on each `business_entities` row. Entity types may include partnership or cooperative, but the current ownership contract does not expose a multi-owner membership model. Admin V2 therefore renders the one canonical owner and does not fabricate multi-player ownership.

## Audited authoritative contract

| Operation | Current route / model | V2 use |
|---|---|---|
| Business directory | `GET /games/:gameId/businesses` | Business identity, owner presentation, entity type, industry/country/currency, status, capitalization, revenue/expense/profit totals, valuation, reputation, capacity, demand, failures, lifecycle timestamps. |
| Compliance update | `POST /games/:gameId/businesses/:businessKey/compliance` | Existing `set_business_compliance_v1` mutation. V2 exposes requirement key/type/status, fee, optional expiration, and administrative reason with idempotency. |
| Business-cycle settlement | `POST /games/:gameId/businesses/:businessKey/settle` | Audited but intentionally not surfaced. The mutation requires inflation, exchange, interest, difficulty, and settlement-key inputs not supplied by the current Business read contract; V2 will not make administrators invent economic state. |
| Product review | `POST /games/:gameId/business-products/:productKey/review` | Audited but not surfaced here because the current Business Admin read route does not expose a product directory. |
| Inventory / products / production / sales / employees | Canonical database/runtime models exist | Not queried directly by this Admin route. No alternate projection is invented. |
| Business banking / loans | Separate Admin contracts | Kept on Banking/Loans boundaries rather than folded into Business. |

## Contract hardening

Two narrow defects in the existing Admin contract are corrected as part of this migration:

1. The authorization guard recognized `business` but the live collection path is plural `businesses`. Both Business reads and mutations are now explicitly gated by `business.manage`, and rate-limit actions classify the plural resource as `businesses` instead of `unknown`.
2. The old Business directory returned `owner_player_id` to the browser. The server now resolves that UUID against the game-scoped Player model and returns only safe owner presentation fields (`display_name`, `roster_label`, `status`). The UUID is stripped before the response leaves the Admin API.

The read projection also includes already-authoritative `capacity_units`, `demand_index`, `created_at`, and `closed_at` fields so Admin V2 can show operating/lifecycle information without creating new semantics.

## V2 ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/business/BusinessApi.js` | Exact Business BFF paths, validation, cancellation, safe error normalization, and compliance idempotency transport. |
| `admin/v2/src/routes/business/BusinessController.js` | Six-state lifecycle, read-model normalization, privacy filtering, filters, mutation retry identity, and teardown. |
| `admin/v2/src/routes/business/BusinessRoute.js` | Summary, search/status/country filters, responsive directory, detail drawer, compliance dialog, and state presentation. |
| `admin/v2/styles/routes/business.css` | Route-scoped responsive layout and visual states. |
| `backend/supabase/functions/admin-api/businessBankingOperations.ts` | Safe Business owner projection and existing compliance RPC. |
| `backend/supabase/functions/admin-api/adminSecurityGuard.ts` | Explicit `business.manage` authorization for plural Business routes. |

`BusinessApi.js` receives the same `createAdminBffTransport(...)` instance as the existing V2 API client. It does not install a global fetch wrapper, transmit bearer credentials, or call Supabase directly.

## Presentation and privacy rules

- Database Player UUIDs never enter the Business browser DTO.
- The public `biz_<32 hex>` key remains visible because it is the authoritative public Business identifier and is required for Business mutations.
- Search/filter is local after the authoritative directory is loaded.
- Financial totals are displayed in each business's supplied currency; totals are not aggregated across currencies.
- Signed profit is preserved; other naturally nonnegative financial/operating metrics are validated as such.
- Missing owner or optional operating data is shown as unavailable, never inferred.
- The details drawer explicitly states which adjacent relationships are not exposed by the current Business Admin contract.
- Loading, ready, refreshing, stale, empty, failed/retry, and permission-denied states use the existing V2 state/boundary system.

## Regression boundary

Only Business changes from `planned` to `v2`. Overview, Store, and Market remain native. Players, Attendance, Contracts, Settings, and Logs keep their current legacy disposition. Banking, Loans, Crafting, Marketplace, Inventory, World, News, Messages, and Progression retain their current planned/other dispositions. Crafting and Inventory source files are not changed.

## Verification

Targeted verification covers: Business Admin API typecheck/tests, exact BFF paths, safe error normalization, 0/1/many businesses, long/Korean identity text, status/country/search filtering logic, negative profit, canonical single-owner behavior, private UUID suppression, permission denial before protected reads, six-state stale behavior, compliance idempotency/retry behavior, and existing V2 route integration. Browser/runtime evidence remains review-time evidence; no production merge or promotion is part of this branch.
