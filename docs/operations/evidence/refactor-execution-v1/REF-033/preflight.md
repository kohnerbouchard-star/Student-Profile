# REF-033 — Pure Story Contract preparation

Status: IN_PROGRESS; no merge, runtime or release completion credit.
Base: `725235c931db65b984ed557b1ecae3d175f788fe` (REF-032 closeout #843).
Dependencies REF-030/REF-032 are VERIFIED_COMPLETE. All 50 IDs/dependencies
remain stable; 38 completed, two blocked and ten planned at preflight.
No competing REF-033 branch/PR was found. Owner: ARCH-209/ARCH-300.

## Locked scope

One family: move `buildContractCreateInput` and its two exclusive payload
readers to `prepareStoryContractEffect` in the proposed pure preparation owner.
Eight editable paths, below the ticket's ten-file and 400-semantic-line limits:

- `backend/src/domains/storylines/services/storyEffectEngine.ts`
- `backend/src/domains/storylines/services/prepareStoryEffects.ts`
- `backend/src/domains/storylines/services/storyEffectEngine.test.ts`
- `docs/operations/evidence/refactor-execution-v1/REF-033/preflight.md`
- `docs/roadmaps/refactor-execution-v1/tasks/REF-033.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-033 entry only)
- `docs/operations/contracts/player-cross-cutting/pr-NUMBER.json` (actual draft ID)
- `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` (generated)

Protect every other source, migration, SQL/RPC, package, workflow, release hold,
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
Extend the registered engine test for frozen inputs, complete descriptor parity,
validation-before-write, unavailable dependency precedence and writer failure.
Run Story/decision, World runtime, Contract lifecycle, economic invariants,
Player story-decisions/story-delivery and shared VALIDATION commands.
Existing PR workflows triggered by the generated inventory provide disposable
REF-030 submission/race and affected Business qualification. Static/fake-writer
checks are not database acceptance. Retain exact head, command and CI evidence;
missing qualification blocks completion. No task is complete before merged proof.

Rollback: revert this extraction and its exact call site; preserve later fixes.
