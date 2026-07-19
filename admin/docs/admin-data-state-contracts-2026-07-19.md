# Admin data-state contracts

**Roadmap item:** `BETA-ADMIN-006`  
**Branch:** `agent/admin-data-state-contracts-v1`  
**Status:** `IN_PROGRESS`  
**Visual boundary:** preserve the accepted Admin v606 shell and shape-accurate skeleton geometry

## Canonical states

Every page-level Admin read resolves to one of six explicit states:

| State | Meaning | Rendering contract |
|---|---|---|
| `loading` | No settled response exists and a page read is pending. | Keep the existing shape-accurate skeleton; mark the active main surface `aria-busy="true"`. |
| `loaded` | A non-empty response committed successfully. | Hide transient status UI and render the authoritative page normally. |
| `refreshing` | A settled response exists and a background read is pending. | Keep current valid data visible; use the subtle refresh indicator; do not cover the page with a skeleton. |
| `stale` | A refresh failed after a settled response existed. | Preserve the last valid data and show a persistent warning that it may be out of date. |
| `empty` | A successful settled response contains no records for the active route. | Preserve the route shell and expose an explicit, non-error empty status. |
| `failed` | No settled response exists and the read failed or was cancelled. | Remove busy state and expose a persistent page-level alert. |

## Lifecycle authority

`admin/data-state-contracts.js` listens only to the existing explicit `econovaria:admin-request-lifecycle` event. It does not intercept transport or observe arbitrary DOM changes.

- `pageRead: true`, `phase: started` begins `loading` or `refreshing` according to whether the route has a settled response.
- `phase: committed` resolves to `loaded` or `empty` using explicit lifecycle metadata first and the normalized current model second.
- `phase: failed` or `cancelled` resolves to `stale` when prior data exists and `failed` otherwise.
- Concurrent reads remain pending until the route's final request settles.
- Route state is retained independently and reapplied when that route mounts again.

The active main surface exposes:

- `data-admin-data-state`;
- `data-admin-data-route`;
- `data-admin-data-state-updated-at`;
- `aria-busy` only while `loading` or `refreshing`.

Every transition dispatches `econovaria:admin-data-state-changed` with the route, current state, previous state, settled flag, request ID, message, and timestamp.

## Accessibility and visual behavior

- Existing data remains visible during `refreshing` and `stale`.
- Initial loading continues to use the accepted shape-accurate skeletons rather than a new generic loader.
- `stale`, `empty`, and `failed` use a fixed status surface that does not alter accepted page geometry.
- `failed` uses `role="alert"`; other persistent states use a polite status region.
- No pointer interaction is required for state changes.

## Architecture boundaries

This tranche introduces no:

- `MutationObserver`;
- global `window.fetch` assignment;
- inline style mutation;
- accepted v606 shell movement;
- Backend, database, Auth, Player Terminal, or deployment change.

## Verification boundary

`scripts/admin-data-state-contracts-smoke.mjs` must prove:

1. all six canonical source contracts;
2. initial `loading` and committed `loaded`;
3. background `refreshing` without hiding current data or exposing the page skeleton;
4. failed refresh to `stale` while preserving data;
5. explicit successful `empty`;
6. first-load `failed` with an alert;
7. state-change events, `aria-busy`, and zero pointer input;
8. permanent workflow registration and architecture guards.

`BETA-ADMIN-006` remains incomplete until the exact synchronized PR head passes Repository Quality and the full Admin Shell workflow and the immutable merge evidence is recorded.