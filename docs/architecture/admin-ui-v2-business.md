# Admin UI V2 — Business

**Owner branch:** `refactor/admin-ui-v2-business-v1`
**Reconciled main:** `4c17b942fcf4b2a6f60b629549f192d066053ba4`
**Status:** `BUSINESS_SCOPE_CORRECTED_WAITING_FOR_503`
**Production promotion authorized:** No

## Purpose and boundary

This tranche migrates only the Admin **Business** destination into the source-owned Admin V2 shell. It consumes contracts already present on merged `main` and does not redesign Admin backend authorization, Business ownership, inventory, warehouse, materials, COGS, production, Store, Crafting, Marketplace, banking, or loans.

PR #520 is intentionally UI-scoped. Backend defects discovered while implementing the route are documented as external blockers rather than corrected in this branch.

## Current authoritative Business Admin contract

The merged Business Admin handler currently exposes:

| Operation | Current route / model | Business V2 use |
|---|---|---|
| Business directory | `GET /games/:gameId/businesses` | Uses the merged directory fields: public Business key, legal/entity/industry/country/currency identity, status, capitalization, revenue, expense, profit, valuation, reputation, failure count, and `updated_at`. |
| Compliance update | `POST /games/:gameId/businesses/:businessKey/compliance` | Uses the existing `set_business_compliance_v1` mutation with the existing bounded requirement/status/fee/expiration/reason/idempotency contract. |
| Business-cycle settlement | `POST /games/:gameId/businesses/:businessKey/settle` | Not surfaced. Required macroeconomic settlement inputs are not supplied by the Business read contract. |
| Product review | `POST /games/:gameId/business-products/:productKey/review` | Not surfaced. No merged Business Admin product directory/detail read contract supports a coherent review workflow. |
| Accounts / materials / inventory / warehouse / production / COGS / sales / employees | No merged Business Admin read contract for these relationships | Omitted. V2 does not query database tables directly or construct a parallel economic model. |

Fields not returned by the merged Business directory are treated as unavailable and are never inferred.

## Owner privacy boundary

Merged `main` returns `owner_player_id` in the Business directory but does not return a privacy-safe owner presentation DTO.

Business V2 therefore does not use `owner_player_id` for display, search, data attributes, links, or accessible text. The current V2 normalizer does not map that internal field into the Business read model. Because no safe owner projection exists on merged `main`, owner presentation renders as **Owner unavailable**.

This branch does not perform a second Player lookup, expose a private Player UUID, or introduce a replacement ownership model. A safe owner display projection must be provided by a separately authorized backend contract if owner names are required later.

## Backend security-contract blocker

The merged Admin security guard maps singular resource `business` to `business.manage`, while the live Business paths use plural `businesses`.

As a result on current `main`:

- `GET /games/:gameId/businesses` falls back to `game.read` instead of `business.manage`;
- Business mutations under `/games/:gameId/businesses/**` fall back to `game.update` instead of `business.manage`;
- the rate-limit resource classifier does not recognize plural `businesses` and degrades to `unknown`.

Business V2 remains locally gated by `business.manage`, but the server-side policy mismatch is a separate backend security-contract blocker. PR #520 does **not** change `adminSecurityGuard.ts` to fix it.

## Scope correction

The following backend changes previously introduced by PR #520 were reverted to exact `main` and are no longer part of the PR diff:

- `backend/supabase/functions/admin-api/adminSecurityGuard.ts`;
- `backend/supabase/functions/admin-api/businessBankingOperations.ts`.

The PR-only backend test was removed:

- `backend/supabase/functions/admin-api/businessAdminV2Contract.test.ts`.

The remaining source changes are Admin V2 route/shell wiring, route-scoped styling, UI-focused tests, and documentation only.

## PR #503 dependency

PR #503 (`feat(economy): canonical economic asset ownership core v2`) remains the canonical convergence authority across Store → Inventory → Crafting → Business → Marketplace. It owns the future Business material-flow, warehouse, production, finished-goods, COGS, and canonical economic-asset ownership semantics.

PR #520 must not merge until Business assumptions are reconciled against #503. This branch must not copy or pre-merge #503's unmerged economic model.

## V2 route ownership

| Path | Responsibility |
|---|---|
| `admin/v2/src/routes/business/BusinessApi.js` | Exact current Business BFF paths, request validation, cancellation, safe error normalization, and compliance idempotency transport. |
| `admin/v2/src/routes/business/BusinessController.js` | V2 data-state lifecycle, current-contract normalization, UUID-safe presentation, filters, mutation retry identity, and teardown. |
| `admin/v2/src/routes/business/BusinessRoute.js` | Business summary, directory, detail drawer, compliance dialog, and responsive state presentation. |
| `admin/v2/styles/routes/business.css` | Route-scoped responsive layout and visual states. |

`BusinessApi.js` receives the same same-origin `createAdminBffTransport(...)` instance as the other source-owned V2 routes. It does not call Supabase directly and does not create a second backend contract.

## Presentation rules

- Public `biz_<32 hex>` Business keys may be displayed because they are the authoritative public identifiers required by current mutations.
- Private Player UUIDs are not mapped into the V2 read model or UI.
- Owner presentation is unavailable until an authoritative safe DTO exists.
- Financial values remain denominated in each row's supplied currency; values are not aggregated across currencies.
- Signed profit is preserved.
- Missing or unsupported fields remain unavailable rather than inferred.
- Accounts, materials, inventory, warehouse, production, COGS, and transactions remain absent until merged Business Admin contracts expose them.
- Loading, ready, refreshing, stale, empty, failed/retry, and permission-denied behavior uses the existing V2 state system.

## Verification

Focused UI verification covers exact current-main Business read/mutation paths, 0/1/many businesses, Korean and long names, signed profit, UUID suppression from the normalized read model, owner-unavailable behavior, local `business.manage` fail-closed behavior, stale-data recovery, compliance idempotency/retry behavior, and existing V2 route regressions.

The plural server permission mapping and PR #503 reconciliation remain merge blockers outside this UI-scoped correction.
