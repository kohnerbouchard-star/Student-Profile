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
Three meaningful files, under 400 semantic changed lines; no package edits.

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
