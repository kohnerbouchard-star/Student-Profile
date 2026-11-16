# REF-025 / U5 — Approved policy and next scoped work

Date: 2026-10-04. Status: DESIGN_READY; runtime implementation GATED.
Fresh main: `b7f0e1374163f665124cc2ff02e9f4313ccb6679`.
PR #834 remains draft/unmerged at `a76b252e1d9fd4886584edb5c514d5ba09a5fa93`.
Its reviewed six-path, 397-line characterization is not changed by this record.
REF-025 stays BLOCKED; REF-021 and REF-026 are VERIFIED_COMPLETE in the current
backlog; REF-027 still requires REF-025 and REF-026. No dependency/status waiver.

## Approval and limits

The user approved the quoted first-slice policy on October 4, message
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
for PR #834. No local .agents/.codex skill files were found. No runtime was probed.
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

Budget: under 399 meaningful lines and two documentation files. No runtime tests
or completion credit are claimed. Global ledgers/backlog statuses stay unchanged.
025b, 025b2, 025b3 and 025c below are proposed child registrations for review, not activated scopes.

## REF-025b — Additive currency metadata on the retained Loans read

Activation requires accepted PR #834 merge, fresh-main characterization, explicit
scope acceptance and unchanged-source baseline checks. It must not stack runtime
changes on an unaccepted characterization branch. Existing treasury stays intact.

Proposed exact paths (four; maximum 250 semantic lines, never above 399):

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
Per-currency exact totals are required in 025b2; real consumer migration is
required in 025b3. Neither is optional or satisfied by this metadata slice.

Tests: retain PR #834 assertions; compare all pre-existing fields after removing
only the new metadata; zero/one/multiple business fixtures, mixed currencies,
missing currency, unavailable context/database errors, wrong-game/scope denial,
and identical query counts/predicates. An owner/mandate read expansion is forbidden;
shareholders without mandate gain no action or data access from metadata.
Run owning Deno files, Banking, FX and ledger suites as resolved from manifests,
Player banking-read/banking-fx/business-workspace, full backend and shared matrix.
If inventory regeneration changes a tracked file, obtain that exact-path amendment
before editing it; no ceiling increases. Avoid #668's backend package collision.
Rollback: revert the additive projection/types/tests; no money state was changed.
This child alone does not close REF-025 or qualify business-loan authorization.

## Required read successors and dependency sequence

Sequence: accepted 025a / PR #834 merge -> 025b metadata -> 025b2 exact currency
aggregation -> 025b3 real consumer migration. Each implementation child requires
its own accepted scope and predecessor merge. 025c design can be reviewed after
025a alongside read-slice planning, but economic implementation waits for the
accepted read-contract disposition. New business-loan activation waits for all
025c economic children plus 025c5 authority/read integration and 025b3 acceptance.
No parent or downstream completion is inferred from one child passing.

### REF-025b2 — Exact per-currency read projection

Owner: REF-025 Business-banking repository/contracts; Economy/Banking remain the
monetary source owners. Depends on accepted 025b. Proposed maximum six files and
350 semantic lines; split before exceeding the task's ten-file / 399-line limits.
Candidate source paths are the same contracts, repository and owning route-test
files named for 025b, plus proposed `backend/src/domains/business-banking/domain/loanCurrencyProjection.ts`
and `docs/operations/evidence/refactor-execution-v1/REF-025/u5-currency-aggregation.md`.
Any additional transport or SQL path needs explicit scope review before edits.

Acceptance: an additive versioned projection supplies exact amounts per currency
for eligible offer capacity, active principal plus accrued interest, next payment
and scheduled amounts. Define each aggregate's membership and due-date ordering
explicitly; use the existing eligibility/status semantics, not a new credit limit.
No cross-currency sum, FX conversion or default currency for unknown rows. Unknown
currency or unavailable exact input is an explicit incomplete/unavailable state,
not zero; valid empty groups remain distinguishable. Preserve legacy numeric DTO
fields unchanged for compatibility, but never use them to derive exact totals.

Trace numeric transport from Postgres through the client before selecting decimal
arithmetic. A string made from an already-rounded JS number is not exact evidence.
If current select transport cannot supply exact values, stop and register a bounded
read-only projection/transport amendment; do not change SQL or claim precision here.
Reuse established exact-money public contracts/helpers where valid. Keep aggregation
bounded without N+1 reads; document and justify any changed query budget separately.

Tests must cover same-currency sums, mixed currencies, boundary precision including
large values and 0/3/18-decimal fixtures where supported by the source contract,
null/unavailable versus zero, deterministic due ordering, wrong-game denial and
unchanged legacy fields. Currency scales must follow source authority, not relax
existing loan terms. Run owning, Banking/FX/economic and shared validation gates.
Rollback removes the additive projection only; no loan or ledger state changes.

