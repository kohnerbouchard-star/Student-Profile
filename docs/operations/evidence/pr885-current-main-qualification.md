# PR885 current-main integration qualification

## Scope and authorization

On 9 November 2026 the owner instructed that needed PR work be repaired against current main, pushed and merged after passing checks. The owner also authorized implementing the identified fixes and removing obsolete work. This supersedes historical draft-only publication limitations for repository integration, not production authorization or technical verification requirements.

Existing owner PR: #885, branch `fix/game-provisioning-service-claims-v1`.
Starting remote head: `8530faae8813200dce8b037946519dc8c29ac297`.
Integrated main: `08134650d1e0c8cfebb811a5d97331196ebe08e3`.
The local review worktree is isolated; publication is a normal fast-forward update of the existing owner branch.

Addressed capability: `BETA-GAME-PROVISIONING-CLAIMS-001` and the existing REF-046 Campaign acknowledgement correction. The 50 primary REF statuses and other owners remain unchanged. Consolidated donor PRs #879–884 are closed; their commits remain ancestors of this branch and their branches remain retained until qualification.

## Required fixes retained

- The economic-core guard reads the actual modern PostgREST request role, retaining legacy fallback only when modern claims are absent. Malformed/conflicting claims fail closed. No grants, owner, security-definer settings, function bodies beyond the exact predicate, or DBA exception are broadened.
- Campaign completion/failure requires the claimed attempt generation. Stale workers cannot mutate a reclaimed attempt. Completion counts require an actual true acknowledgement; a false result reports lost ownership.
- Both reviewed forward migrations retain their exact original bytes and digests. Existing migrations on main remain byte-identical.
- The immutable Phase 15 bundle remains unchanged. Its suffix registry combines the original eight identities, Campaign ninth, claims tenth, then the existing November password-reset and loan-review corrections at positions eleven/twelve. Their original bytes/digests and prior-vector checks are preserved. This registers source only; it does not apply a live bundle or certify a live ledger.

## Current-main reconciliation

Preserve current main's Deno configurations, trusted tslib source and integrity guards, backend typechecks, runtime/Staff/Contract workflows and modern SDK handling. Remove the old SDK 2.45.4 closure collection, redundant bundle helper and obsolete workflow diagnostics from the resulting diff. Their history remains in the branch.

The retained CodeQL regular-expression-injection finding is addressed by fixed project-identity regexes followed by exact run/attempt/phase comparisons in the supervisor and acceptance harness. Positive and negative ownership cases cover mismatches, metacharacters, null and trailing-newline input; no alert or assertion is suppressed. Fresh CodeQL CI is still required.

Keep the complete existing Staff/Story qualification workflow. Add only the two Campaign harness and four qualified source/test path selectors and its exclusive disposable qualification job. Independent review identified the source/test trigger gap; both PR and push selectors now retain permanent fencing coverage for source-only changes. Keep the existing provisioning regression and run it for both PR and main changes. No workflow dispatch, secret, environment, permission or release-control modification is included.

Re-register PR885 against its exact reconciled path set with both authority verifier files read-only, all current required/critical checks retained, and explicit new provisioning/database/Campaign checks. No check is waived.

## Verification

Local checks on the reconciled candidate (Node 22.23.1, local Deno 2.8.3):

- PASS: final complete Admin API suite (335 tests); 11 focused Campaign scheduler/effect and acknowledgement tests, including the new scalar/argument, false-completion and false-failure cases; five exclusive-resource supervisor rejection tests; 16 authority verifier regressions.
- PASS: all 460 migration identities audit, secret scan, exact PR path authority, generated inventory and architecture/seam ratchets. Source count is 1,318 because of one focused test file; all debt measurements and ceilings remain unchanged.
- PASS: full root suite, full backend smoke, TypeScript and all 28 Edge roots. Root retains its existing macOS GNU-tar deterministic-archive skip; Linux hosted validation remains required.
- Claims/suffix source suite: 35 pass; one shell-loop fixture cannot execute under the Mac's Bash 3 because it requires mapfile. The fixture is retained unchanged and must pass under hosted Linux Bash. This is not a full local suffix-suite pass.
- Database/API qualification NOT RUN locally: the Docker daemon is unavailable. No hosted connection or substitute fixture was used. Exact-head CI must run real database replays/lint, provisioning/PostgREST rollback, and Campaign races/cleanup with its pinned Deno 2.9.3 and Supabase CLI 2.109.1.

Final independent review and exact-head hosted qualification remain pending. Historical PR evidence is retained but is not a substitute for new-head results.

Required hosted runtime evidence includes real PostgREST old-guard reproduction and corrected provisioning/replay/rollback, both fresh database replays and lint, and Campaign event/lease contention, stale acknowledgements, wrong roles and verified resource disposal. The Campaign supervisor intentionally requires its exclusive CI runner; local fixtures must not masquerade as its CI receipt.

## Release and rollback

Production remains held. No hosted SQL, credential/permission mutation, deployment, release-branch change or feature activation is authorized. Existing U1 and manual release guards remain unchanged.

The worker and fencing migration must be promoted together through the separately authorized staged release process; old v1 acknowledgement calls deliberately fail closed after migration. Do not deploy the worker alone or attempt an old-worker rollback against the fencing schema. A production problem requires a reviewed forward correction and fresh staging evidence. No historical migration is rewritten.

Current source status: IN_PROGRESS. This record makes no deployed, live-parity or broad beta completion claim.

## Qualified main continuation after PR928

The independently reviewed published candidate `b2d2027682a8e0999f755e589f0f5d241ce27204` passed fresh hosted qualification, including:

- [Database Replay](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42584500087): two complete zero-to-head replays, immutable/suffix contracts, lint and disposable cleanup.
- [Economic Core Request Claims](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42584500439): real API authority/provisioning/replay/rollback, two replays, lint and cleanup.
- [Staff and Campaign qualification](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42584500128): all retained Staff/Story/economic cases, Campaign SDK/PostgREST authority, exclusive Campaign events and lease-generation assertions, independent owned-resource teardown and only-then certification.
- CodeQL, full Backend/Player verification, security, repository quality and retained economic workflows passed. The historical Mac Bash/GNU-tar limits do not replace these Linux results.

[Admin Browser E2E](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42584500019) failed the inherited outgoing-module redirect diagnostic, so that head was not merged. Qualified PR #928 merged into main as `0d314bbe53832afcdc94b9dab8d3e09515f2762f`, from `566a25d965952cd03db52e4873f458b83fdf960c`, after all 15 workflows passed. The owner directed normal forward reconciliation into PR885.

The additive integration preserves all PR928 browser/test/workflow/authority bytes and both complete intake entries. Only PR885's manifest, this evidence and its own intake continuation change beyond the normal merge. Required and critical check sets are the full union (125/92), with the same 27 changed paths and 29 path locks against new main. All provisioning/Campaign runtime, migration, suffix, qualification and release/verifier source remains byte-identical to the reviewed candidate.

The Mac is offline; the isolated cloud checkout is reconstructed from the verified published remote, not assumed local-file transfer. New-head independent review and hosted qualification are still required. This adds no production, live-parity, deployment or broad-completion credit.
