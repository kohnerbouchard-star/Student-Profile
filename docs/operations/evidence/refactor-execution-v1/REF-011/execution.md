# REF-011 completion scope and execution record

Status: IN_PROGRESS pending exact-final-head qualification and normal merge. Owner request: Finish task 11. Continue existing PR #757 and branch `refactor/ref-011-neutral-deno-test-config`; do not replace the branch or begin REF-012. Initial branch head reported by GitHub: `51f45973668e66b01708c5b6c15d942280c3078e`.

## Registered children

Each child stays below ten meaningful files. These registrations preceded the remaining implementation edits.

- REF-011a: existing four Player scope/security keys: `test:player-request-scope`, `test:player-security`, `test:player-capabilities`, `test:player-logout`. The initial start changed these before executing old/neutral parity. That sequencing gap was not counted as proof; both configurations were subsequently executed before additional migration.
- REF-011b: read/communication keys: `test:player-world`, `test:player-notifications`, `test:player-messaging`, `test:player-progression`.
- REF-011c: economic/stateful keys: `test:world-runtime`, `test:player-inventory`, `test:player-contract-acceptance`, `test:player-contract-lifecycle`, `test:player-market-assets`, `test:player-store-public`, `test:player-banking-public`, `test:player-banking-fx`, `test:economic-ledger-invariants`, `test:player-marketplace`, `test:player-crafting`. Only the first Deno command in `test:world-runtime` changes; its Admin command remains byte-identical.
- REF-011d: a dependency-free Node config ratchet/parity runner and its self-tests, registered through new `test:neutral-deno-config` and the existing `smoke` wrapper. `test:smoke`, every existing suite's file list/permissions and all typecheck commands stay unchanged. All nineteen migrated keys remain in backend smoke. No workflow edits.

Actual implementation paths (seven):

1. `backend/package.json`
2. `backend/scripts/verifyNeutralDenoTestConfig.mjs`
3. `backend/scripts/verifyNeutralDenoTestConfig.test.mjs`
4. `docs/operations/contracts/player-cross-cutting/pr-757.json`
5. `docs/operations/evidence/refactor-execution-v1/REF-011/preflight.md`
6. `docs/operations/evidence/refactor-execution-v1/REF-011/execution.md`
7. `docs/roadmaps/refactor-execution-v1/tasks/REF-011.md`

The initially reserved eighth path, `script-baseline.json`, is unnecessary: unchanged-argument hashes and test identities are retained in the complete CI artifact. It was not created. The two mandatory verifier paths in the authority manifest are locked references, not changed implementation files.

## Ownership reconciliation

Live changed-file enumeration and the actual package patch of PR #668 were inspected. Contrary to the initial preflight's broad claim, #668 DOES modify `backend/package.json`: it adds `test:staff-bootstrap` and invokes that command from `test:smoke`. REF-011 leaves those keys and their underlying context/bootstrap ownership untouched. Its package changes are restricted to the nineteen config-path substitutions, a new task-specific command, and the outer `smoke` wrapper. No #668 donor commit or global roadmap change is imported.

PR #736's five live changed paths are Player runtime, generated architecture inventory, its own authority manifest, authentication roadmap, and trusted-IP contract test. It does not change this package/config seam. Its auth/runtime ownership remains untouched.

## Qualification history

The initial start omitted the PR-specific Player cross-cutting authority and failed qualification. A later manifest revision incorrectly omitted mandatory verifier locks; Player Terminal run `36322942990`, job `108630156042`, rejected it with `Player authority must lock its own manifest, verifier, and regression test.` Reading the actual verifier confirmed that all three must be allowed and required files must exist. The mandatory locked references were restored without editing the verifier or its regression tests. No failed check is waived.

The first package-gate edit accidentally duplicated a Stock watchlist test argument. It was immediately corrected before the accepted preflight run. The final live package patch was inspected and contains only nineteen config operand substitutions, the new task-specific verification command and the outer smoke prefix. Existing test selection, permission arguments, `--frozen`, lock operand, typecheck commands, dependency metadata and `test:smoke` are unchanged.

## Executed old/neutral parity before remaining migration

