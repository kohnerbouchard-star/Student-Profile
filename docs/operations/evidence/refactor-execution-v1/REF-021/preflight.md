# REF-021 ledger-history read port

Base: `aaf9ea463e9a6746432e19658f9dcc22f17d8eba`. Status: VERIFIED_COMPLETE.
Dependency REF-016 is VERIFIED_COMPLETE. REF-015 remains blocked, REF-019 and
its staging-access investigation are paused, and REF-020 retains its independent
auth-baseline gate. No dependency is waived by proceeding with REF-021.

No existing REF-021 owner was found. Active #668 retains Staff/context/bootstrap
ownership and #736 retains Player service-client binding. Neither owns the selected
history handlers. The existing Banking test module imports the adjacent parity
tests; package scripts, permissions and #668 bootstrap/smoke ownership are unchanged.

## Frozen seam

Each selected handler first performs its existing audience authorization and
Player/game checks, then reads `account_balances` followed by `ledger_entries`.
Both queries retain `game_session_id` and `player_id` equality filters. Balances
select account_type/balance/currency_code and order account_type ascending.
Entries select their existing ten fields, order created_at descending, and limit
to the validated integer (default 50, accepted 1–100). No cursor, currency/account
filter, tie-breaker or new query exists. Null rows become empty lists; balance
failure suppresses the second query. Strings/numbers cross the repository without
conversion; each HTTP adapter retains its existing `readBalanceNumber` mapping,
errors, private/no-store envelope and generated timestamp.

Only the two ledger-data queries per handler move. Session/ownership/profile
reads, authorization sequence, service-client construction and response projection
remain unchanged. Staff route roots are retained Classroom/Staff APIs. The older
Player handler has no current runtime import; canonical Player Banking routes use
the separate public repository. Do not revive that handler or redesign either
response/privacy contract as part of this extraction.

## Exact meaningful file budget (ten)

