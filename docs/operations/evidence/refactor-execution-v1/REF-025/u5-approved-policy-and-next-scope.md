# REF025 / U5 — Approved policy and next scoped work

Date: 2026-10-04. Status: DESIGN_READY; runtime implementation GATED.
Fresh main: `b7f0e1374163f665124cc2ff02e9f4313ccb6679`.
PR834 remains draft/unmerged at `a76b252e1d9fd4886584edb5c514d5ba09a5fa93`.
Its reviewed six-path/397-line characterization is not changed by this record.
REF025 stays BLOCKED; REF021 and REF026 are VERIFIED_COMPLETE in the current
backlog; REF027 still requires REF025 and REF026. No dependency/status waiver.

## Approval and limits

The user approved the quoted first-slice policy on October4, message
`Sentinel_60e507f2bc00819192e47082eda92297`:

> Assess affordability from the business’s qualifying income, using the existing limits.
> Check the applying operator’s credit score for eligibility only, without making them personally liable.
> Record defaults against the business, with no automatic personal guarantee or currency conversion.
> Existing loans and repayment rights would stay unchanged.

This satisfies those three policy decisions; do not ask the owner to approve
these same rules again. It supersedes the pending-policy wording in historical
U5 evidence/PR prose, not the need for an approved concrete forward-change scope.
D2-B remains the architectural direction. Canonical operating permission is
separate from liability and shareholding. Management changes do not transfer debt.
No new guarantor, collateral, debt-sale/novation, recovery remedy, currency
conversion, credit threshold or business credit-scoring model is authorized.
The exact qualifying-income classification is to be traced in the design; do not
silently treat every positive ledger entry, capital contribution or FX inflow as income.
Existing product limits are authoritative; seed values are not hardcoded new rules.

## Workspace and ownership preflight

The main checkout is clean but on historical local `work`; fresh origin/main was
fetched successfully. The old /tmp/ref025a-work is absent (stale worktree metadata),
so this documentation uses a separate main-based scope branch, not a replacement
for PR834. No local .agents/.codex skill files were found. No runtime was probed.
Root/package instructions, beta/architecture ledgers, task, addendum, intake,
execution contract, validation and backlog were inspected against fetched main.

Live open owners were rechecked: #834 owns characterization; #832 owns REF042
Player API/realtime plus its two workflow filters; #833 owns Markets continuation.
#668 owns context/global ledgers/backend package and shares inventory; #736 owns
Player runtime auth and shares inventory. #624 remains Player UI owner; #730/#731/
#735 retain release ownership. Neither these sources nor their shared inventory,
package/workflow files are authorized edits in this documentation tranche.
All nine U1 hosted guards and release holds remain. No CampusPay work, live SQL,
credentials/settings, captures, dispatches, deployment or merge is authorized.

## Current documentation scope

Exactly two editable paths, one conceptual policy/child-registration record:
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-approved-policy-and-next-scope.md`
- `docs/roadmaps/refactor-execution-v1/tasks/REF-025.md`

Budget: under399 meaningful lines and two documentation files. No runtime tests
or completion credit are claimed. Global ledgers/backlog statuses stay unchanged.
025b/025c below are proposed child registrations for review, not activated scopes.

## REF025b — Additive currency metadata on the retained Loans read

Activation requires accepted PR834 merge, fresh-main characterization, explicit
scope acceptance and unchanged-source baseline checks. It must not stack runtime
changes on an unaccepted characterization branch. Existing treasury stays intact.

Proposed exact paths (four; maximum250 semantic lines, never above399):
- `backend/src/domains/business-banking/contracts/playerBusinessBankingContracts.ts`
- `backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts`
- `backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.test.ts`
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-currency-read.md` (new)

Allowed symbols: LoansSnapshotDto and readLoans output projection, plus the
existing owning tests. Add currencyCode to offers, activeLoans and schedule rows,
derived respectively from loan_products.currency_code and player_loans.currency_code.
Preserve the legacy amount representation/rounding; this slice makes no new claim
of lossless decimal transport. Missing currency remains explicit null, never
fabricated from the player's local currency. Additive type fields remain optional
for existing injected repositories; the production projection emits them.

