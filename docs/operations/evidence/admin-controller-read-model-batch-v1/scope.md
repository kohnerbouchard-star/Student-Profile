# Admin controller read-model batch

## Ownership and boundary

Status: `IMPLEMENTED_NOT_MERGED`. Owner branch: `refactor/admin-controller-read-model-batch-20261113`.
Roadmap items: `ARCH-LARGE-ADMIN-WORLD-CONTROLLER-001`, `ARCH-LARGE-ADMIN-ATTENDANCE-CONTROLLER-001`, `ARCH-LARGE-ADMIN-CONTRACTS-CONTROLLER-001`, and `ARCH-LARGE-ADMIN-MARKETPLACE-CONTROLLER-001`.

The owner requested pushing and merging the four prepared controller refactors and continuing independent large-file preparation on 2026-11-13. This batches one repeated structural correction: separate pure read-model normalization from controller orchestration without changing the public controller exports or feature behavior. No production deployment or mutation is authorized. It does not incorporate the separate Market-controller preparation, roster work, legacy PRs or new feature scope.

Freshly fetched main was `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7`. The seven open PRs (#620, #624, #668, #731, #735, #933 and #938) have no overlapping controller source owner. PR #668 retains global roadmap authority; this bounded intake preserves all previous ledger content. Older local-only statements in individual preparation scopes are historical and do not describe this newly authorized integration/publication task.

## Source integration

Recovered and verified the independently reviewed World patch, Attendance head `79d4b99aa29b3c63cf3e94d47354b429d3b5d98b`, Contracts head `b9efaa5e0ae1ae4bc9aeac54538fc0471e09aabe`, and Marketplace head `872b90a564021550b6f2487d92ecaaf6f687b501`. Archive and internal manifest hashes matched. Standalone generated inventories and roadmap copies were not overlaid onto the combined tree.

Prepared source `e63d6e1b` combines those four slices. Provisional integration `87d311dc` incorporates the separate Contracts data-preservation and retained-coverage prerequisite `71e43e1494f1cfef0f270150d77a0cf529192967`. This is not a claim that the prerequisite has merged. Before publication/merge, reconcile its actual public commit and main ancestry and requalify the resulting tree.

The Contracts merge explicitly retains the corrected raw targeting-presence edit guard and reward account projection in `ContractsReadModel.js`, plus all prerequisite form/adapter behavior and safety tests. Extraction and preservation tests were combined rather than selected from one side. Normalization from the buggy pre-fix controller was not reintroduced. The inherited audience-size limitation is not solved by this structural batch.

Against that corrected prerequisite, all 22 Attendance, 30 World Management, 23 Contracts and 26 Marketplace top-level function bodies are byte-identical after removing export keywords and reversing only the two already-reviewed equivalent Contracts predicate substitutions. Existing controller exports remain. No extra runtime imports cross feature ownership boundaries, no persistence is moved, and no schema, RPC, API contract, money/inventory write, UI styling or release path changes.

Controller physical lines fall as follows: World Management 772 to 317; Attendance 531 to 342; Contracts 642 after the prerequisite to 354; Marketplace 553 to 267. Pure read-model leaves contain 466, 198, 310 and 293 physical lines respectively. The combined deterministic inventory is 1,357 sources and 89 oversized sources, compared with 1,353 and 93 on main. Persistence-location candidates remain 52 and cross-domain deep-import matches remain 70. These are measured combined counts, not a sum of independent inventory claims.

## Durable test coverage

New World, Attendance and Marketplace characterization tests remain imported through existing registered test entrypoints. The Contracts characterization is retained in its existing workflow entrypoint together with the functional repair's tests. Add the three new helper tests and Attendance hash fixture to existing filtered events of eleven direct Admin V2 suite consumers. Shell retains its existing Marketplace helper entry and adds only the three missing dependencies in each of its two existing filtered events. Existing events, commands, assertions, jobs, permissions, checkout semantics, cancellation behavior and production guards must stay unchanged. Protected production-cutover scheduling is not broadened.

## Verification and outstanding gates

On Node 22.23.1 and npm 10.9.8, locked root/backend installs, all 638 Admin V2 tests, complete root `npm test`, core backend TypeScript, secret scanning, deterministic inventory and whitespace validation pass for provisional source integration `87d311dc`. The root suite retains its pre-existing PostgreSQL integration skip. Source-body comparison to the corrected prerequisite passes for all four controllers.

Native browser tests, full backend Edge/smoke aggregates, independent combined-tree review, actual-PR authority registration, exact published-head CI and merged-main verification remain required and are not certified by these local results. Earlier standalone execution hit the frozen Supabase SDK network refusal and unavailable pinned Chromium; current combined attempts must be reported separately. No hosted success, merge, production change or broad feature completion is claimed.

Rollback is a normal reviewed source revert; there is no data or migration rollback. Next: reconcile the qualified Contracts/coverage prerequisite onto actual main, complete exact-head qualification, and merge serially. Independent next-file preparation stays isolated until this batch's baseline is settled.

## Combined-tree review and blocked aggregate attempts

Independent review of committed `242ca6fbcc0a7c48e59e0b3fec4c232cc728f28b`, tree `20051946f7d12fdfbcc78e7fbb69188905665176`, found no blocking code issue. It independently verified all 101 retained function bodies, unchanged constants, no dependency cycles reachable from the four new leaves, the complete Contracts preservation fix and additive test union. It counted exactly 50 additive filter entries across eleven consumers, with no command, event, permission or guard change. Its 34 focused and 101 registered-entrypoint test runs passed; those overlapping counts are not additive unique coverage.

Fresh combined `typecheck:all` again passed core TypeScript then stopped when the frozen Supabase SDK import was refused. Combined backend smoke completed 23 Deno groups / 968 cases and 18 Node cases, then stopped at the same import before later groups. The supported pinned Playwright install again failed on truncated/non-ZIP official Chromium downloads; browser acceptance therefore remains unrun. No dependency substitution, modified lockfile, alternate unrecognized binary, security setting change or gate waiver was used.

## Actual-main reconciliation

Prerequisite [PR #953](https://github.com/kohnerbouchard-star/Student-Profile/pull/953) merged normally as `e55f3cabb3041e506c1f720b392d7f03c8f766c8`, preserving qualified head `273374bd4927659c66a06e573cf311adea87bf55` and exact tree `77ccd6a331a988c1d81b39747d9da97ce0299182`. Its 147 required / 103 critical identities were satisfied; 78 hosted runs passed with one deliberately guarded skip and CodeQL passed. This is prerequisite evidence, not qualification of the controller batch or post-merge main.

Integration `5233ea62` retains all actual-main source, original test additions, authority metadata and scope evidence. Contracts source/test conflicts resolve to the previously reviewed corrected combined tree, not the pre-fix extraction. Shared workflow conflicts preserve the complete prerequisite path entries plus the same 50 controller helper/fixture additions; all existing commands and guards remain. Inventory stays at 1,357 sources / 89 oversized. The new exact head requires its own source-bound hosted checks before merge.

## Published source and actual-number authority

Draft [PR #954](https://github.com/kohnerbouchard-star/Student-Profile/pull/954) publishes source `b0beeefaa70d59d23af7f16a04cfaa7aa05c653b`, with sole parent merged main `e55f3cab` and exact independently reviewed tree `22643fa1ab793961f8b33a67ad182ce3575047f2`. Local reconciliation `3b9852d9` has the same tree and freshly passes all 638 Admin cases and the full root suite; independent reconciliation review confirms source, test, backend and package bytes are identical to the previously reviewed candidate. Initial published-source CI is interim.

The actual PR954 authority preserves the merged predecessor's ordered 147 required / 103 critical check identities and all false production-deployment, production-mutation and secret-value flags. It locks the 50 main-relative changed paths plus two unchanged read-only authority verifier/test paths. The 55 required workflow families are source-derived and all remain required. Sixteen previously unselected existing PR filters gain only the exact PR954 authority path so the final amendment can schedule their retained gates. Together with the 50 durable helper/fixture entries, the complete main-relative scheduling change is 66 additive entries; no existing entry, event, job, command, action, permission, guard or checkout is removed or changed. Existing source-head bindings and deliberately retained merge-candidate checks remain intact.

Before merge: independently review the actual-number amendment, publish it with an expected-head lease, verify fresh exact published-head workflow/job identities and CodeQL, account for guarded skips, confirm merge-tree/source equality and prerequisite post-merge status, then merge normally under the owner's instruction. No initial-head or local-only result substitutes for these final gates.
