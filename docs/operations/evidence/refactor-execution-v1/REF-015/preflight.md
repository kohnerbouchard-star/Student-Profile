# REF-015 — Admin shim retirement preflight

Status: IN_PROGRESS. Initial three-candidate deletion gate: BLOCKED. No removal is approved by this start tranche.
Observed main: `368db59335d9f417c818881d19e3d4d9cd56fb67`; tree `820f50237f3f0441a5494393a360311c3cdddb49`.
Owner branch: `refactor/ref-015-admin-shim-retirement`. Parent: REF-015 / ARCH-700.

## Authority and scope lock

The owner requested “Start task15”. REF-012, REF-013 and REF-014 are VERIFIED_COMPLETE in the live backlog. No existing `refactor/ref-015*` branch was returned before this owner branch was created. Existing unrelated PRs and their context/auth/release ownership remain protected. This starts REF-015, not the historical Phase 15 deployment program, and does not start REF-016.

This initial tranche edits exactly four documentation/data paths: this preflight, `retirement-audit.json` in this directory, `docs/roadmaps/refactor-execution-v1/tasks/REF-015.md`, and only the REF-015 entry in `docs/roadmaps/refactor-execution-v1/backlog.json`. No application, test, workflow, generated bundle, candidate-register disposition, inventory ceiling, database, secret, release setting or external runtime is changed. The task retains its ten-meaningful-file ceiling and maximum of three proven-unused shim deletions; three is not a quota.

## Source provenance and current-main reconciliation

A direct local Git clone failed DNS. GitHub artifact `11079350479` supplies tracked source for qualified REF-014 head `e9c144268ea16ecd86e051c1714585966cfedebc`. Re-indexing that archive reproduces tree `fd6a465b8964b710691dc204b0510e88244b637b`, independently matching the live GitHub tree of merge `c9d57b9bb1e75009e158f13aea8e1750f560e86d`.

The live comparison from that merge to frozen main contains exactly the four REF-014 closeout documentation/data paths recorded in the JSON evidence. Application, build, test, policy and classifier source are therefore byte-identical to current main. The archived backlog was reconciled against live REF-014 closeout before editing REF-015; its reconstructed current-main blob matches `c7d3973ffff400390052a85dcfb992d352e2f0b0`. The full classifier's 4,000-file denominator describes the archive tree, not an invented full-current-main checkout. Historical workflow results are not reused as new Task 15 test passes.

## Refreshed removal decisions

**Attendance — retain.** `admin/attendance-reward-settings-route-bridge-v2.js` is already a 14-line forwarding compatibility path. The active bootstrap imports `attendance-reward-request-adapter.js`, not this old filename. Generated Settings still reads the compatibility global, which the canonical adapter also supplies. That global reference does not prove the old file is loaded. The old file can dynamically import the adapter for historical/direct URL users; their absence and representative quiet-window evidence remain unknown. Preserve this minimal stub, its reader contract and its negative tests.

**Player access code — retain.** `admin/index.html:42` still loads `admin/player-access-code-bridge.js`. REF-013 migrated existing-player resets, not creation. The remaining wrapper handles creation responses, conditionally follows up a create missing credentials, and emits `econovaria:player-access-code-issued`; `player-create-lifecycle.js:66` and `player-create-ux.js:292` remain consumers. Reset parity is not creation parity, and removing this file would delete live responsibilities.

**Settings — retain.** `admin/admin-bootstrap.js:55` dynamically loads `admin/settings-save-error-bridge.js`. REF-014 removed redundant observation but intentionally retained its 13-line stylesheet bootstrap for `css/settings-final-polish.css`. The source controller/presenter own save errors; that does not make the remaining stylesheet loader unused.

The build's `copyBrowserRoot` retains the Admin asset tree, then `canonicalizeAdminV2` replaces only output `admin/index.html` with V2 HTML. A canonical default page, copied asset, zero filename matches or unchanged test result is not proof of no historical/direct clients. No whole Admin directory, fetch-stack rewrite, creation behavior or safety test is included. Other candidates remain unresolved, not declared dead by this three-family review.

## Qualification and stop boundary

Fresh supplementary local checks on the verified source tree passed: 54 Admin mutation UI tests, 86 Admin V2 tests, 17 candidate-classifier tests and 63 runtime-retirement tests; asset, interaction, legacy-runtime/transport, architecture, high-priority-boundary, secret and diff checks also passed. Architecture regeneration caused no tracked inventory drift. Commands, counts and limitations are in `retirement-audit.json`.

Local Node is 22.16.0, not the repository-pinned 22.23.1. These checks do not substitute for pinned exact-head CI. The Task 15 browser load/interaction crawl, before/after runtime request/listener measurement, full npm/backend suites and external-client observation were NOT_RUN. No runtime files changed, so removed files/lines and source request/listener wiring delta are all zero; measured browser-count deltas remain null, not zero.

Next exact work remains REF-015: establish a fully evidenced eligible candidate and its retirement gate before any deletion, or record the task as blocked if no candidate qualifies. The Attendance URL gate needs retained-client evidence; the Player and Settings files additionally need their live responsibilities preserved by reviewed owners. Unknown consumers block the individual deletion. Never weaken tests, invent a quiet window, disable a hosted runtime, or advance to REF-016 to manufacture completion. Rollback of this start is a normal documentation-only revert; there is no runtime change to undo.
