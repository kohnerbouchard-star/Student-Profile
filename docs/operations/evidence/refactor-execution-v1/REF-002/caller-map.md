# REF-002 — Route and entrypoint evidence checkpoint

Status: **IN_PROGRESS**. Source: `7569a829905ec5104e5b98c3e29e8dd24b158c0f`; source tree: `a45d4b883b7c6396ce398c7eca418d4f7935fe8f`. Continuation date: 2026-09-22. REF-003 is not started.

This checkpoint publishes the previously local mapping and adds directly inspected browser callers, credential-event consumers, the Player-creation RPC, and the Attendance save lifecycle. It does not certify a complete application-wide route census or approve deletion. The task specification and acceptance conditions are unchanged.

## Evidence and coverage

[Routes](routes.json) records 23 distinct HTTP method/path cases using shared behavior profiles without collapsing aliases. [Entrypoints](entrypoints.json) records 57 immutable source references: 48 inherited from the supplied handoff at this same main and nine newly inspected source files. The generated bundle is separately recorded as metadata-only, not a fully read source. Each reference is an observed Git blob identity; this is not a claim that a complete checkout was locally hash-verified. Resolve a source link as `https://github.com/kohnerbouchard-star/Student-Profile/blob/<sourceMainSha>/<path>`.

The existing Admin visible-route manifest, Edge manifest and deployment configuration remain authoritative inputs. These new JSON files are **evidence only**, never runtime registries. A path-disposition manifest does not prove a method-specific authorization or complete call graph.

## Newly resolved source questions

### Admin V2 really uses the retained Contract boundary

`admin/v2/src/api/contracts-api-client.js` (`a6e98e14...`) proves that `readContractDetail` requests `/contracts/:contractId/progress` and `/submissions` concurrently. `reviewProgress` posts to `/progress/:progressId/review`; `issueRewards` posts separately to `/progress/:progressId/rewards/issue`. It does not route these operations through the old submission-decision alias.

The client aborts replaced list/detail reads, unlinks abort listeners in `finally`, and deduplicates identical in-flight mutations by idempotency key plus fingerprint. A reused key with a different fingerprint rejects. These are real client behaviors to preserve, not proof of a server-side replay cache. The complete route-controller mount/dispose graph remains outside the verified portion.

### The reset bridge also supports Player creation

`createPlayerForAuthorizedStaff.ts` (`05d6a7c6...`) calls **`admin_create_player_v1`** through `executeAdminMutationRpc`. It hashes the normalized supplied Access Code and binds the normalized creation payload, idempotency key and request ID. Its result contains the committed Player and the normalized readable code for immediate presentation.

The retained `player-access-code-bridge.js` emits `econovaria:player-access-code-issued` after creation as well as certain identity updates. Two directly inspected consumers matter:

- `player-create-lifecycle.js` (`1f0eba13...`) closes the creation dialog. It also observes added forms and installs capture-phase validation wiring; no whole-module disposer is exposed.
- `player-create-ux.js` (`070a1135...`) consumes the saved creation context once and schedules the one-time credential confirmation. The confirmation has close/destroy and focus handling, but the module's top-level observer and event listeners have no full-module disposal. Blank creation fields are currently generated with browser crypto before server hashing; this audit does not authorize changing that policy.

Therefore **REF-013 cannot make the entire bridge deletable simply by moving its reset call**. Creation events, confirmation, form lifecycle and any remaining generated-bundle consumers must be accounted for before REF-015.

### Attendance-only save is not the combined-save path

`attendance-reward-save-controller-v3.js` (`bd8a1016...`) captures its delegated fetch after the bootstrap loads the Attendance bridge. An Attendance-only save performs a verification **GET, then one PATCH** to the game's Settings route. It reuses a payload-bound mutation key until success, keeps one in-flight save, and rejects stale-generation UI updates after game/context changes. That does not prove the old network request was cancelled before writing.

A save with core Settings edits lets the original click continue so the existing core save is augmented by the bridge. It must not be replaced with a second independent Settings mutation. The controller owns input/change, context-changed, saved and capture-click listeners. The reviewed source exposes helpers, not a whole-controller disposer.

`settings-save-error-bridge.js` remains a DOM observer/error-state reconciler, **not a fetch interceptor**. Removing it safely requires moving its error and refresh behavior into an explicit lifecycle, not merely replacing a transport call.

## Preserved earlier findings

The complete method table and terminal boundaries are in `routes.json`.

