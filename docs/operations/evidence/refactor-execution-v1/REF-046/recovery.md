# REF-046 recovered characterization — 2026-10-08

Status: IN_PROGRESS; parent acceptance BLOCKED pending executable database proof.
Exact source base: `9634ff92d8e28fd29623f7f4db41ff9a797e3171`.
Recovered local commit: `f5255b90df025148788f5ad362380ceb816f9d57`.

The sibling preflight.md is preserved verbatim as historical 2026-10-04 evidence.
Its earlier proposal is superseded by the bounded child plan below; its tests
are historical, not current-head CI. No runtime rewiring is necessary: the
entrypoint and scheduler repository still delegate to the established atomic RPC.
The current test blob matches the original parent exactly, so the saved four-case
addition applies without reimplementation. No new production source changes.

## Ownership and access

GitHub plugin reads verified current main, all eleven open PR changed-file lists,
and REF-032/033 completion. No open PR owns the two recovered paths. PR668 owns
backend/package.json; PR736/668 own inventory; leave them untouched. PR620 also
changes the proposed ref-018 qualification workflow, so registration there requires
parent coordination. No workflow change is included in this characterization PR.

The user explicitly selected and verified the GitHub plugin and authorized this
draft publication. Its repository reads succeed. The workspace CLI previously
returned Forbidden; it has not been retried or declared repaired. No credentials
or proxy settings changed. Local Docker info was denied at the socket boundary;
no database has been started or queried during recovery.

## Scope and acceptance gaps

Editable paths in this PR: campaignWorkersRuntime.test.ts under the existing
Admin API directory, historical REF-046/preflight.md, and this recovery.md.
Add docs/operations/contracts/player-cross-cutting/pr-878.json to bind the actual
PR's verification gates. Four meaningful files, under 400 semantic changed lines;
no package edits. The verifier and its tests are locked read-only.

| Required scenario | Characterization | Remaining proof |
| --- | --- | --- |
| Duplicate trigger | Existing mocked replay result | Same-run atomic replay; distinct-run stale revision; persisted counts |
| Competing worker | NOT_RUN | Observed row contention and disjoint SKIP LOCKED claims |
| No due work | New bounded empty discovery | Actual repository discovery |
| Paused game | New paused Campaign candidate denial | Real paused-game lifecycle denial |
| Missing runtime | New missing-program isolation | Missing runtime-row denial |
| Lease expiry | NOT_RUN | Exact boundary, reclaim and stale-worker defect reproduction |
| Effect failure | Existing mocked failure | Atomic rollback versus later delivery failure and retry |
| Two game stages | New arrival/adaptation isolation | Persisted cross-game/destination isolation |

REF-046a must be registered separately before implementation: real arrival-event
notification destination effects, same-run replay versus distinct HTTP-run stale
revision, atomic event/outbox rollback and later-delivery failure preservation.
REF-046b must separately cover claims/expiry: exactly five minutes excluded,
strictly older processing reclaimed below attempt 25; failed/processing at 25
excluded, but pending at 25 reaches the increment constraint. Observe real row
locks for SKIP LOCKED, not a blocking table lock. Preserve RPC scalar booleans,
worker counters and database state when stale A fails reclaimed B's command.
If B delivers but completion returns false while the adapter counts completion,
retain the defect and stop for a separately scoped correction; no lease/SQL fix.

Children require their own exact-path/budget registration and exact base. Keep
all 50 parent IDs and parent-owned closeout. Do not claim the eight scenarios
qualified from mocks or historical results. No merge, deployment, production SQL,
schedule/cadence change, lease change or release-hold restoration is authorized.

## PR registration correction

Draft PR878 head 26795fd0 failed Banking source run 37776758517/job 113309452120:
Player authority identifier was not bound to this pull request. Preserve that
failure; the added PR878 manifest binds exact paths and required checks without
weakening the verifier. Requalify the new head. Approved Docker metadata access
subsequently succeeded; no database startup, fixture or SQL execution occurred.

## REF-046a registered disposable qualification

- Parent accepted test-only children on 2026-10-08; primary 50 IDs remain stable.
- Registration PR879 commit: `79d725b87a0215c46b346cb1446a291892b3cb95`.
- A branch: `refactor/ref-046a-campaign-events`, based exactly on that commit.
- Dependency PR878: `b9d0a030358ad4c9e97d7fd466d370149ef01c8d`.
- Current main: `9634ff92d8e28fd29623f7f4db41ff9a797e3171`.
- Local snapshot tree matched PR878 `4bbfdd2272cf5c88781bf6f521e7071f5ad05ad0`;
  registration tree matched `72ffa5460eb7339a6cad13eef3546e215bae14a6`.
- Allowed A edits: `scripts/ref-046-campaign-acceptance.ts` (300 lines), this
  recovery record (35), existing REF018 qualification workflow (25), actual
  A PR authority (40); maximum 400 semantic changed lines.
- Shared workflow remains pending PR620 ownership coordination requested at
  https://github.com/kohnerbouchard-star/Student-Profile/pull/620#issuecomment-6060442671.
- No workflow/action version or package change until coordination resolves.
- Harness uses actual scheduler/repository/effect adapters, real PostgreSQL
  RPCs and synthetic destination rows; no mocked database correctness claim.
