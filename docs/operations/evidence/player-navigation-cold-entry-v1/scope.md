# Player cold-entry and filtered-read corrections

## Proposed scope intake

- Item: `PLAYER-NAVIGATION-COLD-ENTRY-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, local preparation only.
- Owner: `fix/player-navigation-cold-entry-20261114`.
- Audited/fetched main: `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`.
- Global roadmap ownership remains with PR #668; this focused record proposes intake without modifying that ledger.
- Source ownership checked through live GitHub open-PR search and changed-file inventories for #620, #624, #668, #731, #735, #933, #938, #965, #966 and #967. No overlap with the seven changed existing source/manifest paths. Retained remote Player branches were inspected; no active branch owns this correction.
- Preserve merged Player lifecycle, interaction and read-model refactors. PR #966 owns session-status repair. Dashboard Arrival/readiness is a separate tranche.

## Reproduced defects and bounded correction

1. News cold entry loaded only News. Countries/Market appeared only after another route visited them. Add both as optional route dependencies, leaving authoritative News required and optional-service failure nonfatal.
2. News normalization dropped a ticker relationship when News finished before Market. Retain the public ticker on ticker-scoped stories and resolve the related asset from the current Market model at render time, regardless of completion order. Existing public asset IDs remain unchanged; rendered controls use the actual asset ID.
3. Selecting an empty News category displayed an unrelated story in its detail panel. Select strictly within the filtered list and render an empty detail state when no story matches. Switching back restores the first matching story.
4. Loans business-facility application required a prior Business visit. Add Business as an optional Loans dependency, retaining the existing server-provided business key and application eligibility checks. No economic mutation behavior changes.
5. Messages adapter dropped inbox/search continuation cursors and thread message limits. Forward only the supported query parameters through URLSearchParams. Search query and cursor remain together.
6. Standalone Player API clients reused cache/in-flight responses across different GET filters because only freshness-coordinated clients included payload/params in their keys. Canonicalize nested key ordering using the existing stable-value helper for both modes, retaining unchanged no-query key format. Equal filtered requests still coalesce; different queries/cursors do not. Session retirement, request generation, abort, mutation/idempotency and authorization behavior are untouched.

Messages currently has no active search/pagination controls. This tranche repairs its existing transport/cache contract, not a new Messages product UI.

## Files and verification

Runtime: `player-terminal/src/api/{resource-plan,country-news-read-model,messaging-backend-routes,request-context,player-api}.js` and `player-terminal/src/pages/news-page.js`.

Regression suite: `player-terminal/tests/navigation-cold-entry.mjs`, registered in `player-terminal/package.json` and the full Player verify chain. Two browser cases in `tests/browser/player-navigation-cold-entry.spec.mjs` are automatically included by the retained Player Terminal Verify workflow on desktop and mobile. They provide browser renderer coverage with synthetic click wiring: cold dependencies, enabled business application controls, and repeated empty/full category transitions without sending mutations. They do not replace full production-app Chromium end-to-end coverage.

Pinned Node 22.23.1/npm 10.9.8 and the available pinned Deno were used. Root and backend dependency directories were reused only after their package-lock hashes matched this checkout; no dependency files changed.

- Untouched main with the final regression file: 4 pass, 15 fail, 0 skipped/cancelled. Failures reproduce the defects; all deferred requests are settled, without post-test rejection noise.
- Candidate focused regressions: 19/19 pass, covering cold entry, optional errors, stale/empty selection, both ticker-read completion orders, query/cursor encoding, thread limits, response metadata, cache identity, in-flight coalescing, property-order equivalence, session isolation, and both actual freshness-coordinator/noncoordinator clients.
- Full `npm --prefix player-terminal run verify`: pass, including all retained lifecycle/interactions/invalidation tests and the unchanged Inventory no-query cache assertion.
- Full root `npm test`: pass.
- Backend core TypeScript: pass as the first stage of `typecheck:all`.
- Architecture inventory regeneration/check: pass with no inventory diff; 81 oversized sources and all other debt counts unchanged.
- Secret scan and whitespace checks: pass.
- Independent final source review: coordinator reported no actionable issue and independently reran all 19 focused regressions successfully, including the actual-coordinator cases and legacy no-query key preservation.

## Remaining qualification

- `typecheck:all` cannot pass locally: frozen Supabase SDK retrieval from `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` fails with connection refused. No lock, import or security workaround was made.
- Browser attempt stops before any browser assertion because the locked Player `@playwright/test` 1.59.1 package is not installed. The available root Playwright 1.65.0 is not substituted for the Player lock. Browser coverage is registered but not claimed executed.
- Backend smoke passes 1,160 Deno and 18 Node cases before stopping at the same frozen SDK connection refusal in the Game Sessions stage; later stages are not claimed passed.
- The isolated Player scope verifier flags this evidence document as a protected path. Exact-head hosted qualification, current-main reconciliation, actual-number cross-cutting authority and normal serial publication/merge remain the coordinator's next steps. This local record grants no completion or runtime-deployment credit.

No API, route, RPC, database, schema, economic policy, CSS, dependency, credential, permission, live data or production change. No production deployment is authorized or performed.
