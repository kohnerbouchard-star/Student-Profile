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
  are documentation-only. Final delivery commit/tree are recorded in the
  accompanying local patch/handoff artifact; no PR, push, merge or deployment.
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
directory. Publication, hosted checks and live qualification were not run.

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

No hosted CI, database replay, browser journey, deployment or live qualification
is claimed. There is no runtime, UI or database change requiring a new local
hosted-service qualification. Publication and its exact-head CI/authority checks
remain a separate next step after local qualification and parent review. Do not
mark this item or parent ARCH-402 `VERIFIED_COMPLETE` while unmerged.
