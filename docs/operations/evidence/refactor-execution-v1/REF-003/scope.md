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

## Source-review continuation

Continuation source: `adbcc0561b4345c93a5c3023e418cf0a5de351c6`; main is unchanged and the existing eight-file scope is retained. Expand hash-bound reviews of retained Attendance/Player bridges, historical Apps Script material and intentional negative-state behavior. Historical classification must cite actual source and its handoff, not the folder name alone.

Close classifier evidence gaps within the existing module: include every historical-path file even without lexical flags; attach explicit query, confidence, symbol, consumer-audit and replacement fields to generated records; preserve the distinction between discovery references and proven callers. Historical, generated and test status never imply deletion eligibility. Verify source-evidence hashes as well as the reviewed file so a changed caller invalidates its review.

Use the existing retirement CI for full-checkout execution. No source archive, production probe or manual workflow is required from the owner. Keep historical measurement snapshots immutable and append the new measured checkpoint only after its actual checks execute. Do not claim all unknown records were semantically reviewed or mark the task VERIFIED_COMPLETE merely because CI is green.

## Archive and event-consumer continuation

Source checkpoint: `32b35fb857e67d5107b8e83965f1153a2bdfc689`; fresh comparison confirms unchanged main and the same owner. Read the archived API router and stock-history/news helper, retained Player identity wiring, Attendance save controller/settings renderer, and Settings lifecycle bridge. Add their reviewed responsibilities, explicit partial-write/lifecycle limits, supporting hashes and retention conditions to the existing register only.

Extend literal-reference discovery with separately named event/dispatch terms that must occur in the reviewed source. Label the resulting references as literal evidence, never inferred event execution or transitive reachability. Add focused tests for event-only consumers, test/document matches and invalid/missing terms. Preserve all existing tests, counts conventions and deletion denials. Local copies of the two tooling files must match the published Git blobs before editing; use pinned full-checkout CI for acceptance evidence.

No new filename, application behavior change, external probe, workflow or package edit is permitted. Unresolved external use stays a retention gate; a source trace does not certify hosted inactivity or repair a pre-existing UI race. Keep REF-004 and later tasks unopened.

## Bounded acceptance continuation — 2026-09-23

Starting head: `aeadcaa695fce994bcb053e3b90007c72e0f6946`; base remains `a64befd325a3b46fdc86b9bcd3dae60641545697`. All eight existing PR workflows have now returned success. This is not prospective credit for the next head. The owner's repeated continuation instructions retain the serial execution/normal-review boundary recorded in SCOPE-INTAKE; no release or unrelated merge is authorized.

The original task explicitly includes unknown dispositions and specifies at most three deletion nominations, not a minimum. Completion of the reproducible conservative register must not be confused with proving all 746 static matches dead, reviewing every unknown as a deletion candidate, or certifying hosted inactivity. No removal is nominated. The 23 reviewed dispositions and the recorded positive source relationships are retained; unresolved ownership, reachability, external consumers and unselected replacements remain visible and prohibit deletion. Earlier checkpoint wording that all unknowns must receive complete semantic review before this bounded register can close is superseded only in that respect, not converted into completed review credit.

Close the actual remaining diff-validation gap in the existing focused test only: reconstruct the three modified baseline files from the immutable snapshot, verify their exact main blob hashes, and create a disposable eight-file Git fixture containing the actual PR bytes. Run `git diff --check` including intent-to-add new files. This covers the entire observed PR diff, not an application checkout or runtime. Assert the eight-path scope separately against GitHub. Limit this main-baseline assertion to the REF-003 owner PR so it does not freeze other task objects in future unrelated PRs. Preserve all existing tests. No network request, credentials, application execution or tracked write is involved.

Acceptance for this R1 classification/tooling task comprises the exact census and reviewed bindings, category/disposition sums, companion JSON/links, required example fixtures, unchanged existing architecture regeneration/ceilings, high-priority/legacy checks, repository policy checks, and the full observed eight-file diff. Backend typecheck/smoke and authenticated runtime suites are not credited when unexecuted; this task changes no backend/browser application source, dependency, configuration or migration. A later runtime-source refactor still requires those applicable shared gates. No live usage window is required to retain every candidate.

Do not mark VERIFIED_COMPLETE until actual normal merge. Record acceptance separately from execution snapshots and retain all historical failures/limitations. Stop after REF-003; REF-004 is not authorized by this continuation.
