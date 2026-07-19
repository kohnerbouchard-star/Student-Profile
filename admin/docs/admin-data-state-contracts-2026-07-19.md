# Admin data-state contracts

**Roadmap item:** `BETA-ADMIN-006`  
**Implementation pull request:** `#231`, merged as `249fc53a23ad23058d376e4e394524af0bdee265`  
**Status:** `VERIFIED_COMPLETE`  
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

## Verified evidence

The synchronized implementation candidate was validated on exact head `c0f482914ec34352b924d8220cabb1c87a79a23b`, nine commits ahead and zero behind then-current `main`.

- Repository Quality #949 passed.
- Admin Shell Smoke #858 passed all 89 stages.
- The mounted six-state smoke passed `loading`, `loaded`, `refreshing`, `stale`, `empty`, and `failed` behavior.
- Background refresh and stale states preserved current rendered data.
- `aria-busy`, transition events, initial-failure alerts, explicit empty results, and zero pointer input passed.
- Retained artifact: `admin-browser-smoke-f871fa9ad768014963f85f3d832f0f93e43186c4`.
- Artifact digest: `sha256:390e9615b61296f156a151b18563d81305323073434eb6ebe68fb2c3da935830`.
- PR #231 was squash-merged into `main` as `249fc53a23ad23058d376e4e394524af0bdee265`.

## Completion boundary

`BETA-ADMIN-006` is `VERIFIED_COMPLETE` at the merged repository boundary. Connected isolated-staging verification remains separately owned by `BETA-ADMIN-007`; this item does not claim a staging or production deployment.