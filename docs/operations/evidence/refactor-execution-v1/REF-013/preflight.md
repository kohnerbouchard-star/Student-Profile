# REF-013 — Player access-code UI convergence preflight

Observed: 2026-09-29.
Repository: `kohnerbouchard-star/Student-Profile`.
Base main: `8670bbc99ad0d825e6dac0a30aafc4fab5547295`.
Owner branch: `refactor/ref-013-player-access-code-ui`.
Task state: IN_PROGRESS. Dependency REF-010 is VERIFIED_COMPLETE.

## Authorization and stop boundary

The product owner requested "Start task 13" after REF-012 was verified and closed. This opens REF-013 only. It does not authorize REF-014, a production deployment, a live database mutation, credential rotation, authentication changes, generated Admin bundle edits, or retirement of unrelated Player/create compatibility code.

No existing REF-013 implementation branch or pull request was found in the inspected recent sequence before this owner branch was created from exact main `8670bbc99ad0d825e6dac0a30aafc4fab5547295`.

The eight-meaningful-file task budget remains unchanged. This start tranche records ownership and behavior boundaries only; it makes no runtime-source change.

## Verified live consumer and ownership

The legacy access-code bridge still has a live retained-page consumer and therefore is not a dead-code candidate for whole-file deletion in this task.

The retained flow is:

`admin/player-identity-wiring.js`
→ `window.EconovariaPlayerAccessCodeBridge.updatePlayerIdentity(...)`
→ `POST /api/admin/games/:gameId/players/:playerId/access-code/reset`.

The caller supplies the selected game, immutable Player UUID as the request resource key, public Player ID / RFID value, optional replacement Access Code, and display name used only for UI/event presentation. Blank Access Code currently means identifier-only update; REF-013 must not turn that into browser-side credential generation.

The same `admin/player-access-code-bridge.js` also owns separate Player-creation compatibility behavior: it wraps the create-Player request path, observes the create response, may perform the historical create follow-up reset when the create response omitted a code, and emits `econovaria:player-access-code-issued` for the existing one-time creation confirmation consumers. Those create responsibilities are adjacent protected behavior. Converging the existing-player reset path is not evidence that the complete bridge can be retired.

`admin/player-create-lifecycle.js` and `admin/player-create-ux.js` still consume the one-time credential event. Their behavior is outside this task except for regression verification.

The raw retained `admin/index.html` loads the bridge. The build pipeline's default Admin output is separately canonicalized to Admin V2, so copied-but-unloaded production assets are not enough to claim a quiet window. Historical/direct retained-page consumers remain a REF-015 retirement concern, not a REF-013 deletion assumption.

## Canonical authenticated transport

`admin/auth-session-manager.js` remains the retained session-state owner. The explicit same-origin Admin request transport is exposed by `admin/admin-auth.js` as `window.EconovariaAdminAuth.request`.

That transport already owns session refresh, selected-game binding, cookie-bound CSRF, device and game headers, Admin BFF URL translation, `credentials: "include"`, no-store behavior, safe network failure mapping, and session-expiry handling. REF-012's explicit Attendance adapter already consumes this same transport seam instead of inventing another global request owner.

Admin V2 has its own scoped client for `/players/:playerId/access-code/reset`; that is corroborating route evidence, not permission to rewrite the retained Player surface into V2 during REF-013.

The REF-013 reset adapter/controller should therefore call the retained explicit authenticated transport rather than capture or replace `window.fetch`. No new global fetch patch is permitted.

## Initial tranche and protected behavior

This start tranche is intentionally documentation-only:

1. mark REF-013 IN_PROGRESS;
2. record this exact base and owner branch;
3. preserve the live-consumer and canonical-transport map;
4. identify the stale-response and lifecycle conditions that the implementation must prove before the existing bridge seam is altered.

No runtime source, test assertion, workflow, package, database, SQL/RPC, authentication, credential authority, generated bundle, cloud configuration, or deployment state is changed by this start.

The bridge's current create-Player interception is not removed in this tranche because its creation responsibilities are independently live and protected. The implementation must first separate existing-player reset ownership without changing create semantics.

## Required implementation shape

The smallest expected source change is an explicit reset owner such as `admin/player-access-code-reset-controller.js`, because no current module owns only the existing-player reset lifecycle.

The implementation must preserve these boundaries:

- accept the selected game and Player UUID only from the already-selected UI context;
- preserve public Player ID / RFID mapping and optional Access Code semantics;
- call `window.EconovariaAdminAuth.request` for the REF-010 reset endpoint;
- preserve server request identity and do not synthesize browser replay/idempotency semantics;
- never log a returned Access Code and never persist it in localStorage, sessionStorage, IndexedDB, URL state, or other durable browser storage;
- preserve the existing one-time-display contract when a replacement code is returned;
- preserve current busy/disabled/error behavior and restore focus to the correct retained UI context;
- snapshot game, Player and request generation before the mutation and reject late success/error UI updates when the selected game or Player context has changed;
- ensure close/reopen/remount cannot create duplicate reset listeners or duplicate writes;
- expose an explicit disposer for any controller-owned event/listener registration; prefer direct invocation over a new document-global interception layer;
- leave the create-Player bridge responsibilities intact unless separate evidence within the task proves a safe extraction;
- do not modify `admin/dist/**` or any generated Admin bundle.

## Characterization and acceptance plan

The implementation tranche must add or extend browser/source coverage for at least:

- one confirmed reset action → exactly one reset request;
- cancellation → zero reset requests;
- identifier-only update → no `accessCode` field and no rotation;
- credential update → exact supplied public identifier/code contract;
- wrong-game, permission-denied and safe service-failure behavior;
- closing and reopening the Player UI without duplicate listeners/writes;
- switching selected game while a reset is in flight;
- a late response from the old game not mutating, acknowledging, or focusing the new game's UI;
- one-time credential exposure only when the server returns a replacement code;
- unchanged create-Player one-time confirmation and fallback behavior;
- unchanged global fetch identity from the new reset controller.

Required shared verification remains the task-defined reset/browser cases, `npm run test:admin-v2`, `test:auth-boundaries`, `test:web-session-release`, asset/interaction checks and architecture ratchets. Exact-head CI results must be recorded before completion; queued, skipped or not-run checks are not passes.

## Rollback rule

If the reset flow proves dependent on an unreviewed authentication incident, generated-only source, or a protected create-player behavior that cannot be separated within the eight-file budget, stop and retain this evidence rather than widening scope. Roll back only the reset adapter/controller and its listener wiring. Never restore or rotate real credentials or user sessions as part of REF-013 qualification.

Stop before REF-014.