| Family | Actual source behavior | Consequence |
| --- | --- | --- |
| Contract progress | Admin forwards GET to Classroom's Staff handler/repository. The constructed forwarding path omits the original query. | REF-007 needs a local read adapter with current DTO/error/query behavior characterized. A query-preservation fix is a separate behavior change. |
| Submission decision | POST/PATCH resolve the submission's contract, forward review as POST, then invoke local rewards after successful approval. Current permission falls back to `game.update`. | Keep distinct from the review-only aliases; do not claim the complete review-plus-reward sequence is atomic. |
| Submission/progress review | Review-only aliases use `contracts.manage`; no automatic reward step. | REF-008 must preserve the alias-specific policy/effects or obtain separately reviewed correction scope. |
| Reward issue | `proxyClassroom` intercepts locally and calls `issue_contract_rewards_atomic_v1`. | REF-009 removes misleading adapter coupling, not a network hop or economic authority. Never substitute the older reward-then-mark implementation. |
| Access-code reset | Still forwards to the Staff-authenticated Player handler. Code replacement uses `set_player_identity_and_access_credential_v2`; identifier-only updates are separate. | Preserve session-revocation differences. Forwarded request identity is not proof of idempotent credential replay. The legacy fallback's unsupported `reason` field remains a recorded defect, not silently fixed. |
| Player Messaging | Player imports the dispatcher from the Classroom source directory; it does not send Messaging HTTP requests to Classroom. | REF-006 moves source ownership once. Keep public thread IDs, scoped RPCs, parser/limiter order and applied/replayed responses. The threadless read path remains a recognized rejection, not a mark-all-read feature. |
| Settings | Already uses the local application/repository and `admin_update_game_settings_v1`. | REF-012/014 are browser-lifecycle work, not another backend migration. |

Admin identifiers in the inspected handlers are decoded and scoped internal IDs. Do not claim that all Admin URLs are already UUID-free. Player public identifiers remain a separate boundary. Likewise, names such as `legacy`, `fallback`, `proxy` or `recovery` establish neither inactivity nor deletion eligibility.

## Loading and configuration findings

The reviewed Vercel configuration sends `/admin` and `/admin/` to V2, while the source build still includes the retained `admin/index.html` and its `dist` assets. The retained HTML loads the access-code bridge directly; `admin-bootstrap.js` loads the Attendance/Settings families through serial `import(modulePath)` calls. A zero-static-import result would miss those live source loading paths. Hosted old-client use remains unknown.

The neutral and Classroom Deno configs both enable strict checking; Admin explicitly relaxes strictness. REF-011 must preserve effective options, frozen lock resolution, test sets and permissions. Tests intentionally reading Classroom/Staff composition roots are not equivalent to unrelated tests borrowing Classroom's compiler config. No config or test was changed.

The Edge manifest distinguishes canonical functions, required Classroom compatibility, source-only Staff, temporary staging and retired functions. These are repository declarations, not a fresh cloud inventory. Externally invoked workers cannot be declared dead because a browser/import search finds no caller.

## Exact remaining acceptance work

**MAP-01 — Generated caller/build closure.** The retained bundle's observed blob is `03cf8d402136502688994e6cce670b9701f8f74f`, but a complete readable copy was not obtained. Resolve its action table, selected event subscribers and source/build provenance in an authorized checkout or a source-matched existing audit artifact. This blocks unsupported claims about all selected shim consumers and any deletion. Do not edit the bundle or its accepted hash.

**MAP-02 — Whole-application method/root census.** Reconcile the existing inventories with actual tracked files and per-method dispatch from every relevant browser, BFF, Edge and worker root. The 23-case table is not that census. Explicitly distinguish disabled/rejected methods and dynamic/external entrypoints. Missing full-census evidence remains an acceptance gap, not a reason to remove routes.

**MAP-03 — Review/publication acceptance.** Validate the final scoped evidence and applicable exact-head checks through the task's PR. Record an actual merge only after the remaining specification is satisfied. No prospective merge SHA or old CI result earns completion credit.

Missing authenticated production evidence remains a separate downstream runtime gate. It is **not** being used as a new prerequisite for this read-only mapping task.

## Reproducible next checks

These are instructions for the authorized complete checkout, **not commands executed in this continuation**:

```sh
git rev-parse HEAD HEAD^{tree}
git status --short
git ls-files > /tmp/ref002-tracked-paths.txt
node scripts/admin-bundle-contract-audit.mjs > /tmp/ref002-admin-bundle-audit.json
node scripts/admin-contract-review-source-audit.mjs
```

The existing bundle audit extracts explicit `actionContracts` and also emits `methodsNearby`. The latter is a proximity heuristic and must not be accepted as an authoritative method-to-route assignment. The review-source audit is bounded lexical context, not a reachability proof. Retain the raw exact-source reports and classify their results against the actual handlers; do not treat `routeCoverage.complete` as whole-app coverage.

The existing `Admin Bundle Contract Audit` workflow is a read-only audit/artifact path. Its source was inspected; it was not dispatched or edited. Attempts to read workflow collections/file resources that the connector rejected do not count as executed checks.

## Validation and safety

The local publication workspace contains documentation/data only. JSON parsing, distinct method/path keys, profile/source-reference resolution, source-hash formats, unchanged original 23 method/path identities, and whitespace are validated before publication. Those checks are not application tests or a fresh route extraction. Full checkout, build, Deno/backend suites, browser crawl, SQL verification and cloud/authenticated runtime probes remain NOT_RUN.

No application source, generated bundle, historical migration, SQL/RPC, workflow, dependency, secret, release request or cloud setting changes. No runtime is disabled; no file is deleted. Task status stays **IN_PROGRESS**. Stop here; REF-003 and later implementation tasks remain unstarted.
