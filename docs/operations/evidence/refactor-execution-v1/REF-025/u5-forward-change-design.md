# REF025 / U5 — proposed liability continuation

2026-10-04. DESIGN_REGISTERED; implementation NOT_STARTED. Parent reviews scope,
source and merge. Base main: `79d8fd51230eab5beef2a1a59ca0476aef9a0bed`.
This three-document tranche is capped at 250 semantic changed lines. REF025 remains
BLOCKED; REF027 depends on025+026; all 50 primary IDs and dependencies remain intact.
No completion, staging or release credit; all nine U1 hosted guards stay in place.

## Accepted predecessors and policy

| PR | Bounded result | Merge identity |
| --- | --- | --- |
| #834 | 025a retained authority/replay characterization | `8a33ce0ce122115bc06ae525f5ab5d08d4daf557` |
| #835 | Approved policy and successor registration | `6977a9f5122e3a062dffae08d03fe1ee1700aedf` |
| #838 | 025b currency-bearing retained rows | `708cbbdb9e464b9ae383146254b2a6330ac54c0a` |
| #842 | 025b2 exact per-currency aggregation | `d2aa78c8ddd25d086db08dadc66e7af47ec598bd` |
| #846 | 025b3 actual Loans consumer | `79d8fd51230eab5beef2a1a59ca0476aef9a0bed` |

These merge identities supersede pending-merge statements in historical REF025
snapshots, without rewriting their head-bound evidence. #846's seven merged paths
match reviewed head `3791cdde98e48fffb2c58013a490e221f1a67506` exactly.
Treasury's accepted extraction remains intact. Predecessor tests do not qualify
new business-liability economics.

Approved D2-B: business qualifying income under existing product limits; applying
operator score for eligibility only; business defaults without personal guarantee
or automatic FX. Preserve existing obligations and repayment rights. Management
change does not transfer debt. No guarantor, collateral, debt sale, recovery remedy,
new score model, threshold or currency-conversion policy is introduced.

## Proposed c1 schema and contract — inert until complete qualification

Owner: Business-banking; canonical mandate authority remains Business-owned.
On both `loan_applications` and `player_loans`, propose non-null text
`liability_kind`, default `legacy_v1`, with vocabulary `legacy_v1` / `business_v1`.
Legacy includes existing personal AND business-linked records, plus old callers'
future inserts. Never derive liability from product type, purpose or business_id.
Retain player_id, business_id, public keys, balances, terms, accounts and schedules.
There is no bulk borrower conversion and no new personal-loan policy.

Propose nullable `initiating_operator_player_id` and `borrower_business_id` on both
tables, plus nullable `obligation_currency_code` on applications. Loans retain their
existing currency_code. New fields stay null for legacy_v1; this preserves old
inserts and avoids retroactive claims about historical initiators or currency.
For business_v1, require all new identity fields, a normalized currency, existing
business_id equal to borrower_business_id, and player_id equal to the captured
initiating operator solely for retained storage compatibility, not liability.
The initiating actor is immutable; current operating permission is resolved anew.
Business debt survives operator replacement without changing borrower identity.

Require composite foreign keys `(game_session_id, initiating_operator_player_id)`
to players and `(game_session_id, borrower_business_id)` to business_entities,
using existing matching unique keys or explicitly bounded supporting indexes.
Business currency must match the bound application/loan and settlement account;
application-to-loan borrower, actor, game and currency must match. c1 constrains
stored shape/scope; c2 establishes atomic copy/account validation and immutable
business identity enforcement before any business_v1 record can exist.
Expose no internal IDs in browser contracts. Keep current service-role/RLS grants;
no new route, RPC, browser field, permission or lending offer in c1.

Exact disabled-creation mechanism proposed for c1: install validated CHECK
constraints `loan_applications_business_liability_disabled_v1` and
`player_loans_business_liability_disabled_v1`, each `CHECK (liability_kind = 'legacy_v1')`.
These reject both INSERT and UPDATE into business_v1 for every ordinary writer,
including service-role RPCs; a frontend flag or absent caller is insufficient.
No function disables or bypasses them. c2-c4 leave both constraints installed.
Their business-path qualification may remove them only inside a disposable test
transaction that is rolled back, with the disabled production shape tested too.
Only separately accepted c5 activation SQL may remove them, after c1-c4, b3 and
all authority/default/compatibility evidence pass. Hosted activation still needs
separate exact-source runtime/release approval; this design grants none.

## Exact c1 proposed scope and migration registration

Maximum seven meaningful files / 350 semantic changed lines, including evidence,
authority and generated changes. Obtain parent acceptance before any implementation.

