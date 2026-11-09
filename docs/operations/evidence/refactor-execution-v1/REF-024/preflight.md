# REF-024 Marketplace reservation verification

Status: VERIFIED_COMPLETE. Base main `575ba64e62896ceac9ce63abb4023385ef65eb05`.
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
transactions, four ledger lines, two inventory events and two nonzero commercial
postings; buyer loses 10, seller gains 10, and one item changes owner. No formula
or policy implementation changes. Expired fixture timestamps preserve the
required expires-at-after-reserved-at constraint.

Tests cover replay/conflict, wrong owner/game, self-purchase, stale version,
insufficient quantity/funds, duplicate cancellation, expired reservation,
injected failure after money and Inventory writes with full snapshot rollback,
and overlapping competing quotes/purchases plus duplicate settlement. The
transient failure trigger exists only in disposable loopback PostgreSQL and is
removed before lint. Existing qualification and lint comparison remain intact.

## Historical local verification

On base main, Marketplace 49, Inventory 50, ledger invariants 25 and Player
marketplace-connected passed. The latter is a local contract test, not hosted
browser proof. Existing funding database/concurrency scripts chiefly inspect
installed function text, ACLs and allocation normalization; they do not establish
the required actual competing purchases. REF-023 proves listing/Crafting stock
contention, not funded settlement. Docker is unavailable locally; exact-head
disposable CI must pass before merge and merged-main verification before closeout.
No hosted credential or production requests. No completion claim yet.

Initial head `b1aba40cfd600269f73713181e0629a39c017c7d`, run `36826202172`,
executed a funded settlement but caught the harness's four-commercial-posting
assumption. The accepted 20260827103500 compatibility migration dynamically
patches settlement to omit zero fee/tax rows. The zero-fee fixture now requires
exactly the buyer debit and seller credit, with amounts/currency asserted.
Later projection-order and posting compatibility patches were reconciled; no
production behavior changed. This failed run is not final acceptance.

## Qualified source and guarded merge

[PR783](https://github.com/kohnerbouchard-star/Student-Profile/pull/783) qualified
`a88ac24910423a29c0a1e7253ae2919c5068ee8c`, including REF-028's verified
source, inventory and closeout. An expected-head-guarded merge produced main
`d64b2a0b7aeccd8ab73c237ee88a97c1f9395872`. Both trees equal
`8c7e787f0dcfcf420ac992bfd089363ac883ffa4`. No runtime or SQL was changed.

[Run 36828953189](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36828953189),
job `110260902221`, produced [artifact 11146602389](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36828953189/artifacts/11146602389).
Downloaded ZIP SHA256: `a8c5200e314d241de685765c860d85fbbf8e63dfbdc06186a3ef0f46012ffb19`.
REF-024 JSON names the exact head and passes all current funded-settlement cases:
208 scoped tables; commit/replay/conflict, stock/scope/stale-version denial,
cancellation, insufficient funds/expired reservations, in-RPC rollback and
same-key retry. Competing purchases and duplicate settlement each observed two
waiting sessions and preserved single-order/money/Inventory effects.

All eight automatic runs and Vercel passed. Full backend typecheck covered 28
Edge roots; smoke passed 80 tests. Owning Marketplace/Inventory/ledger suites
passed 49/50/25 plus Player marketplace-connected. Retained REF-018/022/023
acceptance passed. Lint retained 142 findings, including 17 error-level findings,
with no additions/removals. This is disposable database evidence, not a clean
database or production certification.

Earlier baseline head `8ceef6a4ce3d9f1cf9af3b50bc44446507428519` passed
run `36826981062`, artifact `11145473572`; its downloaded ZIP verified as
`4e88d70ca3f377b741b1dac73fc81aabb41ce2f78e298c2d31687234161990e7`.
Final combined-head evidence above supersedes it for merge acceptance.

Merged main `d64b2a0b7aeccd8ab73c237ee88a97c1f9395872` reached terminal
verification: eight successful runs and two expected conditional Vercel skips.
[Repeat qualification 36829630035](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36829630035),
Repository Quality `36829630154`, Beta Security `36829630149`, Beta Pilot
`36829630197`, timezone `36829630046`, Supply Chain `36829630213`, Production
Git Release contracts `36829629997`, and CodeQL aggregate `36829629552` passed.
Vercel verification runs `36829956612`/`36829809792` skipped their PR/production-
dispatch conditional jobs. No production deployment or certification is claimed.

REF-024 is VERIFIED_COMPLETE with its original acceptance retained. Production
Marketplace-to-Inventory imports remain zero before/after; the existing pure
reservation model and its three test consumers remain unchanged. Other 49 task
records, including completed REF-028 and blocked REF-025, are preserved.
Next dependent task: REF-026, whose REF-023/024 prerequisites are now complete.
