# Test-domain-boundaries v1 scope and qualification

- Item: `ARCH-402-TEST-BOUNDARIES-001`.
- Status: `IN_PROGRESS`; local implementation, qualification pending.
- Owner branch: `refactor/test-domain-boundaries-v1`.
- Isolated checkout: `/Users/kohnerbouchard/Documents/Codex/2026-11-05/task/Student-Profile`.
- Fetched base/main: `d3ed3208518c813d041813a42cc85993d5b8d66a`.
- Base tree: `5309e07916de5a62a3dab0d5e74e5f96aa25dc1e`.
- Implementation head: pending local commit; no PR, push, merge or deployment.
- Tooling: Node `22.23.1`, npm `10.9.8`, Deno `2.9.3`; frozen root/backend installs with lifecycle scripts disabled. Tests run with hosted database/service credentials removed from the child environment.

## Ownership and source-status reconciliation

Fresh main and the 20 open PRs were inspected. No existing branch owns this exact
test-boundary cleanup; the requested branch did not exist remotely. Draft #888
remains at `1b350848b00140d1b1069615afc2ea8a0de4b49a`, with Dashboard,
Stocks runner and Story-loop overlap. Preserve main and acquire no donor code.
The legacy compatibility migration is a separate worker/branch; reconcile only
the shared ledger/inventory union before publication. No acknowledgement or
ownership transfer is inferred.

GitHub's read-only PR record confirms #910 merged on 2026-11-05 as the exact base
above. The beta ledger is reconciled for source status only. No CI rerun,
post-merge qualification, hosted runtime test or live certification was performed
for #910 here; historical diagnostics, predecessor holds and release gates remain.

## Exact changes

Meaningful implementation:

1. Change only the two-name type import in `backend/src/domains/storylines/services/econovariaStorylineLoopSmoke.test.ts` to existing `../../game-dashboard/publicRealtime.ts`.
2. Append that existing test to `.github/workflows/story-replay-safety.yml`, retaining the original allow-read list, all existing test arguments, filters, source checks, permissions and gates.

Evidence and registration:

3. [Classification](../../../architecture/econovaria-test-boundaries-v1.md): all 48 literal consumer/target declarations across ten suites, two cross-domain bare registration edges, owning runners and preserved assertions.
4. This scope record.
5. Bounded Scope Intake entry and #910 source-status correction in `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`.

Generated evidence, separately listed:

6. `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`: one target-string correction, no count/schema/scanner/ceiling change.

No other test file or production source, export, package/lock, SQL, RPC,
dependency, UI, permission or release-policy change is included.

## Qualification

All eight exact-base focused commands passed before editing: Dashboard 41,
Story loop 1, Crafting bridge/decorator/rate dispatch 10, Player capabilities 11,
Notifications 40, Stocks/calendar 77, economic invariants 25 and Story Replay 94.
All had zero failures and zero skipped test identities. JUnit reports capture
expanded registrations and loop-generated names rather than lexical test counts.

Candidate focused runs, identity comparison, required root/backend gates,
formatting, secret scan, immutable-package/runtime checks and independent final
review are pending. Raw commands, logs and JUnit reports are retained outside the
commit under the isolated task's `verification/` directory.

## Metrics and completion boundary

Source count remains 1,311; lexical cross-domain declarations remain 70 (22
production, 48 test), comprising five public and 43 integration test declarations
after correction. Foreign infrastructure imports remain zero. All other measured
counts and architecture ceilings remain unchanged. The two existing bare
cross-domain registration edges are documented but not added to the metric.

`backend/package.json` must remain blob `8f8fe07cb0e446a121fcbc519cb692447c2e1b68`;
the scanner and ratchet source/baseline must remain byte-identical. The nine
unchanged inventoried suites and the loop's entire executable body/assertions
must remain byte-identical to base.

No hosted CI, database replay, browser journey, deployment or live qualification
is claimed. There is no runtime, UI or database change requiring a new local
hosted-service qualification. Publication and its exact-head CI/authority checks
remain a separate next step after local qualification and parent review. Do not
mark this item or parent ARCH-402 `VERIFIED_COMPLETE` while unmerged.