Do not label existing business-linked loans as new business-only liability.
Keep businessId's public-key/null behavior, product currency filter, game/player
borrower filters, owner-based offer eligibility, errors, headers, ordering, limits,
schedules and all existing top-level fields unchanged. Retain one context RPC and
five queries for zero/one/multiple businesses; no per-loan or business queries.
No UI, authorization, route, schema, ledger, repayment, credit-policy or package edit.
No additive currency label may certify the existing mixed-currency outstanding sum:
that legacy scalar remains a documented compatibility limitation, not a new total.
Per-currency exact totals and consumer migration require a later bounded scope.

Tests: retain PR834 assertions; compare all pre-existing fields after removing
only the new metadata; zero/one/multiple business fixtures, mixed currencies,
missing currency, unavailable context/database errors, wrong-game/scope denial,
and identical query counts/predicates. An owner/mandate read expansion is forbidden;
shareholders without mandate gain no action or data access from metadata.
Run owning Deno files, Banking38/FX16/ledger suites as resolved from manifests,
Player banking-read/banking-fx/business-workspace, full backend and shared matrix.
If inventory regeneration changes a tracked file, obtain that exact-path amendment
before editing it; no ceiling increases. Avoid #668's backend package collision.
Rollback: revert the additive projection/types/tests; no money state was changed.
This child alone does not close REF025 or qualify business-loan authorization.

## REF025c — Forward-change design, then separately accepted economic children

Design depends on accepted025a and reviewed025b contract disposition. It is not
permission to edit historical migrations or introduce a complete lending engine.
Proposed design-only paths (two, maximum200 lines):
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-forward-change-design.md` (new)
- `docs/roadmaps/refactor-execution-v1/tasks/REF-025.md`

Source anchors: Aug6 application/affordability; Aug12 loan account bindings;
Aug26 business-bank identity rewrite; July21 review/servicing/credit/recovery;
canonical Business mandate resolver and September operating-mandate changes.
Business money already uses stable game/business/currency identity after Aug26.
Existing loan/player and business-owner authorization is a separate retained rule.
The old review routine also has a lint-reported ambiguous status reference; any
correction must be explicit, characterized and separately scoped, not concealed.

Design an explicit new-obligation discriminator with business liability and
separate initiating actor, never infer new liability from purpose/businessId alone.
Specify offer/application/approval/repayment/servicing/read authority together.
Legacy records retain their liabilities, accounts, terms, schedules and repayment
rights; no bulk reinterpretation or automatic transfer during operator replacement.
For new loans use canonical mandate authorization, business qualifying income in
the obligation currency and existing product limits; operator score is eligibility
only; business default must not feed automatic personal default penalties.

Reconcile the existing 84-day affordability window/formula and ledger exclusions,
including capital_contribution_in and ipo_primary_subscription classifications.
These are concrete implementation details to review against the approved policy,
not authority to invent income rules. Preserve product accrual/grace/default terms
unless a separately approved decision changes them. Do not design FX conversion.

Register implementation children BEFORE code: c1 explicit schema/compatibility;
c2 atomic origination/approval; c3 repayment/operating authority; c4 servicing/default
attribution. Each must identify exact paths, <=10 meaningful files and <400 semantic
lines, and its accepted predecessors. Reserve migration identifiers only when each
child activates; obtain scope approval before new schema/RPC or larger changes.
No child may expose a partially enforced business-liability path: keep activation
gated until all read/command/default paths and compatibility qualification agree.

Required economic evidence: one authoritative transactional command per mutation;
loan/business/account locks and order; exact currency/rounding; same-key receipt
and different-payload conflict; paid-loan replay behavior explicitly reconciled;
insufficient funds; concurrent approval/repayment/operator change; injected failure
rolls back loan, ledger, receipt and audit together; no cross-game access/effects.
Use disposable DB replay twice, lint findings disposition, settlement/isolation/
rollback/races plus backend/Player/connected suites. Mocks/source scans are not DB
proof. No live database or release authority is implied. SQL rollback is a reviewed
forward correction; code rollback never erases valid obligations or posted ledger.

## Validation and next gate

Documentation checks: exact two-path scope, local links/source paths, unchanged
50-task graph/statuses and diff whitespace. Runtime/database/staging checks NOT_RUN
for this docs-only tranche; prior PR834 evidence remains bound to its own head.
Next eligible action: review this registration and resolve PR834 acceptance/merge
through the parent; then rebase025b from accepted main and lock its four paths.
No runtime implementation starts while that prerequisite remains unmerged.
