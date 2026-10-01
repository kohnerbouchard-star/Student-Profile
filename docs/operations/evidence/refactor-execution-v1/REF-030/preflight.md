# REF-030 — Contract submission adapter

Status: VERIFIED_COMPLETE (bounded repository seam). Original base: `c799110e2d89d76c7d013ae49adce50c22b6c81e`.
Dependency REF-029 is verified. Maps to ARCH-208/ARCH-400; risk R3.
Open-owner recheck 2026-10-01: #736 `8070f58d4145951d8aee3e74a2b1e00d90c54385`
and #668 `faaf908bdd5131b451c7e87e91ed4991ad8f839d` remain unchanged.
No submit owner competes; #790 owns independent World tests.

## Explicit child split and edit boundary

Qualification plus extraction exceeds the 400 semantic-line review threshold.
The approved split preserves all 50 parent IDs; parent completion requires both:
- REF-030a: real disposable PostgreSQL baseline qualification. Edit only
  `scripts/ref-030-submission-acceptance.ts`, the existing
  `.github/workflows/ref-018-attendance-qualification.yml`, these task/evidence
  records, REF-030's backlog entry, and a PR-specific authority if required.
- REF-030b: after accepted baseline, mechanically move bounded body parsing and
  Story classification/validation to internal `playerContractSubmissionAdapter.ts`;
  edit its existing HTTP caller and registered submission tests, evidence/backlog,
  exact PR authority and generated inventory only. No package edits.
Each child stays below twelve meaningful files and 400 semantic lines.
Global ledger, SQL/migrations/triggers, auth/context, eligibility, repository
writes, roleplay renderer, browser, dependencies and production remain protected.

## Source reconciliation and invariants

Older ticket wording suggests separate Contract/Story dispatch. Current source
has one authoritative `upsertPlayerContractProgress` for BOTH modes. Story capture
is the existing AFTER trigger `capture_player_story_decision_v1`; roleplay is
optional best-effort AFTER commit. No second Story write is permitted.
Body parsing precedes session lookup; Story semantic validation follows auth and
availability, before progress lookup. Null/absent evidence becomes an empty object.
Whitespace is trimmed for validation only; progress stores original payload.
SQL normalizes the captured option/rationale. Same-option retry can update rationale;
different-option retry fails atomically. There is no request nonce/receipt to invent.
Qualification must prove actual trigger effects, same-choice retries, changed-choice
rejection, concurrent upserts and rollback, not claim mock traces are DB evidence.

Baseline local acceptance: 95 passed, zero failed with pinned Node 22.23.1,
npm 10.9.8, Deno 2.9.3 and frozen lock. Docker/psql absent locally; real DB proof
must come from the existing exact-head disposable GitHub qualification workflow.
Existing Story Replay Safety is unit/static, not a substitute. Missing proof blocks
extraction/completion. Runtime baseline failure or necessary policy change stops work.
Rollback: revert the bounded code/harness PR; never alter stored Story data.

REF-030a local qualification-source check passes using the owning neutral Deno
configuration. Root npm test, acceptance 95/95, lifecycle 1/1, architecture,
high-priority boundaries, legacy-runtime, secrets, YAML and diff checks pass.
Independent static review corrected the fixture source_type to the existing
teacher enum and strengthened race winner, rationale-edit and error assertions.
At that initial checkpoint the database had not run. Existing schema/transaction behavior is
unchanged; no clean production or hosted-runtime certification is implied.

## Accepted REF-030a database baseline

Qualification head `ef5af7d62a02ae3c45f81ab118852dcd17186f2d`, tree
`e9faeee2efa10f334302775786d40342ce8860c5`, passed all eight triggered workflows.
[Run 36844450147](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36844450147),
job `110311580486`, passed full migration replay, backend typecheck/smoke,
existing economic qualifications and the new actual submission/trigger harness.
The harness snapshots 208 game-scoped tables; both definitions, preserved raw
payload, same-choice retry, permitted rationale edits, rejected choice changes,
normal submission, cross-game isolation, renderer failure after commit, injected
post-relationship rollback/retry and both races passed. Each race observed two
real database lock waiters before releasing the held progress row.

[Artifact 11153176138](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36844450147/artifacts/11153176138)
was downloaded and independently SHA256-verified:
`a2c3764a1f772518c3493da3a6fe1c64cde187ab19f8e4f37945f1cec5b51795`.
Its source-bound qualification JSON reports pass. Lint parity preserves 142
existing findings including 17 errors, with no additions/removals; this does not
certify a clean database. Static review approved the exact tree after correcting
a test-only same-choice replay timestamp assumption. Auth context is synthetic
and injected; real hosted authentication and production are not exercised.

## REF-030a merged; REF-030b bounded extraction

Qualification PR #792 merged as `16d8e06dc0204da8bfe6ba7105d2502a771befd7`.
Accepted integrated head `5a0d1630c5478a265957259cce3b0aba5695bc11` passed
[run 36846754887](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36846754887),
job `110318613374`, including fresh actual handler/trigger races and rollback.
Artifact `11153942356` was downloaded and independently verified:
`6c3aa7f36f457989df67ab98620c2b99e5c976962654edeca7e4e8673e13cce1`.
All eight triggered workflows plus Vercel passed. Main's unrelated REF-032 BLOCKED
record and inherited release issue remain untouched.

