# REF-033 — Pure Story Contract preparation

Status: VERIFIED_COMPLETE — scoped merged-source qualification; parent closeout proposal.
The preflight and candidate observations below are retained history; the closeout supersedes pending source/merge statements.
Initial base: `725235c931db65b984ed557b1ecae3d175f788fe` (REF-032 closeout #843).
Integrated main: `d2aa78c8ddd25d086db08dadc66e7af47ec598bd` (#842); regenerated inventory preserves both owners.
Dependencies REF-030/REF-032 are VERIFIED_COMPLETE. All 50 IDs/dependencies
remain stable; 38 completed, two blocked and ten planned at preflight.
No competing REF-033 branch/PR was found. Owner: ARCH-209/ARCH-300.

## Locked scope

One family: move `buildContractCreateInput` and its two exclusive payload
readers to `prepareStoryContractEffect` in the proposed pure preparation owner.
Nine editable paths, below the ticket's ten-file and 400-semantic-line limits:

- `backend/src/domains/storylines/services/storyEffectEngine.ts`
- `backend/src/domains/storylines/services/prepareStoryEffects.ts`
- `backend/src/domains/storylines/services/prepareStoryEffects.test.ts`
- `.github/workflows/story-replay-safety.yml` (one test registration only)
- `docs/operations/evidence/refactor-execution-v1/REF-033/preflight.md`
- `docs/roadmaps/refactor-execution-v1/tasks/REF-033.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-033 entry only)
- `docs/operations/contracts/player-cross-cutting/pr-844.json`
- `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` (generated)

Protect every other source, migration, SQL/RPC, package, workflow setting, release hold,
credential, deployment setting, Player/Admin UI and the global beta ledger.
No hosted database or capture action. Parent retains review/merge authority.

## Characterized boundary

`storyEventExecutionPlan` calls the existing effect executor in its existing order;
only `contract_unlock` preparation moves. Inputs are game ID, event ID, supplied
`now`, and the existing readonly parsed effect. No clock read, randomness,
relationship calculation, external inference, notification or persistence belongs
in preparation. The descriptor preserves payload references, precision, trimming,
validation order, authored prose/defaults and metadata override precedence.

The executor checks absent Contract dependency before preparation, then calls
`SupabaseStoryContractWriter.createGameSessionContract` once. That unchanged
writer inserts `game_session_contracts`; SQLSTATE 23505 follows the existing
game/event/key-scoped lookup to return the previous receipt. This is one existing
insert transaction, not a claim that the entire multi-effect sequence is atomic.
No second reward/ledger authority or global transaction is introduced. Decision
submission/decline, roleplay rendering, conditions, frozen plans and leases retain
their current owners and tests. Failures preserve existing failed receipts.

## Validation plan and baseline

Base focused Deno engine/writer/replay/lease suite: 18 passed, zero failed.
Register the pure preparation test in Story Replay Safety for frozen inputs, complete descriptor parity,
validation-before-write, unavailable dependency precedence and writer failure.
Run Story/decision, World runtime, Contract lifecycle, economic invariants,
Player story-decisions/story-delivery and shared VALIDATION commands.
Existing PR workflows triggered by the generated inventory provide disposable
REF-030 submission/race and affected Business qualification. Static/fake-writer
checks are not database acceptance. Retain exact head, command and CI evidence;
missing qualification blocks completion. No task is complete before merged proof.

Rollback: revert this extraction and its exact call site; preserve later fixes.

Draft: [#844](https://github.com/kohnerbouchard-star/Student-Profile/pull/844).
Local candidate: focused 21/21; baseline/extracted differential 32/32; World
50+11, Contract lifecycle 1, Contract acceptance 99, economic invariants 25 pass.
Player story-decisions, story-delivery and full verify pass. These are synthetic
source/fixture checks; exact-head CI/database qualification remains pending.

Scope refinement: the engine test is 487 lines; keep it unchanged rather than
exceed the existing 500-line ratchet. Only the owning test command gains a path.

Shared architecture/boundary/legacy/secret audits and root `npm test` pass.
Local full Edge typecheck/smoke are BLOCKED by the esm.sh proxy tunnel; the
existing Backend Typecheck PR workflow runs both on the candidate source.
Expanded Story sweep: 148 pass, two fail; untouched base reproduces both
(context cash expected 1250/actual 0; demo loop expected HTTP 200/actual 500).
These failures are retained, not fixed or counted as passes by this extraction.
Engine shrinks 856 to 778 lines; REF-033 adds two source/test files,
29 domains and 100 oversized files unchanged. Sole production caller remains
`executeContractUnlockEffect`; external model and persistence owners are unchanged.


## Scoped source closeout — 2026-10-04

Implementation [#844](https://github.com/kohnerbouchard-star/Student-Profile/pull/844)
head `cc63314ac8882882a1ccbaa167b4e78ebb7b6891` was independently accepted and
merged as `2fbcc0ab996243bec5406e8ddcbb584b6b2a6953`. Both complete Git trees are
`ded676e9560ca5c9c69832986883abb210a22367`; no different application is substituted.
The PR synthetic merge `b3e723d53327233a811ff1bc08c0fbc1c00a2855` has that same tree.
This closeout changes exactly this evidence, task REF-033 and its backlog entry.
All other 49 entries, 50 IDs and dependency edges remain unchanged. Source is
already merged; formal main count stays 38 until this proposal merges, then 39.
No global beta/runtime/release certification or hosted acceptance is claimed.

### Qualified implementation and exact-source evidence

The only application change moves the existing Contract descriptor and exclusive
payload validators to `prepareStoryContractEffect`; the sole executor caller,
writer, guard/validation order, optional/default outcomes, payload precision and
reference identity, metadata override, supplied time, effect ordering and replay
receipt authority remain unchanged. The new pure test runs in the owning Story
Replay Safety command. No SQL, RPC, effect kind, route, reward, relationship,
notification, external model call, clock/random read or second writer was added.
The source PR had nine paths, +345/-90 = 435 raw changed lines; exactly 41 blank
lines excluded gives 394 nonblank lines, including all comments, moved code,
tests, evidence and generated inventory. The ninth path was one test registration:
the old engine test stayed at 487 lines rather than violating its 500-line limit.
Engine size fell 856 to 778; source/test inventory 1272 to 1274; 29 domains and
100 oversized files unchanged. No ceiling changed and broader debt remains.

At qualified source, all 29 workflow runs succeeded: 64 successful checks,
five expected skips and successful Vercel status; no failure or pending check.
The skips were hosted parity, historical inventory materialization, artifact
promotion authorization, staging dispatch evidence and Supabase Preview.
Required backend, Story, database/race and Business gates all actually executed.
Canonical FX Authority V1 targets historical PR671/base branch and did not run;
no credit is assigned to it. Local engine/World-FX/runner checks passed 26 cases.

| Required proof | Run / job | Observed result |
| --- | --- | --- |
| Story replay/lease/new preparation | 37176484407 / 111360033327 | 67 PASS |
| Full backend typecheck/smoke | 37176484432 / 111360033356 | Both stored statuses 0; 28 Edge roots; 1357 PASS / 0 FAIL in 27 Deno summaries |
| Real REF-030 submission/database/race | 37176484457 / 111360035006 | Exact sourceSha; commit/retry, rationale-edit/conflict, renderer failure, rejected submission, rollback/retry and both races PASS; two observed lock waiters in each race |
| Business source | 37176484507 / 111360262432 | PASS |
| Business database | 37176484507 / 111360262274 | Retained C0/C1/C4/Store replay, precision, rollback, concurrency, ordering and isolation PASS |
| Business Chromium | 37176484507 / 111360262296 | 12 PASS |
| Business connected | 37176484507 / 111360262317 | Disposable two-game settlement/replay/isolation/privacy PASS; no console/page errors |

Actual artifact ZIPs were downloaded, inspected and SHA256-verified:
- Typecheck `11293402971`: `b6329a0de0cec7d13a78dceadf24706a8f60089a4b45d35a3661c54816dd7e36`.
- Smoke `11293737395`: `602e1c0103ccf0e5cc87a7147fc1d49e0d97903e7db1cdd1a9f9e5da152399c2`.
- REF-030 inside `11293822277`: `8b9d682271620b4fdc27ac2a7db01d98b45343849764d2ad474787553b03bebf`.
- Business browser `11294001711`: `3f8a9180a9049affa61c05193cf9d88eaae3ea28dc8230a030b5598c78873186`.
- Business connected `11293612605`: `6448c56c37f4a6b4ff674e76389fdaddb185ed4dd27c36140e5e24c33497c682`.
- Business advisors `11293802484`: `729556887a47930dc0e1c0d0c6a081bd82d6a46b5ef8220acfd282dd084df653`; substantive database results also checked in the job log.

The existing local checks above used Node 22.23.1 / npm 10.9.8 / Deno 2.9.3 and
frozen locks. Local full Edge/smoke esm.sh download failure remains BLOCKED history;
actual qualified-source CI supplies those results, not a claimed local pass.
The 32-case differential driver/output, exact commands and SHA256s are retained
verbatim in #844's "Independently reproducible retained qualification" section.
It compares original `725235c9` and qualified `cc63314a` for eight payloads across
absent/success/failure/repeated fake writers; it is not database acceptance.
The independent parent review additionally reported mechanical-source parity and
610 supplemental parity cases; the retained required gates above supply acceptance.

### Fresh merged-main verification

At exact merged main `2fbcc0ab996243bec5406e8ddcbb584b6b2a6953`, Story Replay Safety
`37177617040` / `111363438218` passes all 67 tests. Backend Typecheck
`37177616993` / `111363438072` passes enforced full typecheck and smoke.
Downloaded typecheck artifact `11293629427` stores exit 0 and all 28 Edge roots,
SHA256 `cf78b4e6c47a46f788313898615bff160a98e6748a1073b640075b2638e324e2`.
Smoke artifact `11293704465` stores exit 0, 27 Deno summaries, 1357 PASS / 0 FAIL,
SHA256 `0a41c83984015b174c8cab5947fae13e13cdb141d422ea4438b93cdd3b54bc77`.
These are actual fresh-main results, distinct from the qualified PR evidence.
Other automatic main checks and this documentation PR's applicable checks must
be terminal before parent acceptance; their final status is retained on the PR.
Docs-only closeout validation: root `npm test`, secret scan, links, JSON, stable
50 IDs/edges, unchanged other 49 task entries and `git diff --check` pass.
No application test is repeated merely because these three documents change.

### Inherited failures and protection boundary

Additional whole-Story-directory discovery had 148 passes and two failures:
`player story context repository builds contexts for active players` expected
cash 1250 but got 0 (fixture omits currency); `econovaria demo storyline loop
resolves cutscene ledger and contract effects idempotently` expected HTTP200 but
got 500 (inherited demo RPC fixture). Both reproduce on untouched `725235c9`;
paired targeted execution gives two passes/two failures on base and `cc63314a`.
The tests/context repository are byte-identical across base, integrated `d2aa78c8`
and candidate. Neither failing test is registered in required smoke/Story Replay
Safety; these are retained defects, not fixes or passing results of REF-033.
Exact commands, sanitized full logs and hashes are retained in #844. No test,
assertion, runtime fallback or required gate was removed or weakened to pass.

At merged main, all three held workflows are byte-identical to `d2aa78c8`:
`database-replay.yml`, `phase15-controlled-staging.yml` and
`phase15-controlled-production.yml`. The nine positive/negative U1 hold contracts
plus release-integrity tests pass (19 tests). No live SQL, capture, credential,
security setting, deployment command or release-hold restoration occurred.
This proposal does not restore hosted runtime or change `releaseCertificate:false`.

Parent review and applicable docs checks/merge finalize the ledger proposal.
Next original scopes are REF-034 and REF-046 after closeout verification; any
parallel planning must first prove disjoint ownership. No successor source work
is included here. Rollback reverts only these three closeout paths.
