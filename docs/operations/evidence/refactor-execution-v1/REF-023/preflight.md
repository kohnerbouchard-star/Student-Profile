# REF-023 Inventory/Crafting reservation verification

Status: VERIFIED_COMPLETE. Base main `207eb2cd4e72e4cee7a95b147a3a0eeb37b00ed9`.
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

## Historical local validation

Current-main focused suites passed: Inventory 50, Crafting 25, Marketplace 49,
Crafting runtime 37. New harness Deno typecheck passed. Docker is unavailable
locally, so database acceptance is NOT_RUN until this PR's disposable CI passes.
The existing workflow retains Attendance/ledger qualification, full backend
checks, migration replay, and normalized before/after lint diagnostics. Existing
lint findings are disclosed, never treated as clean database certification.
Qualification artifact includes `ref023-database-qualification.json` and its log.

These five paths do not activate production deployment jobs; the reused workflow
uses only a loopback disposable database. No hosted credentials or dispatch.
Completion requires exact-head evidence, source merge and merged-main verification.
Next dependent task: REF-024. REF-025 remains blocked under its own recorded gate.

Initial head `2675de1cd9deb8f8df399b7ed1e413243d857388`, run `36821640069`,
failed during synthetic pack activation: canonical recipe mappings were checked
before fixture items existed. The fixture now inserts its items before activating
the pack. The production guard is unchanged. That run passed full backend and
retained REF-018/022 qualification but is not REF-023 acceptance.

Head `92834d826e786dc7368bac10478b6c50f338ee31`, run `36822328673`, passed
serial replay/conflict, both reservation orders, cancellation and cross-game
denial, then caught the fixture's incomplete paused lifecycle projection. The
fixture now sets the required `paused`/`disabled` pair together. Remaining claim
fixture fields were checked against table constraints and current RPC branches.
This partial run also is not final acceptance.

## Qualified source and merge

[PR779](https://github.com/kohnerbouchard-star/Student-Profile/pull/779) qualified
head `cfff4525af123a93a45976d4b33aa60253435a66`, including REF-025's merged
blocked record. An expected-head-guarded merge produced main
`4d2c4d7f5dd81aa208cde0082fbc83d7243f1b76`; both trees are
`909754e0963db55e98148843be8b6094d0d83bf0`. No runtime source was changed.

[Run 36823360791](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36823360791),
job `110243616045`, produced [artifact 11144202168](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36823360791/artifacts/11144202168).
Downloaded ZIP SHA256: `dff1b9b54ac95993226761837947000f99701eae86ea1fe96fb9652548c1d61c`.
Its REF-023 JSON names the exact qualified head and reports pass: 208 scoped
tables plus job children; replay/conflict, both reservation orders, cancellation,
wrong-game/paused-game denial, both failure policies, in-RPC rollback and retry,
one output, and two observed lock waiters with exactly one competing winner.

All eight automatic runs and Vercel passed. Full backend typecheck covered 28
Edge roots; smoke passed 80 tests. Owning Inventory/Crafting/Marketplace/runtime
suites passed 50/25/49/37. Retained REF-018/022 acceptance passed. The lint
comparison retained 142 findings, including 17 error-level findings, with no
additions/removals. This is disposable database proof, not a clean-database or
production certification. Local root npm test and Deno harness check passed.

Merged main `4d2c4d7f5dd81aa208cde0082fbc83d7243f1b76` passed all eight
automatic runs. [Postmerge qualification 36824004671](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36824004671)
passed again; Repository Quality `36824004588`, Beta Security `36824004662`,
Beta Pilot `36824004551`, timezone `36824004604`, Supply Chain `36824004825`,
Production Git Release contracts `36824004702`, and aggregate push `36824003408`
were successful. No production deployment was performed.

REF-023 is VERIFIED_COMPLETE with its original acceptance preserved and
verification-only architecture disposition. Debt measure remains zero production
Crafting-to-Inventory imports before/after; its one route-parser test dependency
is retained. Only this task's status/evidence changes in the backlog. REF-015/025
remain blocked and REF-019/020 paused. REF-024 is the next dependent task.
