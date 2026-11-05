# Test-domain-boundaries v1 scope and qualification

- Item: `ARCH-402-TEST-BOUNDARIES-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; local implementation, required checks and
  independent final review passed, with the limits below.
- Owner branch: `refactor/test-domain-boundaries-v1`.
- Isolated checkout:
  `/Users/kohnerbouchard/Documents/Codex/2026-11-05/task/Student-Profile`.
- Fetched base/main: `d3ed3208518c813d041813a42cc85993d5b8d66a`.
- Base tree: `5309e07916de5a62a3dab0d5e74e5f96aa25dc1e`.
- Implementation head: `e500ea6091ef83c53240db427e8644e270c045c4` (tree
  `b882bbe33dd6f7f8076cbe55498458211b3b496a`). Subsequent qualification records
  through the first local delivery are documentation-only; publication adds the
  verification manifest below. Reviewed local delivery head is
  `9ba0b80f3faf3629c0cc6c7845e1c7a5053d4ad3`, tree
  `18b5634f7b9b7697aa54e2a24055f9861502facd`. Draft
  [PR #911](https://github.com/kohnerbouchard-star/Student-Profile/pull/911) now
  owns publication and exact-final-head hosted qualification; no merge or manual
  deployment is authorized.
- Tooling: Node `22.23.1`, npm `10.9.8`, Deno `2.9.3`; frozen root/backend
  installs with lifecycle scripts disabled. Tests run with hosted
  database/service credentials removed from the child environment.

## Ownership and source-status reconciliation

Fresh main and the 20 open PRs were inspected. No existing branch owns this
exact test-boundary cleanup; the requested branch did not exist remotely. Draft
#888 remains at `1b350848b00140d1b1069615afc2ea8a0de4b49a`, with Dashboard,
Stocks runner and Story-loop overlap. Preserve main and acquire no donor code.
The legacy compatibility migration is a separate worker/branch; reconcile only
the shared ledger/inventory union before publication. No acknowledgement or
ownership transfer is inferred.

GitHub's read-only PR record confirms #910 merged on 2026-11-05 as the exact
base above. The beta ledger is reconciled for source status only. No CI rerun,
post-merge qualification, hosted runtime test or live certification was
performed for #910 here; historical diagnostics, predecessor holds and release
gates remain.

## Exact changes

Meaningful implementation:

1. Change only the two-name type import in
   `backend/src/domains/storylines/services/econovariaStorylineLoopSmoke.test.ts`
   to existing `../../game-dashboard/publicRealtime.ts`.
2. Append that existing test to `.github/workflows/story-replay-safety.yml`,
   retaining the original allow-read list, all existing test arguments, filters,
   source checks, permissions and gates.

Evidence and registration:

3. [Classification](../../../architecture/econovaria-test-boundaries-v1.md): all
   48 literal consumer/target declarations across ten suites, two cross-domain
   bare registration edges, owning runners and preserved assertions.
4. This scope record.
5. Bounded Scope Intake entry and #910 source-status correction in
   `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`.

Generated evidence, separately listed:

6. `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`:
   one target-string correction, no count/schema/scanner/ceiling change.

No other test file or production source, export, package/lock, SQL, RPC,
dependency, UI, permission or release-policy change is included.

## Qualification

All eight exact-base commands passed before editing. Candidate runs use the same
commands, frozen locks and permissions, with only the approved Story Replay
argument appended. JUnit reports compare expanded identities, including
loop-generated cases and transitive bare registrations:

| Command/suite                                                         | Base passed | Candidate passed | Removed identities | Skipped |
| --------------------------------------------------------------------- | ----------- | ---------------- | ------------------ | ------- |
| Direct Dashboard                                                      | 41          | 41               | 0                  | 0       |
| Direct Story loop                                                     | 1           | 1                | 0                  | 0       |
| Crafting bridge/decorator/rate dispatch                               | 10          | 10               | 0                  | 0       |
| Player capabilities                                                   | 11          | 11               | 0                  | 0       |
| Notifications                                                         | 40          | 40               | 0                  | 0       |
| Stocks/calendar, including imported engine/cursor/Story factory tests | 77          | 77               | 0                  | 0       |
| Economic invariants, including imported Staff adjustment tests        | 25          | 25               | 0                  | 0       |
| Full Story Replay with original read allowlist                        | 94          | 95               | 0                  | 0       |

These are 299 base and 300 candidate test **executions** across commands, not
unique tests. The only added normal-suite identity is the existing
`econovaria demo storyline loop resolves cutscene ledger and contract effects idempotently`.
No identity was removed, skipped or replaced.

Required and supporting local checks passed:

- Root `npm test`, including high-priority boundaries, architecture/inventory,
  legacy-runtime and the remaining root audit/source contracts.
- Backend `typecheck:all`: TypeScript and all 28 Edge roots; final cached run
  passes within the sandbox.
- Complete backend `smoke`: 1,422 Deno test executions plus 18 Node
  neutral-config checks; no Deno failures or ignored tests and no Node skips.
- Both the unchanged Story workflow source check and amended full test command.
- REF-003 candidate audit, preserving all three immutable package bindings;
  Player cross-cutting authority regression 16/16; repository secret scan;
  focused formatting; `git diff --check`.
- Byte comparisons: the exact import-only edit, exact workflow append, exact
  inventory target replacement, all nine other inventoried test files,
  production source, package/locks, scanner and ratchet source/baseline
  unchanged.

Qualification limits, kept visible:

- Initial backend typecheck/smoke attempts failed on sandbox DNS while fetching
  frozen esm.sh dependencies. Download-only cache preparation resolved them; the
  full final commands passed without changing source, pins or locks.
- Root `npm test` retains one explicit platform skip:
  `release builder produces identical complete browser and Edge archive hashes`,
  because GNU tar is unavailable on this macOS host. No release source changed;
  its Linux CI qualification remains outstanding.
- Optional focused `deno lint` returns the exact same two diagnostics on base
  and candidate: unused `JsonObject` at line 1 and the fake async
  `readMarketOpenState` without await at line 101. Neither rule nor fixture was
  changed or suppressed. This is inherited lint debt, not a passing lint result.
- Independent read-only review of the actual complete six-file diff, final
  documentation and raw evidence found no actionable findings and no remaining
  review blocker. It independently checked classifications, byte preservation,
  registrations, JUnit identities and qualification totals. Accepted reviewer
  setting: `gpt-6.1-sol` / `max`. No corrective code changes were required. The
  executor does not expose the primary worker's model ID, so no primary-model
  selection is asserted.

Raw commands, logs, JUnit reports, identity comparison and preservation results
are retained outside the commit under the isolated task's `verification/`
directory. The initial local qualification did not include publication, hosted
checks or live qualification.

## Metrics and completion boundary

Source count remains 1,311; lexical cross-domain declarations remain 70 (22
production, 48 test), comprising five public and 43 integration test
declarations after correction. Foreign infrastructure imports remain zero. All
other measured counts and architecture ceilings remain unchanged. The two
existing bare cross-domain registration edges are documented but not added to
the metric.

`backend/package.json` remains blob `8f8fe07cb0e446a121fcbc519cb692447c2e1b68`;
the scanner and ratchet source/baseline remain byte-identical. The nine
unchanged inventoried suites and the loop's entire executable body/assertions
remain byte-identical to base.

## Draft publication and final-head gates

Publication of the six reviewed files plus the actual-PR-numbered manifest is
now authorized.
[Draft PR #911](https://github.com/kohnerbouchard-star/Student-Profile/pull/911)
targets refreshed main `d3ed3208518c813d041813a42cc85993d5b8d66a`; no base
change or legacy-worker code/inventory was acquired. The seventh edited file is
`docs/operations/contracts/player-cross-cutting/pr-911.json`. Its exact-path
allowlist has only the seven edited files plus the two established verifier/test
files locked read-only. Existing authority records are unchanged. The three
production/secret flags remain false.

The new manifest preserves every predecessor core, required and critical check,
adds all applicable existing PR workflow names and non-guarded critical jobs,
and retains Player Multiplayer and Load E2E as explicit final-head
qualification. The latter has no matching automatic path for this test-only
diff; its existing dispatch runs only disposable CI services on this branch. No
workflow, job, permission, retry budget or test assertion is altered to obtain
qualification.

Static selection identifies 29 workflows on opened/synchronize PR events, plus
the retained explicit Player Multiplayer/Load dispatch. GitHub's dynamic CodeQL
checks are also tracked. Branch Hygiene is closed-event-only and is not run.
Expected guarded job skips are the manual release authorization, manual live
parity, manual staging preflight and PR657-only inventory materialization; these
do not qualify any hosted runtime or release. Repository Quality must execute
the previously skipped GNU-tar deterministic-release test on Linux.

Initial runs for the reviewed local head are historical diagnostics, not final
qualification. Final head/tree, complete workflow/job/check identities and
terminal outcomes are retained in the PR qualification record outside the code
diff and reflected in the PR description. At this source checkpoint those hosted
results are pending; no Linux, database/load, live or merged-main qualification
is inferred. Keep this item `IMPLEMENTED_NOT_MERGED` and parent ARCH-402 open.
Next: independently review the bounded publication metadata and manifest, pass
actual-PR authority and focused preservation checks, then finish all applicable
final-head hosted checks. No merge or deployment is authorized.