REF-030b base is that merge. Exact runtime/test edits: existing public submission
handler, new internal submission adapter, and the two existing registered public
submission/Story submission tests. Scope records/task/backlog, PR-specific authority
and generated architecture inventory are the only additional editable paths.
Body/JSON helpers and constants move verbatim apart from exported internal names;
the classifier delegates the existing Set check. No public index export or new
command owner is introduced. Single progress write and optional renderer stay in
the original handler. User-requested comments explain sequencing and authority.

Pre-extraction characterization and post-extraction Contract acceptance both pass
99 tests (95 retained plus four table-driven tests). Cases cover null/blank bodies,
all size/depth/key/array limits, malformed transport before session/config, Story
auth/availability-before-validation, validation-before-progress, both keys and
ordinary payloads, and verbatim evidence. Existing DB harness/workflow is unchanged
and must run fresh against this extraction before merge. Production remains untouched.

Measured source split: handler 250 -> 193 lines; adapter 80 lines (net +23).
Sixty-one removed lines are mechanical helper/constant moves, not changed rules.
New characterization adds 80 test lines in already registered suites. Source-file
scan denominator 1,261 -> 1,262, Contracts files 45 -> 46. All debt/zero-tolerance
counts remain unchanged, including 99 oversized files and 52 persistence sites.
No deletion percentage or gameplay improvement is claimed. Lifecycle 1/1,
economic invariants 25/25, Player contracts-submit/story-decisions/story-delivery,
high-priority/legacy/security guards and post-extraction acceptance99 pass locally.
Independent mechanical review found no blocking source findings. Fresh full CI and
actual database qualification are still mandatory before extraction acceptance.

REF-030b candidate `ef5e1a041dd7d877f3afbbda664c059b41274618` passed fresh
[database run 36848626433](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36848626433),
job `110324727042`, through the unchanged real-handler qualification harness.
All 208-table, both-choice, retry/conflict, rationale-edit, optional-renderer,
rollback and observed-lock race assertions passed after extraction. Baseline lint
remains 142 findings/17 errors, unchanged. Downloaded artifact `11154054091` SHA256:
`0b7dfdc9b835e4f20d341d8d6a2aeaa848b88be67cf73c5e1ef6d6f380d703bb`.
Full backend checks pass in CI; local Edge/full smoke remains blocked by pinned
esm.sh download availability. Local root/architecture/authority reruns pass.
This candidate is statically reviewed; broader CI and latest-main integration
remain prerequisites, so parent completion is not yet claimed.

## Integrated extraction acceptance and merge

After REF-035 closeout, accepted head `794388fb0bd2d2f4c0782a99c422da47def397c0`
passed all 30 workflows: 65 successful check runs and five documented conditional
skips (hosted parity, unchanged-artifact authorization, inventory materialization,
staging evidence and Supabase Preview). Vercel passed. This does not convert those
skipped hosted gates into runtime certification. Parent review approved integration.
[Run 36852215086](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36852215086),
job `110336278136`, reran the complete disposable PostgreSQL qualification after
integration. The downloaded source-bound artifact `11155224566` verified SHA256
`e275ad36b8bb422cb9e97281287d9573783ce4606aa5bc01af95087808bc1886`.
All existing trigger/rollback/race/effect assertions passed; lint was unchanged.

PR #795 merged as `7f8ce00cab3cdf303c37332dcbbceb96d2163582`. Accepted head and
merged main have identical complete tree `ace35c8aebe994197c520d53745caf3f07a551fd`.
Combined local Contract acceptance99, Messaging37, root tests, exact authority and
deterministic inventory pass. Relative to integrated REF-035 main, source files
are 1,263 -> 1,264; Contracts remains 45 -> 46 and debt counts are unchanged.
Both children preserve the original mutation, trigger and postcommit authority.


## Verified merged-main closeout

At `7f8ce00cab3cdf303c37332dcbbceb96d2163582`, all 17 triggered workflows are
terminal: 16 successful and one conditional Edge convergence skip. Check runs are
35 successful/seven conditional skips; no failed/pending job remains. Skips cover
hosted parity/release publication, staging/production convergence and PR-only
dependency review. No standalone main Vercel status exists; accepted PR preview
success is not represented as a new production deployment.

Merged-main [run 36853726296](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36853726296),
job `110341152160`, again passed real application/upsert/trigger replay, rollback,
both races, full backend checks, migration replay and unchanged lint. Downloaded
artifact `11157820769` verified SHA256
`fad0656e39358b12cc3c43b88e4b34826c4d0af87e886b344e86b952a43decf1`.
Its JSON identifies the exact merged SHA and all required checks passing.

Both REF-030 children and this bounded parent seam are VERIFIED_COMPLETE. No
runtime, SQL, policy, generated inventory or authority is edited in this three-doc
closeout. All other parent records remain unchanged, including blocked REF-032 and
verified REF-035. No unresolved blocker remains for this seam; hosted authentication,
production release health and pre-existing lint findings retain their separate gates.
Next numbered task REF-033 remains gated by REF-032; independently owned REF-036
can continue only under its own qualification scope. No successor is implemented here.