- Full frozen migration replay is required. No production migration/routine,
  runtime, cadence, lease, credentials, settings, deployment or hold changes.
- Raw local results: `/tmp/ref018/`; final exact source and outcomes pending.
- Stacked main-only CI may not run; absent checks do not qualify acceptance.
- Final local Deno 2.9.3 frozen-lock typecheck: PASS (source script before PR authority).
- Local DB replay: BLOCKED/NOT_RUN. Approved stack startup returned
  `Get "https://public.ecr.aws/v2/": Forbidden`; pull retries stopped and no
  cached images exist. No SQL executed. PostgreSQL client install also lacked
  filesystem permissions. No alternate registry or credential changes attempted.
- Workflow proposal is retained outside Git; no DB CI integration credit yet.
- REF-046b remains unopened pending A acceptance; no race/lease proof claimed.
- Subsequent parent allocation resolves workflow coordination: only the prepared
  12-line registration slice; preserve PR620's action-version/pin ownership.
- This internal allocation is not formal CODEOWNER approval or merge permission.
- Deno permits only DATABASE_URL, REF046_DISPOSABLE_DATABASE, REF046_STACK_ID,
  RELEASE_COMMIT and PATH; network stays denied and subprocess access is psql-only.
- Prior ad192c18: five selected workflows passed; new-head DB proof remains 0/8.

## Approved isolated cleanup child

User approved 380-line child; registration PR881 at
`703ae397361655eb5f36041c2c7cdb652e5029c9`, from PR880
`2522babe6ccd4e76bdec5713e9652d5382462ca3`. Main remains `9634ff92d8e28fd29623f7f4db41ff9a797e3171`.
Branch: `refactor/ref-046-owned-disposable`; implementation initially NOT_RUN.
Allowed deltas: new scripts/ref-046-disposable-qualification.mjs 180;
existing ref-018-attendance-qualification.yml 75; campaign acceptance script 55;
this evidence 30; actual-number child authority 40. Twelve cumulative paths.
Parent allocates test workflow changes only; PR620 retains action-version/pins.
Use exclusive run/attempt/phase resources, recorded exact ownership, meaningful
foreign fixtures, frozen replay and unchanged assertions/lint. A/B never share
resources. Provisional assertions cannot certify acceptance before independent
absence verification of every owned container, volume and network succeeds.
Missing evidence, failed inspection, cancellation or failed teardown cannot pass.
Prior FK failures remain: runs37791861889,37792879204,37793958640; last artifact
11558471244 SHA256 `19a25f48240c371e5c35b6fca2eb804eb2d3af5cbd86a896a5b320b3c72d25e5`.
This approved amendment replaces row deletion with verified resource disposal;
no guard/constraint/purge/credential/production change or local registry retry.
Actual authority precedes implementation. No merge; A/B/parent stay unaccepted.
Actual child authority: PR882, committed before implementation at
`ece66b6bbcbf6fa2dbd3873f516ca25ed52bb9c9`; base is registration PR881.
Supervisor independently inventories exact Docker resource identities and preserves
foreign resource identities; finalization rechecks absence after a separate cleanup step.
Campaign runs last in its exclusive job, with a nonempty foreign sentinel and lint parity.
Local supervisor rejection checks (3), frozen Deno check, root tests, authority and diff pass.
Disposable acceptance remains NOT_RUN pending exact-head CI; failed history is unchanged.
First isolated run37844060685 failed closed on reset-recreated volume identity;
artifact11579032496 retained. Explicit replay generations added; four guard tests pass.

## REF-046b accepted-base registration — 2026-10-08

A plus isolated cleanup accepted at PR882 head
`2b393745f2ccea3d7666e742a423e8a35be7b2b1`, tree `7708abe768ce6b05bd5f92c47a771500021e8603`.
All 11 workflows succeeded; 17 checks passed, 3 existing conditional checks skipped.
Banking and Player Chromium each passed 155 tests with 11 existing skips.
Run37850374546 jobs113561507751/113563551888 passed frozen456 migration replay,
all A assertions, foreign sentinel preservation, lint parity and independent disposal.
Artifact11582365508 SHA256 `2025a5c698a6411acdcea09819349e2b6bcd1d570c55dc9051e4d63722ee0361`.
Owned resources remaining: containers0, volumes0, networks0. Main remains unchanged.
B branch: refactor/ref-046b-campaign-leases; base refactor/ref-046-owned-disposable.
Approved delta ceilings: shared harness295, supervisor25, attendance workflow15,
actual B authority40, this recovery25; total400, cumulative16 paths unchanged.
Authority binds the actual returned PR number before implementation.
Use real row contention, frozen claim/complete/fail RPCs and notification delivery.
Prove disjoint SKIP LOCKED claims, exact/expired five-minute boundary, attempt25
exclusions/constraint, stable identities and increments, then stale A/B failure.
Retain scalar booleans, worker counters and persisted rows; false completion is
a failing defect gate requiring separate correction, never expected-pass behavior.
Run events and leases on separate fresh owned stacks with phase-specific receipts.
No runtime/SQL, package, credential, deployment, merge or primary closeout changes.

