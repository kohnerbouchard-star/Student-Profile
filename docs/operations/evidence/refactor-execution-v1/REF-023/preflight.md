# REF-023 Inventory/Crafting reservation verification

Status: IN_PROGRESS. Base main `207eb2cd4e72e4cee7a95b147a3a0eeb37b00ed9`.
REF-016 is complete. No active Crafting/Inventory PR owns this seam. REF-015
remains blocked; REF-019/020 retain their gates.

## Current-source disposition and exact scope

Verification-only under the package README: production Crafting has zero deep
Inventory imports. The sole Crafting-to-Inventory import is a route-parser test;
the production bridge points from Inventory to Crafting. No unused public barrel
or extra JavaScript reservation call is warranted. Current Crafting repository
commands already invoke one atomic RPC each. This does not waive R3 evidence.

Five editable paths: `scripts/ref-023-reservation-acceptance.ts`, existing
`.github/workflows/ref-018-attendance-qualification.yml`, this record,
`docs/roadmaps/refactor-execution-v1/tasks/REF-023.md`, and only REF-023's entry in
`docs/roadmaps/refactor-execution-v1/backlog.json`. Budget: twelve meaningful
files; one qualification concept. Runtime source, migrations, package scripts,
credentials, production workflows and the other 49 roadmap entries are protected.

## SQL expectation audit and qualification

Latest Crafting commands are the 20260806120130/140 canonical migrations:
start locks the holding and posts reservations atomically; cancellation releases;
failed completion either releases or consumes according to the captured policy;
claim consumes and grants within one RPC. Existing Marketplace public listing
wrapper (20260721142800), corrected private projection (20260721142900), and
shared reservation reconciliation lock the same holding and retain source scope.
Both insufficient-stock orderings and actual overlapping commands are required.

Synthetic fixtures use canonical inventory grant and Banking funding commands;
they do not bypass protected balance projections. The harness snapshots every
game-scoped base table plus job input/output children, asserts replay/conflict,
cancellation, both failure policies, wrong-game/paused-game rejection, one winner
under observed two-session lock contention, and a transient disposable trigger
failure after actual claim output posting followed by same-key retry. No schema
migration or production routine is changed. The trigger is removed before lint.

Existing Crafting/asset workflows provide static/unit evidence, and the older
Marketplace convergence record predates the canonical cutover. The available
staging asset acceptance is serial. None proves this current competing-RPC race.

## Validation and remaining gate

Current-main focused suites passed: Inventory 50, Crafting 25, Marketplace 49,
Crafting runtime 37. New harness Deno typecheck passed. Docker is unavailable
locally, so database acceptance is NOT_RUN until this PR's disposable CI passes.
The existing workflow retains Attendance/ledger qualification, full backend
checks, migration replay, and normalized before/after lint diagnostics. Existing
lint findings are disclosed, never treated as clean database certification.
Qualification artifact includes `ref023-database-qualification.json` and its log.

These five paths do not activate production deployment jobs; the reused workflow
uses only a loopback disposable database. No hosted credentials or dispatch.
Parent stays IN_PROGRESS until exact-head evidence passes, source merges, and
merged-main verification is recorded. Next dependent task: REF-024.
