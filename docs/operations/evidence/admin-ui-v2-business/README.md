# Admin UI V2 Business evidence

Branch: `refactor/admin-ui-v2-business-v1`
Reconciled main: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
Disposition: draft PR only; not merged; not promoted.
Final merge dependency: reconcile Business contracts against PR #503 if #503 remains unmerged or changes the canonical Business ownership/material-flow surface.

## Contract audit result

The authoritative Business Admin surface on reconciled `main` consists of the Business directory, compliance mutation, business-cycle settlement, and a separate Business-product review mutation. The V2 page uses the directory and compliance mutation only. Settlement is intentionally withheld because its required macroeconomic inputs are not provided by the Business read contract. Business-product review is withheld because no Business Admin product list/detail read contract supports a coherent review workflow.

The current merged Player Business ownership model has one canonical `owner_player_id`. Multi-player ownership is therefore **not supported by the current merged ownership contract** and is not simulated in this UI. Canonical inventory/product/production tables are left untouched and are not queried around the Admin API.

PR #503 owns the canonical economic-asset convergence across Store → Inventory → Crafting → Business → Marketplace and remains open/draft at the time of this evidence update. This branch does not copy or pre-merge PR #503's warehouse, materials, finished-goods, COGS, or ownership model. Accounts/material/production views remain absent unless a current merged Business Admin contract exposes them authoritatively.

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

## Main reconciliation

The branch was reconciled with `main` at `4c17b942fcf4b2a6f60b629549f192d066053ba4`. The upstream delta since the original Business base contained only:

- `player-terminal/src/app.js`;
- `player-terminal/src/core/capability-controls.js`;
- `player-terminal/src/core/route-renderer.js`.

Those files do not overlap the Admin Business implementation.

## Required review/runtime matrix

Review should verify at minimum: empty, one, and many businesses; active/restructuring/distressed/closed status presentation; long Korean business and Player names; missing optional owner/operating values; search/status/country filters; detail drawer keyboard/focus behavior; compliance validation, success, retryable failure, and permission denial; narrow and desktop viewports; no horizontal document overflow; and Overview/Store/Market route regressions.

CI and PR check results are the source of truth for automated execution on this branch. This evidence file does not claim a browser or production result that has not run.
