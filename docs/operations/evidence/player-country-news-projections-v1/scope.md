# Player Countries/News projection extraction

Roadmap item: `ARCH-501/502-PLAYER-COUNTRY-NEWS-PROJECTIONS-001`.
Status: `IMPLEMENTED_NOT_MERGED`; published draft candidate, final-head CI pending. Parent ARCH-501/502 remain open.
Owner branch: `refactor/player-country-news-projections-v1`.
Baseline: `4226ca9391df4cafa2c3c3004abd5c5ba552c48d` (merged PR916).
Implementation commit: `9aecc7f47ee7a45797d2267766c1bf92b5fe59f3`.
Independent final source review: no actionable findings.
Draft [PR #919](https://github.com/kohnerbouchard-star/Student-Profile/pull/919) targets main.
Reviewed local head `147943a0f06d0e19fd8949433f1dcf25d960712b` was pushed after
explicit owner approval; this actual-number publication amendment adds no runtime change.

## Bounded ownership

The owner requested coordinated GPT-6.1/max large-file refactoring after the
original four PRs merged. One integrator owns runtime edits; independent agents
own characterization and read-only review. Current-main/open-PR inspection found
no competing Countries/News extraction owner. Loans #918, CSS #624, Dashboard
#888 and every production hold remain separate.

- `player-terminal/src/api/country-news-read-model.js`: the eleven existing
  Countries, Market News and World News projection/relation helpers.
- `player-terminal/src/api/read-model-values.js`: only the five value readers
  shared by the extracted family and retained API projections.
- `player-terminal/src/api/read-model.js`: imports the two leaves; retains its
  public exports, all other function bodies and bootstrap/merge orchestration.
- `player-terminal/tests/country-news-projection-contract.mjs`: sixteen
  baseline-characterized groups through the three original public functions.
- `player-terminal/package.json`: one additive test script and verify stage.
- Generated architecture inventory: two added source files and the reduced
  read-model line count, with every debt count and ceiling unchanged.
- This scope record and the required roadmap intake/source-status correction.
- Actual-PR authority `docs/operations/contracts/player-cross-cutting/pr-919.json`: the
  nine changed paths plus two unchanged read-only verifier/test locks. The 117
  required and 86 critical check arrays are identical to merged PR916.

There is no UI, route, RPC, migration, backend, dependency/lock, authorization,
economic, freshness-owner, shared workflow or production change. No duplicate
cache, generic utility collection or new public read-model API is introduced.

## Preservation evidence

The public exports remain `readSessionContext`, `normalizeTerminalBootstrap`
and `mergeTerminalRead`. All sixteen moved function bodies match the baseline
after export/import removal and alpha-normalization of private default-value
parameters. The entire retained module matches after removing the new imports
and the three extracted source ranges. All 53 existing package scripts and all
50 existing verify stages remain unchanged; the new stage occurs once.

Characterization deliberately retains the existing Market/World differences in
case, string coercion and category insertion; last-ticker-wins lookup and duplicate
relations; strict first-player-country selection; default numeric/date formatting;
malformed-row and Symbol TypeErrors; economy/tick reference identity; new country
shells with shared nested fields; and dashboard merge's existing nested mutation.
Market/dashboard reads still do not relink Countries as a side effect. These are
preservation assertions, not an endorsement or repair of the established behavior.

The unchanged inventory scanner treats any `fallback` token as a compatibility
marker. Merely relocating ordinary default parameters would count two additional
files at the existing 210-file ceiling. The moved private parameters alone are
renamed to `defaultValue`, with alpha-equivalence proof and independent review.
No branch, fallback behavior or compatibility path is deleted; original-file
identifiers, scanner, classification rules and ceilings remain unchanged. This is
not compatibility-debt retirement or a reduction in the oversized-file count.
Scanner lines: read-model 1,114 to 929; new family 167, value readers 29.
Source-file count: 1,315 to 1,317; every measured debt count stays flat.

## Focused qualification

Repository-pinned Node 22.23.1 is used for the recorded local checks.

- Exact baseline from `git show`: characterization 16/16 passes through a
  one-off in-memory import substitution. No baseline copy or git invocation is
  part of the committed test runtime.
- Candidate: `npm --prefix player-terminal run country-news-projections` 16/16.
- Retained World News route, World runtime, Student-Profile adapter/runtime,
  connected-read gating, Banking read model and Store purchase flow all pass.
- `npm --prefix player-terminal run check`: 234 modules pass syntax checks.
- Generated inventory and unchanged architecture v2 ratchet pass; its seam
  register, all debt ceilings and all zero-tolerance checks remain satisfied.
- High-priority boundary ratchet: 80 checks pass. Secret scan and whitespace pass.
- Independent final review: no actionable findings; 6,051 baseline/candidate
  graph/value/error comparisons pass under Node 22.23.1. The reviewer separately
  passed baseline and candidate characterization (16/16 each), verified all
  31 retained bodies, additive test registration, eight-path scope and ancestor
  merge evidence, and reproduced the exact generated inventory in memory.

These focused checks are not a full repository, Backend/Edge, browser, connected
or CI qualification claim. No whole-suite reruns, hosted workflow dispatch, hosted
application-state reads/writes, deployment or merge occurred. Owner-approved draft
publication starts automatic PR checks. The first published head precedes the
actual-number manifest and is not the final qualification target; record automatic
check results only against the final amended head. Required/critical arrays, all
existing scopes and production holds remain unchanged.

Initial publication head `147943a0` failed Admin Business source run
`42555794156`, job `128961068934`, with `Player authority identifier is not
bound to this pull request.` The inspected log stops at authority validation
before its tests. This precedes the actual-PR919 manifest and remains historical
failure evidence; it does not qualify the final amended head.

## Next action and rollback

The reviewed implementation is committed at the SHA above. Independently review
the actual-PR metadata amendment, publish it and qualify its exact final head.
Return draft PR919 for parent review; do not merge, mark ready or deploy. Broader Player coordinator extraction is a separate
tranche, not part of this pilot. Rollback is to revert this bounded source/test
change and its registration; no data or environment rollback is involved.
