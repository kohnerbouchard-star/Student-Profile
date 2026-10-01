# REF-022 Staff ledger adjustment application seam

Status: IN_PROGRESS. Base main `e388c8be26d30dae8fee32a83c17a25b286c7404`.
REF-021 is VERIFIED_COMPLETE. No open REF-022 owner exists; #668 owns context,
#736 owns Player binding. REF-015 remains blocked; REF-019/020 retain their gates.

## Explicit bounded children and merge order

The combined parity/qualification candidate exceeded the execution contract's
400-semantic-line review threshold. Split the same task into two reviewable
children; preserve all 50 parent IDs. Neither child alone completes REF-022.

- REF-022a: establish actual atomic service/RPC baseline in
  `scripts/ref-022-ledger-adjustment-acceptance.ts` and extend the existing
  `.github/workflows/ref-018-attendance-qualification.yml`. Exact editable docs:
  this record, REF-022 task and REF-022 backlog entry.
  Five meaningful files; no application source change. Qualification code is one
  harness, with loopback psql/snapshot/lock-observation mechanics reused from
  REF-018 and new ledger-specific assertions. No helper refactor or extra framework.
- REF-022b, after qualified REF-022a merges: selected Staff handler, proposed
  `economy/application/adjustLedgerForAuthorizedStaff.ts`, adjacent handler parity
  tests, existing economic invariant suite registration, and binding this harness
  to the new application. The same three docs plus its authority manifest make
  nine meaningful files; regenerated inventory is separate. The actual RPC
  acceptance must rerun on that exact implementation head before its merge.

## Frozen boundary and required acceptance

The handler already delegates to Economy's unchanged
`recordIdempotentStaffLedgerAdjustment` service and
`record_idempotent_staff_ledger_adjustment_v1` RPC. Reuse that adapter, moving only
fixed command/provenance construction. Method/config/auth, owned-game/active-player
checks, key/body parsing, rounding, errors and response mapping stay unchanged.
The request fingerprint, scoped idempotency lock, cached replay/conflict result,
`record_player_ledger_entry` call and completion stay in one transaction. Current
Banking emits two balanced ledger lines and one bank transaction per adjustment.
No SQL, amount/account/currency policy, rounding, permissions or routes change.

The disposable harness tests credit/debit, replay/conflict, denied amount/account/
currency/player/game/overdraft effects, failure inside completion after ledger and
audit writes with clean retry, and same/distinct-key races with two observed lock
waiters. It snapshots all game-scoped tables and counts every ledger/bank effect.
The transient fixture trigger is removed; no migration changes. Its loopback-only
54322 guard, explicit disposable flag and service_role transport use no hosted
credentials. Existing Attendance checks and before/after lint comparison remain.

## Verification status

Combined local candidate characterization passed 23 owning-suite tests before and
after extraction (20 new Staff cases), backend TypeScript, full root tests and two
Admin economic-write contracts. That unpublished candidate is not acceptance for
REF-022a or b. The qualification harness passed Deno typecheck; local Docker is
unavailable, so real R3 acceptance requires exact-head disposable CI. No mock or
other-head result counts as that proof. Parent remains IN_PROGRESS until both
children and their required evidence merge. No production or credential actions.

Qualification-only paths do not trigger Store/FX cross-cutting authority gates,
so REF-022a needs no authority manifest. REF-022b will bind its source/inventory
paths to its own PR manifest. Together the children retain the parent ten-file
meaningful budget plus generated inventory.

Initial PR776 head `59704f75eef0ae37873dcfdbe3ca61c5d095aec7`, run
`36814753758`, failed only the harness's one-audit assumption. Current unchanged
Banking SQL inserts both a bank_transaction audit and player audit. The harness
now requires exactly one of each per adjustment (two total); ledger/bank/replay/
rollback assertions remain. This failed run is historical, not acceptance.
