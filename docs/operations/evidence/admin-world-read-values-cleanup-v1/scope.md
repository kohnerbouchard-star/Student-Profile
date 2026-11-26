# Admin World public read-value cleanup

Roadmap item: `ADMIN-WORLD-READ-VALUES-CLEANUP-001`.
Status: `IMPLEMENTED_NOT_MERGED`, local-only tranche. Exact fetched GitHub main:
`e6bf130c63e9940538dd46938f221f99b9ffba3f`. Independent owner:
`refactor/admin-dead-browser-cleanup-20261125`. No previous T061, Story,
Business, Banking or Market branch was used as a source base.

## Ownership and reachability audit

Current GitHub open PR audit found17 owners:1057 Contracts reward wording,
1056 Business Treasury,1055 Banking,1054 Market/News,1043 staging session
retirement,1041/1040/1039 dependencies,1038 Story fallback,1032 Messaging,
1009 Attendance reward reads,1006 baseline SQL lint,1005 FX,1004 Story retries,
1003 purger/login security,735 auth origin and731 database certification.
None owns this Admin World read-value boundary. The admin-api proxyClassroom,
its detached test oracle, rollback references and provider/workflow surfaces
are excluded. No database workflow, migration, provider or shared login code
is changed.

Installed runtime trace:

1. `scripts/build-vercel-runtime-config.mjs` copies the entire `admin` browser
   root (`BROWSER_ROOTS`) and canonicalizes built `admin/index.html` from
   `admin/v2.html`. Static copy does not make every private declaration callable.
2. `admin/v2.html` installs `admin/v2/src/main.js` as a module.
3. Main/app installs `app-controllers.js`; its World controller is statically
   imported and registered for the `world-management` navigation boundary.
4. `WorldManagementController.js` imports/re-exports the active
   `normalizeWorldManagementReadModel`; request completion calls that function.
5. The read model now statically imports its scalar/collection value validators
   from `WorldReadValues.js`; both source and built browser runs fetched it.

Audited installed HTML roots, module/dynamic-loading references, navigation,
legacy Admin bootstrap registrations, browser source-reader maps, build/copy
rules and retained tests. The deleted `safeSignedInteger` was an unexported,
module-local function with no invocation in its own lexical module. Repository
runtime/test searches found only that declaration before deletion. It was not
exported, reflected, dynamically selected, registered, copied as a separate
entrypoint or called by retained tests. It is removed outright with no alias,
wrapper, fallback or alternate implementation.

## Bounded responsibility extraction

`WorldManagementReadModel.js` was466 physical lines. It mixed scalar/public-value
normalization with aggregate panel projections. The latter remain the active
owner. Nine live functions move to the route-owned `WorldReadValues.js`:
record checks, UUID-safe text/token normalization, nonnegative safe integers,
booleans/timestamps/public IDs, currency codes and bounded frozen string arrays.
Their complete function bodies are byte-identical after removing only the new
`export` keyword. [Per-function body hashes](function-body-sha256.json) record
the audit. The UUID pattern is unchanged; no validation or default is weakened.

The read model is now413 lines; the value module is49. The extraction separates
a real trust-boundary responsibility rather than adding facade indirection or
splitting arbitrary blocks. Other nearby files were inspected but excluded:
OverviewRoute475 and MessagesRoute468 are different presentation owners;
legacy interaction-quality453 has separate installed/rollback surfaces.
No threshold, policy, exception, scope authority or test registration changed.
Generated inventory adds one active source file and moves its existing lexical
`fallback` parameter marker to the new file; it introduces no fallback path.

No public DTO, route, permissions, request lifecycle, error envelope, write,
CSS or rendering behavior changes. All retained World tests continue to execute
the active read model/controller and route. No dead-helper tests existed to
migrate; no coverage or assertions were removed. All37 focused tests pass both
before and after extraction.

## Verification

Compatible local Node22.22.2/npm10.9.7 tools and root/backend dependencies were
reused only after exact lockfile comparison. No application dependency, lock or
provider configuration changed.

- World read-model/controller/route focused suites: **37/37** baseline and final.
- Retained full Admin V2 suite: **393/393**.
- Root `npm test`: passed through final v606 drift audit. The first attempt
  stopped because regenerated inventory was not yet staged; after staging the
  intended source/inventory union, the unchanged audit and full aggregate pass.
- Core backend TypeScript: passed; no backend source changed.
- Both source modules pass syntax and whitespace checks; nine moved function
  bodies compare byte-for-byte.
- Retained `scripts/admin-v2-browser-smoke.mjs`, assertions unchanged:
  **33 passed, eight existing expected route-ID exceptions, zero failed**.
  Expected exceptions preserve the fixture's existing selected-game UUID URL
  contract; they are not newly waived or claimed fixed by this cleanup.
- Additional real built canonical entry checks at1280x720 and390x844:
  `/admin/index.html?game={fixture}#world-management` renders ready World data
  and the fixture pack, requests the new value module, and has no page errors
  or document horizontal overflow. All off-origin requests are blocked.

Browser tests use synthetic local same-origin Admin BFF fixtures and the
already-installed Chromium158 fallback. Only the launch executable/arguments
are substituted by a temporary wrapper; retained assertions are untouched.
Pinned-browser hosted qualification, real authenticated BFF/Edge/PostgREST,
staging and production are unverified. Full Edge/backend smoke were not retried:
the unchanged locked SDK download is already known unavailable locally.
No local source result is represented as hosted or live acceptance.

Raw baseline/final logs, temporary browser wrappers, built output, body proof,
existing-smoke diagnostics and screenshots remain under ignored
`admin-browser-smoke-artifacts/admin-world-value-cleanup-20261125/`.

## Delivery and next gate

This is one local source-cleanup tranche, not `VERIFIED_COMPLETE`. Durable
incremental Git bundle and single-commit patch are produced outside the source
worktree with SHA256SUMS; their only Git prerequisite is the exact public main
commit above. They contain only tracked cleanup/evidence changes, no generated
build, tool cache, credentials or hosted data. Original task worktrees and refs
remain untouched. No push, PR, merge, dispatch or deployment is performed.

Frozen Roster source pins and controls remain unchanged; this unpublished
runtime union cannot borrow held-main Roster acceptance. Independent source
review, reviewed source-pin reconciliation and exact-head pinned-browser/CI
qualification remain necessary before any later publication decision. Next
exact roadmap step: review this removal/extraction and qualify that exact
source through the normal owner-controlled publication process, if authorized.
