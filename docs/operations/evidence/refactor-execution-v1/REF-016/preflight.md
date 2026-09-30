# REF-016 — Messaging adoption of the existing Players public boundary

Status: IN_PROGRESS. Repository-only scope; no production authorization.
Base main: `b4f803fb3957ee7ad33bab2c0a8eea53952bb231`; tree `7a851e1d5131d3a71dd654f2825e145fabaee5bc`.
Owner branch: `refactor/ref-016-messaging-players-public-boundary`.

## Authority and ownership preflight

The owner explicitly approved continuing to Task 16 after the bounded Task 15 review. PR #765 is merged, but REF-015 remains BLOCKED with all removal gates intact. REF-016's declared dependency is REF-006, which is VERIFIED_COMPLETE; no dependency is waived and Task 17 is not started.

No existing REF-016 owner branch or open PR was found. PR #668 remains open at `faaf908bdd5131b451c7e87e91ed4991ad8f839d`, owning Staff/Admin multi-game context and the global ledger. PR #736 remains open at `8070f58d4145951d8aee3e74a2b1e00d90c54385`, owning the Player runtime service-role binding. Their complete changed-file lists do not include the four selected Messaging source files, the selected Messaging route test or the unchanged Players public index/implementations. Generated architecture inventory is the only proposed shared file; regenerate it from this branch, without donor patches. Do not touch the backend package, Player runtime entrypoint, Staff/Admin context, global beta ledger, or either PR.

This is existing-public-export adoption, not a new ARCH-100 propagation tranche. The current Messaging handlers resolve their request scope inside the same existing handler; this task must not invent a new dispatcher context parameter or claim broader frozen-context propagation is implemented. Preserve all existing context construction/reference behavior by leaving those implementations and call sites byte-identical.

## Exact scope locked before editing

Four runtime files, import declarations only:

- `backend/src/domains/messaging/api/playerMessagingHttpHandler.ts`
- `backend/src/domains/messaging/api/playerMessageThreadLifecycleHttpHandler.ts`
- `backend/src/domains/messaging/api/playerMessagingRoutePaths.ts`
- `backend/src/domains/messaging/api/playerMessageThreadLifecycleRoutePaths.ts`

Six current deep value-import declarations resolve three already-public functions: `resolvePlayerRequestScope`, `resolveActivePlayerSession`, and `readPlayerApiRouteSegments`. Replace these with named imports from `../../players/index.ts`, combining each handler's two declarations. No type-only import, alias, function body, parameter, call order, request/response, RPC, timeout, rate-limit, identity or transaction changes.

The fifth runtime/test path is the existing `backend/src/domains/messaging/api/playerMessagingRoutePaths.test.ts`: add bounded coverage of both route families across the already-supported bare, Player and retained Classroom prefixes, plus spoofed namespace denial. Preserve every existing assertion. It is already registered in `test:player-messaging`; no package or test-framework change is needed.

The remaining meaningful paths are this preflight, `docs/roadmaps/refactor-execution-v1/tasks/REF-016.md`, and only REF-016 in `docs/roadmaps/refactor-execution-v1/backlog.json`: eight meaningful paths total. Generated `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` is tracked separately. If the existing cross-cutting guard requires it, add only a PR-bound exact-path manifest under `docs/operations/contracts/player-cross-cutting/`; keep the verifier and all release denials unchanged. No additional source/test/workflow path is authorized by this record.

Protected: Players index and implementation modules, dispatcher, Player/Staff/Admin authentication, service clients, public identifiers, context factories, database/migrations/RPCs, all business/economic behavior, UI, dependencies, existing workflow conditions, secrets and production configuration.

## Characterization and qualification plan

The source archive was independently tree-verified against merged REF-014. All changes from that runtime tree through this base are the separately reviewed REF-014/015 documentation/data changes. Local application/build/test/policy sources therefore match this base; this is not a claim of a full GitHub checkout or a native Deno run.

Baseline supplementary Node 22.16.0 execution of the existing four Messaging API test files, Player request-scope tests and Messaging rate-limit dispatch tests passed 45 cases using Node's experimental TypeScript transformation and an external disposable Deno-test adapter. The adapter is outside the repository and does not read production configuration. An earlier strip-only attempt rejected an existing TypeScript parameter property; it is not counted as a pass. Native pinned Node/Deno CI remains required.

Before publishing source: verify four non-import bodies unchanged, exact public export resolution, no new static runtime import cycle or unintended initialization, and the six-to-zero Messaging deep-import delta. Regenerate the existing inventory; never raise ceilings. Run the expanded local cases, Player `messaging-connected`, architecture/high-priority/legacy/security/diff checks. Existing CI must run native `test:player-request-scope`, `test:player-security`, `test:player-messaging`, `typecheck:all` and backend smoke, plus Player verification and applicable repository gates. Inspect actual diagnostic logs as well as workflow conclusions.

Missing or failed native checks remain NOT_RUN/BLOCKED; local transformation is supplementary only. A draft or green preview is not merged completion or production certification. Rollback is a normal revert of these imports and matched tests/evidence, preserving later auth fixes. Stop before expanding scope or starting REF-017.

## Bounded publication children — declared before tooling edits

The local environment cannot reach GitHub or supply a file-backed Git blob through the connector. To publish the 146 KB deterministic inventory without manually retyping unrelated generated evidence, split the work into REF-016a (the five already-declared source/test paths) and REF-016b (bounded qualification/publication and the three documentation/data paths). The parent remains incomplete until both children and exact-head acceptance close. This supersedes the initial no-additional-workflow statement only for the temporary helper below; all existing test/release workflows and their conditions remain protected.

REF-016b may temporarily add `.github/workflows/ref-016-inventory-materialization.yml` on PR766 only. It must check the same-repository PR/branch, use pinned Node, verify exact source/test/generator blob identities, regenerate the existing inventory and require its expected blob identity. Its write token may create only that unreferenced Git blob through the GitHub API; the helper contains no commit/ref/merge/deploy API or production credentials. It must not commit automatically, modify a source file, waive a check or change a threshold. The connector will attach the proven blob to the normal reviewed commit.

Remove the helper before final qualification/merge. It is temporary publication tooling, not persistent application infrastructure. The final PR diff retains eight meaningful paths plus generated inventory and exact verification manifest; each child remains below the eight-meaningful-path ceiling. Record the helper run/blob and its removal, then qualify the final head with the unchanged existing workflows. Initial materialization-head checks are not substituted for final-head acceptance. No Task 17 or production action is included.
