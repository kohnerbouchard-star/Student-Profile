# REF-021 ledger-history read port

Base: `aaf9ea463e9a6746432e19658f9dcc22f17d8eba`. Status: IN_PROGRESS.
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


Owner draft PR: #774. Trigger audit found no production mutation workflow on this
feature-branch push. On main, Production Git Release runs its static contract;
live parity/promotion jobs require separate explicit workflow_dispatch release
authorization. No trigger or release setting is changed by this task.

Local pinned verification passed: backend TypeScript, banking-public 38 cases,
ledger invariants 3, Player security 59, full root `npm test`, exact PR authority,
and whitespace checks. Full Edge/Admin API/smoke qualification remains CI-required
because this workspace cannot fetch the existing pinned esm.sh dependency.
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