1. `backend/supabase/migrations/<CLI-generated-version>_add_loan_liability_contract_v1.sql`
2. `backend/src/domains/business-banking/contracts/playerBusinessBankingContracts.ts`
3. `scripts/business-banking-runtime-contract.mjs`
4. `scripts/banking-fx-database-acceptance.sql`
5. `docs/operations/evidence/refactor-execution-v1/REF-025/u5-liability-schema.md`
6. `docs/operations/contracts/player-cross-cutting/pr-<assigned-number>.json` if required
7. `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` if required

Only the migration version and PR number are deferred identities, not wildcards
for extra files. Resolve them at activation, before edits to registered scope.
Generate the forward migration through the repository's Supabase CLI, verify a
unique 14-digit version on fresh main and active branches, and register its exact
path/hash with the parent. No historical migration or release-manifest rewrite.
No migration is generated, reserved, applied or dispatched by this documentation.
If real schema/test needs exceed this budget, split and re-register before editing.

## Registered continuation and ownership gates

Every child is separately accepted, under400 semantic changed lines and at most10
meaningful files. Before each starts, register exact paths, budget, migration
identity, predecessor acceptance and shared-file handoffs. These are obligations,
not blanket authorization to edit whole handlers or dispatchers.

| Child | Accepted predecessors | Bounded responsibility |
| --- | --- | --- |
| c1 | a, b, b2, b3; accepted design/scope | Explicit schema/contract, unchanged legacy behavior, enforced creation gate |
| c2 | c1; income classification resolved | Atomic origination/approval, business income and operator eligibility |
| c3 | c1-c2 | Repayment through current mandate and stable business/account/currency identity |
| c4 | c1-c3 | Servicing/default attribution without personal penalties for business obligations |
| c5 | c1-c4 and b3 | Consistent offer/read/command authority, complete qualification, gated activation |

Business-banking caller seams: `backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts`
and `backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts`.
Business owns `resolve_player_business_v2` and its consumer
`backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts`.
Admin owns `backend/supabase/functions/admin-api/businessBankingOperations.ts`
and `backend/supabase/functions/admin-api/businessBankingLoanSupervision.ts`.
Existing autonomous servicing ownership must be resolved to its exact caller at c4
activation; it is not absorbed into Business-banking by this plan.

Fresh open-PR census: #668/#849 own backend/package.json; #668/#736/#849 share
inventory changes. Obtain a narrow inventory handoff if needed; extend existing
registered checks without package edits. Preserve #668 context/global ledger,
#736 auth/runtime, #624 UI, REF042 Player API/app/Inventory/realtime and REF040
Markets boundaries. #730/#731/#735 retain release/control authority. No unresolved
shared-file collision may run concurrently; refresh this census before each child.

## Acceptance, unresolved classification and rollback

c1: disposable full migration replay twice; unchanged legacy inserts and retained
loan/application/repayment paths; both business creation gates reject INSERT and
UPDATE; invalid shape/cross-game references rejected; unchanged RLS/grants and
browser privacy; injected migration failure leaves no partial schema. Run existing
source/Banking/FX/economic suites and lint with explicit finding disposition.
No mocks or source scans substitute for database evidence. c1 does not certify new
origination, repayment, default, read permission or activation.

c2 must resolve the existing84-day qualifying-income calculation and exclusions,
including capitalization_in, ownership_cash_transfer_in, capital_contribution_in
and ipo_primary_subscription. Classification is unresolved, not approved income;
capital/FX/all-positive-ledger inflows cannot silently become qualifying revenue.
This does not block inert c1 design. Existing product limits and accrual/grace/default
terms stay authoritative. Known ambiguous review status needs explicit scope and
characterization, not a concealed fix.

c2-c5 require one authoritative transaction per mutation; lock-order/race evidence;
exact currency/rounding; same-key replay/different-payload conflict; explicit paid-loan
replay disposition; insufficient funds; concurrent approval/repayment/operator change;
injected rollback of obligation, ledger, receipt and audit; wrong-game/player/role,
revoked mandate, shareholder-without-mandate, no/multiple-business and unavailable
lending cases. Prove business defaults cannot feed personal credit penalties.
Run disposable DB, backend/Player and connected acceptance on exact candidate heads.

Rollback of this documentation is a three-file revert. c1 schema correction is a
reviewed forward migration, not history rewriting. Later code rollback must not
erase valid debt, posted ledger or receipts, nor reinstate personal liability.
Runtime/database/staging validation for this documentation is NOT_RUN; no live SQL,
credentials/settings, capture, dispatch, deployment or hold restoration is authorized.