Preflight source head: `b1f6ae8619a7318d7ccc4420bce1bdf419a17448`.
GitHub PR-merge checkout: `44e6091fd28c2858a97e856b71d9c8513507e9d4`.
Backend Typecheck run: `36322463387`; actual successful job: `108628805756`.
Toolchain in the inspected log: Node 22.23.1, npm 10.9.8, Deno 2.9.3.

Complete backend smoke artifact `10933110692` was downloaded and inspected. Its SHA-256 is `6b14abaccc02423705d3232769cac4c846bc296a32b54fcebab46989569b85cf`, matching the uploaded ZIP digest. `backend-smoke.status` is zero. This is actual Deno execution, separate from the synthetic runner self-tests.

The runner executed all nineteen suites under both original Classroom and neutral configs, compared JUnit test identities and skipped outcomes, and checked identical shared-lock bytes after every invocation. All 612 test identities passed under each config, zero skipped. The shared lock SHA-256 was `66b40862285f9bd9a7426a48671427cde664f17043f02ad88ba4eef85979423b` throughout. The artifact contains each suite's test-identity hash and normalized-argument hash.

| Child | Executed suites and test counts under EACH config | Total |
| --- | --- | ---: |
| REF-011a | request-scope 81; security 59; capabilities 11; logout 9 | 160 |
| REF-011b | world 17; notifications 31; messaging 32; progression 28 | 108 |
| REF-011c | world-runtime 37; inventory 50; contract-acceptance 45; contract-lifecycle 1; market-assets 73; store-public 39; banking-public 6; banking-fx 16; economic-ledger-invariants 3; marketplace 49; crafting 25 | 344 |
| REF-011d | 16 Node self-tests plus 38 actual Deno invocations; config options, frozen-lock bytes and normalized arguments preserved | PASS |

The same run also passed complete backend smoke (including Admin API 322 and Admin local mutations 80) and `typecheck:all`, checking all 28 Edge roots. These preflight results do not substitute for final-head qualification.

Only after inspecting that complete parity artifact, commit `7f4b14c901684cf2976dfc2f567d885861fd18c7` migrated the remaining fifteen registrations and removed `--preflight` from the package command. Normal smoke now enforces strict no-new-Classroom borrowing and repeats old/neutral parity. No permissive compiler config was introduced.

## Remaining references by category

- Genuine Classroom owner: package `typecheck:edge`, Classroom's local `tasks.check`, and the Classroom override in `typecheckAllEdgeRoots.mjs`. Retain these until REF-048 has retirement evidence.
- Compatibility source reads: Player security, Game Sessions composition and economic ledger/source contract tests still explicitly read legacy sources. Their read permissions and assertion sets are unchanged. Source reading is not compiler-config ownership.
- Verification-only comparison: the new runner and its self-tests deliberately mention the original config to prove parity and reject unrelated consumers. These references are not canonical suite registrations.
- Existing workflow-direct config references: `backend-typecheck.yml`, `player-terminal.yml`, `beta-security-contract.yml`, `player-multiplayer-load.yml`, `admin-api-tests.yml`, `world-runtime.yml`, `progression-runtime.yml`, `crafting-item-runtime.yml`, `marketplace-preconvergence.yml`, `business-player-store-fx-final-v2.yml`, `business-player-store-cutover-v2.yml`, and `banking-fx-clearing-v1.yml` retain their recorded direct invocations. Some are canonical tests, not Classroom composition; they are outside this task's explicit no-workflow-edit boundary and are not misclassified as retired. Package invocations made by these workflows use the migrated registrations.
- Historical documentation and evidence retain their original commands for traceability. They are not executable registrations.

No claim of zero repository-wide textual references or Classroom retirement is made. The ratchet covers backend package-script config borrowing.

## Final qualification and closeout

Final-head backend smoke, `typecheck:all`, Player/Store/FX/security and all applicable checks remain mandatory before normal merge. Local Node tests and ZIP inspection are not local Deno execution. No lock regeneration, widened permissions, assertion removal or runtime repair is permitted to force parity.

After implementation qualification and normal merge, the separate closeout may change only this task's evidence, task document and REF-011 backlog fields. Preserve all other 49 tasks and global metadata. Production is not certified by repository CI. No production deployment/mutation or REF-012 work is authorized or claimed.