### REF-025b3 — Migrate the actual Loans consumer

Owner: REF-025 read-contract owner with an explicit Player owner handoff. Depends
on accepted 025b2. Source census confirms `player-terminal/src/pages/loans-page.js`
currently formats every offer, loan, schedule and summary with the local currency.
Proposed source/test paths: that page, `player-terminal/src/api/read-model.js`,
`player-terminal/src/api/response-normalizer.js`, and the existing
`player-terminal/tools/connected-banking-loans-mutation-runner.mjs`; evidence path:
`docs/operations/evidence/refactor-execution-v1/REF-025/u5-loans-consumer.md`.
Budget: at most eight files / 350 semantic lines; any needed formatter/test-suite
registration is named and reviewed before activation, never assumed permission.
#624 owns the accepted UI; REF-042 owns Player data-plane work. Obtain their narrow
handoff for affected paths, and avoid API/app/realtime/cache composition changes.

Acceptance: the reachable Loans page displays authoritative row currencies and
per-currency summaries using the exact projection, with no misleading local-currency
label on mixed debt and no currency-combining summary. Preserve accepted layout,
keyboard/focus/accessibility, disclosures, operation IDs, request payloads, repayment
rights and post-write refresh. No gameplay or new action permissions in this child.
Handle old/absent additive responses explicitly as unavailable currency summaries;
never silently relabel legacy mixed totals or remove otherwise valid repayment.
Characterize retained consumers and fixtures; prove the new fields reach this real
page rather than merely exporting an unused contract. Browser tests cover mixed
currencies, precision, empty/loading/error, older responses, application/repayment,
replay/rejection and refresh. Run Player verification and affected connected suites.
Rollback restores the old consumer wiring without changing backend obligations;
retain the known old representation limitation in rollback evidence.

## REF-025c — Forward-change design, then separately accepted economic children

Design depends on accepted 025a and reviewed 025b contract disposition. It is not
permission to edit historical migrations or introduce a complete lending engine.
Proposed design-only paths (two, maximum 200 lines):

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
attribution; c5 integrates mandate-consistent offer/read/command authority.
Each must identify exact paths, at most 10 meaningful files and under 400 semantic
lines, and its accepted predecessors. Reserve migration identifiers only when each
child activates; obtain scope approval before new schema/RPC or larger changes.
No child may expose a partially enforced business-liability path: keep activation
gated until all read/command/default paths and compatibility qualification agree.

REF-025c5 depends on accepted c1-c4 and 025b3. Business owns canonical mandate
resolution; Business-banking owns the lending contract/repository/handler; Admin
owns review dispatch; autonomous servicing remains with its existing worker owner.
The design must list those exact caller paths and obtain any #668/#736 or Player
owner handoff before edits. No blanket ownership of dispatchers or shared context.
Acceptance requires consistent offer/read/application/approval/repayment authority,
including operator replacement, multiple businesses, shareholder without mandate,
wrong player/game, revoked authority and unavailable lending. Read eligibility is
not permission to write. Preserve the distinct legacy borrower/repayment path and
prove new business defaults do not penalize an operator as a personal borrower.
No shared-file work runs concurrently with an unresolved owner collision.

Required economic evidence: one authoritative transactional command per mutation;
loan/business/account locks and order; exact currency/rounding; same-key receipt
and different-payload conflict; paid-loan replay behavior explicitly reconciled;
insufficient funds; concurrent approval/repayment/operator change; injected failure
rolls back loan, ledger, receipt and audit together; no cross-game access/effects.
Use disposable DB replay twice, lint findings disposition, settlement/isolation/
rollback/races plus backend/Player/connected suites. Mocks/source scans are not DB
proof. No live database or release authority is implied. SQL rollback is a reviewed
forward correction; code rollback never erases valid obligations or posted ledger.

## Parent acceptance mapping — no reduced criteria

025b supplies metadata only; 025b2 supplies exact currency-separated aggregates;
025b3 supplies the actual consumer and UI/lifecycle evidence; 025c1-c5 supply new
liability, atomic economic behavior and consistent mandate authority. Together
with retained treasury verification and 025a characterization, these must satisfy
all original REF-025 and U5 acceptance cases before any parent closeout. Missing
precision, consumer, compatibility, authority or runtime evidence remains a blocker.
The backlog's 50 primary IDs and REF-027 dependency edges remain unchanged.

## Validation and next gate

Documentation checks: exact two-path scope, local links/source paths, unchanged
50-task graph/statuses and diff whitespace. Runtime/database/staging checks NOT_RUN
for this docs-only tranche; prior PR #834 evidence remains bound to its own head.
Next eligible action: review this registration and resolve PR #834 acceptance/merge
through the parent; then rebase 025b from accepted main and lock its four paths.
No runtime implementation starts while that prerequisite remains unmerged.
