# Admin UI V2 Business evidence

Branch: `refactor/admin-ui-v2-business-v1`  
Base: `b7827211f0ff15b8a963219a63738180b33a1b3d`  
Disposition: draft PR only; not merged; not promoted.

## Contract audit result

The authoritative Business Admin surface on the recorded base consists of the Business directory, compliance mutation, business-cycle settlement, and a separate Business-product review mutation. The V2 page uses the directory and compliance mutation only. Settlement is intentionally withheld because its required macroeconomic inputs are not provided by the Business read contract. Business-product review is withheld because no Business Admin product list/detail read contract supports a coherent review workflow.

The current Player Business ownership model has one canonical `owner_player_id`. Multi-player ownership is therefore **not supported by the current ownership contract** and is not simulated in this UI. Canonical inventory/product/production tables are left untouched and are not queried around the Admin API.

## Privacy/authorization hardening

- `/games/:gameId/businesses/**` is explicitly mapped to `business.manage`.
- The rate-limit resource recognizes `businesses` instead of degrading to `unknown`.
- `owner_player_id` is used only server-side to resolve the game-scoped Player presentation and is removed from the Business DTO.
- The browser receives only owner display name, roster label, and Player status.
- No raw UUID is placed into Business presentation fields, data attributes, accessible text, or URLs.

## Targeted test inventory

- `backend/supabase/functions/admin-api/businessAdminV2Contract.test.ts`
  - plural Business permission mapping;
  - canonical Business rate-limit action;
  - owner UUID suppression and safe owner projection;
  - existing compliance RPC contract.
- `scripts/admin-v2-business-api.test.mjs`
  - exact Business BFF read/mutation paths;
  - safe error envelopes;
  - 0/1/many Business normalization;
  - Korean/long names and signed profit;
  - no UUID presentation leakage;
  - permission-denied fail-closed behavior;
  - ready → stale refresh lifecycle;
  - compliance idempotency reuse after retryable failure;
  - confirmation that unsupported settlement/inventory methods are absent.

## Required review/runtime matrix

Review should verify at minimum: empty, one, and many businesses; active/restructuring/distressed/closed status presentation; long Korean business and Player names; missing optional owner/operating values; search/status/country filters; detail drawer keyboard/focus behavior; compliance validation, success, retryable failure, and permission denial; narrow and desktop viewports; no horizontal document overflow; and Overview/Store/Market route regressions.

CI and PR check results are the source of truth for automated execution on this branch. This evidence file does not claim a browser or production result that has not run.
