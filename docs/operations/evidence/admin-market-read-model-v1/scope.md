# Admin Market read-model extraction

- Roadmap item: ARCH-ADMIN-MARKET-READ-MODEL-001.
- Status: IMPLEMENTED_NOT_MERGED; local-only preparation, no PR or hosted qualification yet.
- Base: 7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7, fetched on 2026-11-13.
- Owner: refactor/admin-market-read-model-20261113.

## Boundary and preservation

MarketController previously combined DTO filtering/normalization with request lifecycle, private resource-ID lookup, permissions, filters, and view rendering. MarketReadModel owns only the unchanged pure normalization helpers. The controller retains all mutable request/view/private-ID state and its existing public exports. Private UUIDs remain confined to the batch lookup map and are not placed in the public read model. This does not change inherited filtering, alias precedence, input bounds, immutability, error handling or economics.

The six currently open PRs (#624, #668, #731, #735, #933, #938) were inspected. #668 and #624 changed-file inspection finds no Market controller/model/test collision. Roster and separate current World, Attendance, Contracts and Marketplace owners are excluded. The global roadmap baseline and other item statuses remain untouched. Historical #952 unmerged wording is not evidence against its actual merge in this base.

## Validation plan

Preserve all existing Market API, route, cancellation and privacy tests. Add bounded edge cases to the already-registered Market route test, below the 500-line threshold. Verify full root tests, focused Admin, backend TypeScript, deterministic inventory and secret/whitespace checks. Run applicable browser and backend aggregate checks and report unavailable dependencies without weakening gates. Compare all original function bodies against base to prove the extraction did not rewrite behavior. Independent review and frozen private recovery precede parent-controlled serial integration. Recompute the inventory on the combined tree rather than claiming additive large-file reductions.

No migration, route, RPC, workflow, root manifest, permission, staging/production setting, or deployment change.

## Qualification result (2026-11-13)

Implementation: `1ea76911233b997972c69dfbd5047fc85e20697e`. Node 22.23.1 and npm 10.9.8 were used. All 26 original top-level function bodies (including the complete controller factory) and all constant declarations compare byte-for-byte equal to the base; only module import/export ownership changed. Independent read-only review found no actionable source/test issue.

Passed:
- Market API/route suite: 43 unique tests, including six new boundary cases. Running the route file independently plus its API importer duplicates 33 cases and is not additional coverage.
- Registered Admin suite: 252 tests; full root `npm test` passed with its explicit existing PostgreSQL skip retained.
- Backend TypeScript `npm --prefix backend run typecheck`.
- Committed inventory regeneration, architecture gates in the root suite, secret scan, syntax and whitespace checks.

The controller decreases from 534 to 220 newline-counted lines; the cohesive read-model module is 339 lines. The existing route-test file stays under the threshold at 398 lines. The deterministic standalone inventory is 1,354 sources / 92 oversized / 52 persistence candidates / 70 cross-domain import candidates / 26 browser transport shims. The scanner counts a trailing empty line; source thresholds and all ratchets are unchanged. No zero-tolerance architecture regression is introduced.

Incomplete, not waived:
- `typecheck:all` passes TypeScript then stops at the existing frozen Supabase 2.108.2 SDK connection refusal in Edge checks.
- Backend smoke completes 23 Deno groups / 968 passed cases and 18 Node cases with no executed test failure, then the same frozen SDK import blocks the Game Sessions group. This is not an aggregate pass.
- The native Market browser command cannot launch because its pinned Chromium executable is absent. No browser assertions or staging/database proof were executed.
- Exact-head hosted qualification and merge remain pending.

## Integration handoff

Keep this candidate separate from the current four-controller integration batch and prerequisite Contracts/test-coverage correction. Before publication, reconcile against actual main and rerun the combined tests; regenerate the inventory rather than copying this standalone count. The existing Market API entry imports the updated route test, both paths are already selected by the dedicated Market workflow, and Admin Shell selects the changed runtime paths. A future test-only change is selected by the dedicated Market workflow, which runs the complete registered Admin suite; it is not independently selected by Admin Shell. No helper-only trigger gap or shared manifest/workflow edit is introduced. Preserve every unrelated roadmap entry and owner. Next exact item: serialized integration and hosted qualification of ARCH-ADMIN-MARKET-READ-MODEL-001 after the current batch; no production deployment.

## Actual-main integration continuation

The owner authorized publishing and qualified serial merge after #954 and its post-merge checks completed. Main is now `0e2af370032656d6927150c0299f5ccc68cda3e5`, tree `5c90919a19b96bed64e0ca7061b594a4dd5db232`. This reconciliation preserves all #953 Contracts data-loss/coverage corrections and all #954 World, Attendance, Contracts and Marketplace read-model extractions. The only merge conflicts were additive roadmap entries and generated inventory; both are reconciled without discarding other work. Existing six open PR owners remain untouched.

The combined inventory is 1,358 sources / 88 oversized / 52 persistence candidates / 70 cross-domain import candidates / 26 browser transport shims. The former standalone 92 count is historical. All Market source and assertions remain unchanged from the independently reviewed candidate. Publication will register the actual PR number without guessing; local and exact-head hosted gates must qualify the new union. No production deployment or runtime/database change is authorized.

Reconciled candidate `d5d06a56` passes full root, registered Admin 285/285, Market 43/43, core TypeScript, inventory and secret/whitespace checks. Independent reconciliation review confirms all main source/metadata preserved and Market source/assertions byte-identical to `68d0f066`. Main prerequisite has 26/26 successful post-merge workflows; those results do not qualify this candidate. Frozen SDK and local browser limits remain explicit. Ready for initial draft publication followed by actual-number authority registration and fresh hosted checks.
