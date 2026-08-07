# Admin UI V2 Business evidence

Branch: `refactor/admin-ui-v2-business-v1`
Reconciled main: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
Disposition: draft PR only; not merged; not promoted.
Stop status: `BUSINESS_SCOPE_CORRECTED_WAITING_FOR_503`.

## Scope-correction result

PR #520 has been corrected back to an Admin UI V2 migration boundary. The backend changes previously introduced solely to support this UI were reverted to exact `main`, and the PR-only backend contract test was removed.

Backend files removed from the PR diff:

- `backend/supabase/functions/admin-api/adminSecurityGuard.ts`;
- `backend/supabase/functions/admin-api/businessBankingOperations.ts`;
- `backend/supabase/functions/admin-api/businessAdminV2Contract.test.ts`.

No Crafting, Inventory, Store, Marketplace, warehouse, material-flow, production, COGS, or canonical economic-asset implementation is owned by this branch.

## Current merged Business contract

The Business V2 route uses only current merged Admin/BFF capabilities:

- `GET /games/:gameId/businesses`;
- `POST /games/:gameId/businesses/:businessKey/compliance` backed by `set_business_compliance_v1`.

The merged directory supplies Business public identity, `owner_player_id`, legal/entity/industry/country/currency fields, status, capitalization, revenue/expense/profit totals, valuation, reputation, failure count, and `updated_at`.

The UI does not treat `owner_player_id` as presentable data. The normalized V2 model drops that field because merged `main` provides no privacy-safe owner presentation DTO. Owner therefore renders as **Owner unavailable**. The UI does not perform a Player lookup to reconstruct an owner name.

Business-cycle settlement remains omitted because the current read contract does not provide the required economic settlement inputs. Business product review remains omitted because there is no merged Business Admin product read workflow. Accounts, materials, inventory, warehouse, production, COGS, transactions, sales, and employee views remain absent because no merged Business Admin read contract exposes them.

## Remaining backend blocker — plural Business permission mapping

Current merged `adminSecurityGuard.ts` recognizes singular resource `business`, but the live routes use plural `businesses`.

Observed current-main policy behavior:

- `GET /games/:gameId/businesses` resolves to fallback `game.read`, not `business.manage`;
- `/games/:gameId/businesses/**` mutations resolve to fallback `game.update`, not `business.manage`;
- plural `businesses` is not an Admin rate-limit resource and therefore classifies as `unknown`.

PR #520 no longer fixes this. It is a separate backend security-contract correction that requires explicit authorization before Business convergence. The V2 route itself remains locally gated by `business.manage`.

## PR #503 dependency

PR #503 remains the canonical economic-asset ownership authority across Store → Inventory → Crafting → Business → Marketplace. Its Business BOM/material/warehouse/production/finished-goods/COGS convergence is not copied into this PR.

Final Business merge requires reconciliation against #503 after its contract is stable enough to determine the authoritative Business ownership/material/production projection.

## Targeted UI test inventory

- `scripts/admin-v2-business-api.test.mjs`
  - exact current-main Business BFF read and compliance mutation paths;
  - safe error envelopes;
  - 0/1/many Business normalization;
  - Korean/long names and signed profit;
  - raw `owner_player_id` is not mapped into the normalized V2 read model;
  - owner presentation is unavailable without a safe DTO;
  - local `business.manage` fail-closed behavior;
  - ready → stale refresh lifecycle;
  - compliance idempotency reuse after retryable failure;
  - unsupported settlement/inventory methods remain absent from the Business V2 API adapter.

## Review matrix

Review should verify empty, one, and many Business rows; active/restructuring/distressed/closed presentation; Korean and long Business names; owner-unavailable behavior; search/status/country filters; detail drawer behavior; compliance validation/success/retryable failure; permission denial; narrow and desktop viewports; and Overview/Store/Market V2 regressions.

CI and PR check results on the corrected head remain the execution source of truth. Known repository-wide legacy scroll/architecture failures are not owned or modified by this Business UI branch.
