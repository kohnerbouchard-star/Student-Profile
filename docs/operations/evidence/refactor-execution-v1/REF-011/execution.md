# REF-011 completion scope and execution record

Status: IN_PROGRESS. Owner request: Finish task 11. Continue existing PR #757 and branch `refactor/ref-011-neutral-deno-test-config`; do not replace the branch or begin REF-012. Initial branch head reported by GitHub: `51f45973668e66b01708c5b6c15d942280c3078e`.

## Registered children

Each child stays below ten meaningful files. These registrations precede the remaining implementation edits.

- REF-011a: existing four Player scope/security keys: `test:player-request-scope`, `test:player-security`, `test:player-capabilities`, `test:player-logout`. The initial start changed these before executing old/neutral parity. That sequencing gap is not counted as proof. Revalidate both configurations with identical tests and permissions before additional migration.
- REF-011b: read/communication keys: `test:player-world`, `test:player-notifications`, `test:player-messaging`, `test:player-progression`.
- REF-011c: economic/stateful keys: `test:world-runtime`, `test:player-inventory`, `test:player-contract-acceptance`, `test:player-contract-lifecycle`, `test:player-market-assets`, `test:player-store-public`, `test:player-banking-public`, `test:player-banking-fx`, `test:economic-ledger-invariants`, `test:player-marketplace`, `test:player-crafting`. Only the first Deno command in `test:world-runtime` changes; its Admin command remains byte-identical.
- REF-011d: a dependency-free Node config ratchet/parity runner and its self-tests, registered through new `test:neutral-deno-config` and the existing `smoke` wrapper. Do not change `test:smoke`, any existing suite's file list/permissions, or typecheck commands. Validate both original and neutral representative test runs using the same frozen lock. All nineteen migrated keys remain in backend smoke. No workflow edits.

Implementation path allowlist (eight paths):

1. `backend/package.json`
2. `backend/scripts/verifyNeutralDenoTestConfig.mjs`
3. `backend/scripts/verifyNeutralDenoTestConfig.test.mjs`
4. `docs/operations/contracts/player-cross-cutting/pr-757.json`
5. `docs/operations/evidence/refactor-execution-v1/REF-011/preflight.md`
6. `docs/operations/evidence/refactor-execution-v1/REF-011/execution.md`
7. `docs/roadmaps/refactor-execution-v1/tasks/REF-011.md`
8. `docs/operations/evidence/refactor-execution-v1/REF-011/script-baseline.json`

## Ownership reconciliation

Live changed-file enumeration and the actual package patch of PR #668 were inspected. Contrary to the initial preflight's broad claim, #668 DOES modify `backend/package.json`: it adds `test:staff-bootstrap` and invokes that command from `test:smoke`. REF-011 must leave those keys and their underlying context/bootstrap ownership untouched. Its package changes are restricted to the nineteen config-path substitutions, a new task-specific command, and the outer `smoke` wrapper. No #668 donor commit or global roadmap change is imported.

PR #736's five live changed paths are Player runtime, generated architecture inventory, its own authority manifest, authentication roadmap, and trusted-IP contract test. It does not change this package/config seam. Its auth/runtime ownership remains untouched.

## Existing failure

The inspected Repository Quality job 108624539927, run 36320953931, failed the Player cross-cutting gate because `pr-757.json` was missing. This is not waived. The PR-scoped authority will bind exact paths and retain the required Player and Store/FX checks. The authority is a scope declaration, not passing evidence.

## Configuration and compatibility boundary

Existing neutral and Classroom configurations explicitly use `strict: true`; the Classroom-only local `tasks.check` does not become a canonical dependency. No import-map/extends/workspace or resolution-bearing setting may be silently introduced or dropped. Admin's relaxed config is not a replacement. `typecheckAllEdgeRoots.mjs` uses explicit Classroom/Admin overrides and the neutral default for all other roots; leave it unchanged.

Retain the Classroom `typecheck:edge` command, Classroom's local check task, the Classroom override in the all-roots checker, and source-read permissions for compatibility tests. Source reads and compiler-config borrowing are different dependencies. Workflow-direct or documented historical Classroom references are not blanket-replaced. Retirement remains REF-048.

## Validation and closeout

Local Deno and a cloned repository are unavailable in this container; local Node-only assertions are not Deno execution. Require same-source old/neutral representative parity, unchanged argument/file/permission baseline, unchanged frozen lock bytes, full backend smoke, `typecheck:all`, the existing cross-cutting checks, and all applicable exact-head CI before normal merge. Record actual results separately for children a/b/c/d. Never widen permissions, disable assertions, regenerate the lock, or delete compatibility tests to make checks pass.

A separate closeout may change only this task's evidence, task document and REF-011 backlog fields after the implementation is qualified and normally merged. All other 49 backlog tasks and global fields remain unchanged. No production deployment or mutation is authorized or claimed.
