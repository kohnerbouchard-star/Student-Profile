# REF-003 execution scope

Status: IN_PROGRESS. Owner: existing PR #740, `refactor/ref-003-dead-code-candidates`.
Base main: `a64befd325a3b46fdc86b9bcd3dae60641545697`.
Starting head: `f3776987c417d36c1c89b4cffc335f04329a0707`.
Dependency: REF-002 merged through #739. Its completion label is not a deletion proof.

## Bounded implementation

Add a read-only candidate classifier beside the existing architecture generator. Reuse its committed inventory and the existing runtime-retirement policy. Capture an immutable Git revision, mutually exclusive file/physical-line denominators, overlapping structural flags and explicitly reviewed dispositions. Never infer dead code from age, names, markers, absent direct imports or historical provider snapshots.

Editable paths (eight maximum, including the already changed backlog):

1. `scripts/architecture/refactor-candidate-audit.mjs`
2. `scripts/architecture/refactor-candidate-audit.test.mjs`
3. `scripts/legacy-runtime/runtime-retirement.test.mjs` (additive test registration only)
4. `docs/operations/evidence/refactor-execution-v1/REF-003/candidates.json`
5. `docs/operations/evidence/refactor-execution-v1/REF-003/scope.md`
6. `docs/operations/evidence/refactor-execution-v1/REF-003/validation.json`
7. `docs/roadmaps/refactor-execution-v1/tasks/REF-003.md`
8. `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-003 object only)

The scanner and focused tests are one tooling change. Generated measurements and candidate evidence are data, listed separately from source; no formatting churn is intended. Existing tests are preserved. There is no new runtime registry or production importer.

Protected: all application/browser source and generated bundles; SQL/migrations; architecture inventory, ceilings and generator; runtime/deployment manifests; workflows; package/lockfiles; secrets/cloud settings; other REF task objects/dependencies. No merge or deployment is part of this start instruction. Existing #668 context/global-ledger, #624 CSS, #690 Living World, #730/#731 Phase 15 and #735/#736 auth/release ownership remains separate.

## Validation

Inspect the new scanner before execution. It may read Git objects and print a JSON report; it must not invoke the application, access provider APIs, follow working-tree symlinks or write tracked files. Tests may create and remove disposable synthetic Git fixtures only. Register focused tests in the existing retirement suite consumed by Repository Quality; do not add a temporary workflow.

Commands:

```sh
node --test scripts/architecture/refactor-candidate-audit.test.mjs
node scripts/architecture/refactor-candidate-audit.mjs HEAD
npm run test:legacy-runtime
npm run audit:architecture
npm run audit:high-priority-boundaries
npm run audit:legacy-runtime
npm run security:secrets
npm test
git diff --check
```

Use pinned Node/npm in CI. Local Node 22.16.0 is not the repository-pinned runtime; local fixture results are supplemental only. Direct clone failed at DNS resolution and archive access failed; no complete local checkout is claimed. Existing CI performs full-checkout validation, with exact source identity printed by the scanner. No backend, browser, live traffic or production acceptance credit is inferred from tooling tests.

Unknown HTTP/job/external consumers retain `safeToDelete: false`. Existing observation policy is 14 pre-disable quiet days, 7 post-disable monitoring days and 30 recovery days before deletion, as recorded in the historical runtime inventory. No quiet window is claimed here. REF-004 and later tasks remain unstarted.
