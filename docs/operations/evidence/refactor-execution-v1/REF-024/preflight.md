# REF-024 Marketplace reservation verification

Status: IN_PROGRESS. Base main `575ba64e62896ceac9ce63abb4023385ef65eb05`.
REF-023 is VERIFIED_COMPLETE. No open Marketplace owner exists. REF-028 owns
Contracts separately; REF-015/025 remain blocked and REF-019/020 retain gates.

## Verification-only disposition and scope

Marketplace has zero Inventory imports. The named reservation adapter is a pure
model imported only by its three test modules; it has no production consumer.
No public port is invented and no transaction is split. Legacy projection SQL
remains required by the public wrappers. The package README permits this current-
source verification-only disposition; the original R3 acceptance remains required.

Five editable paths: `scripts/ref-024-marketplace-acceptance.ts`, existing
`.github/workflows/ref-018-attendance-qualification.yml`, this record,
`docs/roadmaps/refactor-execution-v1/tasks/REF-024.md`, and only REF-024's entry in
`docs/roadmaps/refactor-execution-v1/backlog.json`. Ten-file task budget; no runtime,
SQL, migration, generated inventory, package, pricing or credential changes.
The harness reuses the existing psql/snapshot/observed-lock-waiter pattern; no
shared helper refactor. These paths do not trigger production deployment jobs.

## Actual authority and expected fixture effects

The old purchase HTTP route is retired. Current production uses
`create_marketplace_funding_quote_v1` and `settle_marketplace_funding_v1`.
The quote locks listing stock before C0 funding; settlement locks listing,
reservation and Inventory before composing funding, distribution and transfer
inside one RPC. Scope and replay remain server-owned. Cancellation retains its
current public wrapper and private legacy projection.

Fixtures use real canonical Inventory grants and balanced Banking postings.
Even same-currency quotes require immutable FX authority, so initialization uses
the accepted C1 snapshot/fixing pattern. Synthetic zero-fee/tax policy isolates
one unit at price 10: settlement must create one order/receipt, two bank
transactions, four ledger lines, two inventory events and four commercial
postings; buyer loses 10, seller gains 10, and one item changes owner. No formula
or policy implementation changes. Expired fixture timestamps preserve the
required expires-at-after-reserved-at constraint.

Tests cover replay/conflict, wrong owner/game, self-purchase, stale version,
insufficient quantity/funds, duplicate cancellation, expired reservation,
injected failure after money and Inventory writes with full snapshot rollback,
and overlapping competing quotes/purchases plus duplicate settlement. The
transient failure trigger exists only in disposable loopback PostgreSQL and is
removed before lint. Existing qualification and lint comparison remain intact.

## Evidence pending

On base main, Marketplace 49, Inventory 50, ledger invariants 25 and Player
marketplace-connected passed. The latter is a local contract test, not hosted
browser proof. Existing funding database/concurrency scripts chiefly inspect
installed function text, ACLs and allocation normalization; they do not establish
the required actual competing purchases. REF-023 proves listing/Crafting stock
contention, not funded settlement. Docker is unavailable locally; exact-head
disposable CI must pass before merge and merged-main verification before closeout.
No hosted credential or production requests. No completion claim yet.
