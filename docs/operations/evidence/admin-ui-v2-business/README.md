# Admin UI V2 Business evidence

Branch: `refactor/admin-ui-v2-business-v1`
Accumulated base: `d7ee935a9832af3ffdc4138c4f6d02e4b0037eb8`
Reconciled implementation: `874d0d8da833d69696c673a058b4ca678b7c9c1e`
Accumulated-test alignment: `529d0bdb1c7d1e1d6697e4475ab8ecc0a79eb6b9`
Status: `BUSINESS_RECONCILED_FINAL_CI`.

## Final convergence result

Business V2 remains an Admin UI migration only. The earlier PR-owned backend redesign is not reintroduced. The branch is rebuilt additively on the accumulated Admin V2 shell after Inventory #508 and Crafting #510, preserving every previously merged route.

Resolved external gates:

- PR #503 canonical economic asset ownership is merged.
- PR #531 explicitly maps plural Admin `businesses` routes to `business.manage` and the bounded Business rate-limit family.
- Generic `game.read` / `game.update` no longer supply the Business route's authority.

## Authoritative Business contract

The route consumes only the merged Admin/BFF capabilities:

- `GET /games/:gameId/businesses`;
- `POST /games/:gameId/businesses/:businessKey/compliance`.

No Business settlement endpoint, product-review endpoint, raw canonical inventory-table access, warehouse reconstruction, employee reconstruction, or duplicate economic-asset model is added.

## Privacy boundary

The merged Business read includes `owner_player_id`, but the browser presentation model drops it. Because no privacy-safe owner presentation DTO is supplied by the authoritative Business contract, owner presentation remains **Owner unavailable**. Business V2 does not call `/players` to reconstruct an owner name and does not render ownership UUIDs in text, attributes, links, route state, or accessible labels.

## Canonical asset boundary

PR #503 remains the ownership authority for Store → Inventory → Crafting → Business → Marketplace. Business V2 does not duplicate BOM, material, warehouse, finished-goods, production, or COGS ownership state in browser code. Fields absent from the Admin Business projection remain unavailable rather than inferred from raw canonical tables.

## Verification

The reconciliation runner passed:

- `git diff --cached --check`;
- syntax checks for the accumulated `app.js` and all Business V2 route modules;
- `node --test scripts/admin-v2-business-api.test.mjs`.

The follow-up accumulated-test alignment runner passed:

- `node --test scripts/admin-v2-business-api.test.mjs`;
- `node --test scripts/admin-v2-unit.test.mjs`.

The accumulated V2 unit registry now marks Business as native, leaves only Marketplace planned, and the standard `test:admin-v2` command includes the Business contract suite.

Exact-head CI on the repository-owner evidence commit is the final merge gate.