1–2. `backend/src/domains/economy/api/{playerLedgerHistoryHttpHandler,staffPlayerLedgerHistoryHttpHandler}.ts`
3. `backend/src/domains/economy/contracts/ledgerHistoryReadRepository.ts`
4. `backend/src/domains/economy/infrastructure/supabaseLedgerHistoryReadRepository.ts`
5. `backend/src/domains/economy/api/ledgerHistoryReadRepository.test.ts`
6. `backend/src/domains/economy/api/playerBankingPublicHttpHandler.test.ts` (adjacent test import only)
7. This preflight/evidence record
8. `docs/roadmaps/refactor-execution-v1/tasks/REF-021.md`
9. `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-021 only)
10. `docs/operations/contracts/player-cross-cutting/pr-774.json`

Generated architecture inventory is listed separately and regenerated without
raising ceilings. No SQL/migration, mutation, UI, auth/client factory, global
ledger, release/workflow or production configuration edit. Characterization runs
against the baseline first, then the same tests after extraction. Required gates:
ledger fixtures, banking-public, ledger invariants, Player security, Admin API,
full smoke/typecheck, root tests, architecture/privacy/secret/diff checks. Local
esm.sh network restrictions may require exact-head CI for full Edge execution.


## Characterization and extraction checkpoint

Baseline handlers passed 31 characterization cases before source movement.
After extraction those same cases and one raw-decimal/order repository case pass
(32 total). The four selected balance/ledger calls are now two shared repository
queries; adapter authorization/profile reads intentionally remain. Each adapter
injects its existing request-scoped client through an optional repository factory,
with the concrete Economy adapter as the default. No conversion, sorting, new
filter, retry, mutation or public response field was introduced. Runtime candidate
inventory totals are not equivalent to this selected-call measure.


Implementation PR: #774 (merged; qualification below). Trigger audit found no production mutation workflow on this
feature-branch push. On main, Production Git Release runs its static contract;
live parity/promotion jobs require separate explicit workflow_dispatch release
authorization. No trigger or release setting is changed by this task.

Local pinned verification passed: backend TypeScript, banking-public 38 cases,
ledger invariants 3, Player security 59, full root `npm test`, exact PR authority,
and whitespace checks. Full Edge/Admin API/smoke could not run locally because
this workspace cannot fetch the existing pinned esm.sh dependency; the exact-head
CI qualification below supplies that evidence.
The selected adapters' ledger-data calls fell from four to zero. The inventory
covers 1,255 source/test files; persistence-outside-infrastructure remains 53
because the selected adapters intentionally retain their authorization reads.
Its broad shim-candidate total includes the new test's scoped network-denial
fixture; production transport budgets and all zero-tolerance categories remain
unchanged, as verified by the existing architecture ratchets.


Initial CI at `40153a0d009978c8d6d421a05c2f47099c4c8e93` found that the
one-line package registration invalidated REF-003's immutable supporting-source
hash. The package is restored byte-for-byte; the existing Banking test module
now imports these adjacent tests instead. All assertions and suite permissions
remain unchanged, and no historical review hash or guard is weakened.


## Merged repository acceptance — 2026-10-01

Implementation [PR #774](https://github.com/kohnerbouchard-star/Student-Profile/pull/774)
qualified `e85f00935afe5ed17f0f2629460a4a93c1eb9a2a`, then merged by
expected-head-guarded merge as `124ff72e587830ac98f59efd16a18f8ec1b50749`.
Both commits have tree `95a07d250d98ef6894b6a7358ebc0b20e54d6db7`.
All 29 triggered pull-request workflows completed successfully, plus dynamic PR
run `36809620937` and Vercel. No failed or pending exact-head check remained.

Merged main `124ff72e587830ac98f59efd16a18f8ec1b50749` then completed
15 successful runs, with two expected skipped production Edge/Vercel workflows
and zero failed or pending runs. [Backend run 36811018108](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36811018108),
[Repository Quality run 36811018105](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36811018105)
and the final [Store Cutover run 36811018145](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36811018145)
passed. Skipped runs `36811018106` and `36811303374` supply no deployment or
runtime certification. These were existing automatic checks; this documentation
closeout did not manually rerun source suites.


- [Backend Typecheck/full smoke run 36809622802](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36809622802), job `110201546981`: passed. The owning `test:player-banking-public` command ran 38 cases once, including 32 REF-021 cases; zero failed. Full smoke includes the required economic-ledger invariants, Player security and Admin API suites. Retained `backend-smoke-diagnostics` artifact `11139056797` was downloaded and SHA-256 verified as `3f927a7491de024ddd3b7d168f1a87e30d2bd0d65a491b83b02882b54b4ef056`.
- [Repository Quality run 36809622820](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36809622820), job `110201547279`: passed, including the immutable REF-003 supporting-source audit. The initial registration failure above is historical, not acceptance.
- [Store/FX run 36809622833](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36809622833): all four required source, disposable-database, fixture-browser and connected local-runtime jobs passed (`110201547802`, `110201547606`, `110201547399`, `110201547626`). These are retained integration coverage, not live-production evidence.
- [Player Terminal run 36809622808](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36809622808): source/security contracts and 133 Chromium cases passed. [Store Cutover run 36809622809](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36809622809) completed the final automatic gate successfully; all six jobs passed.
- Supply Chain Security, Runtime Interaction Wiring, Player Multiplayer/Load, economic integration workflows, and static release/staging contracts passed on the same exact head. No ceilings, assertions or permissions were weakened.

The meaningful implementation scope remains the ten files listed above plus the
separately generated inventory. This closeout edits only this existing record,
the task and its backlog entry; the other 49 task entries are unchanged. Selected
ledger persistence falls from four adapter calls to zero; repository query count
remains two per request and whole-inventory persistence candidates remain 53 of
1,255 scanned source/test files. The Staff route stays reachable through retained
Classroom/Staff roots; the older Player handler remains unbound, and canonical
public Banking remains in its separate repository. No route/RPC/migration changed.

No staging or production request, hosted-data mutation, release or credential
change was part of this task. Live authentication evidence remains unavailable
for REF-019/020 and is not inferred from this read-only source extraction. REF-015
remains blocked. Next exact item is REF-022 (depends only on REF-021), beginning
with current ownership and atomic adjustment-command reconciliation; no REF-022
implementation is included here.
