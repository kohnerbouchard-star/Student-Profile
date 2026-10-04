# REF-033 — Pure Story Contract preparation

Status: IN_PROGRESS; no merge, runtime or release completion credit.
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
