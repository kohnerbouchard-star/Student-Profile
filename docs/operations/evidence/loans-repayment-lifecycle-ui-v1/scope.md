# Loans repayment forecast and lifecycle UI

Roadmap: LOANS-REPAYMENT-LIFECYCLE-UI-001. Status: IMPLEMENTED_NOT_MERGED.
Owner: feat/loans-repayment-lifecycle-ui-v1. Base: 08134650.
The user requested this capability on a separate branch and PR. No active Loans
branch/PR owned it at intake; #918 is merged as dff6a05f7475e3e546ca3abcbac17473719e61f7.

## Scope and semantics

Expose #918's bounded application, facility, default and payment records. Debt
remains separated by currency; default does not erase debt. Complete totals are
unavailable for incomplete or inconsistent facility coverage. Application currency
is not recorded in the source schema: current product currency is metadata only.
Payment history preserves posted/reversed state and principal/interest allocation.
Only allowlisted display fields are normalized; unknown/private metadata is dropped.

The old displayed schedule repeated the complete product term on every read.
The additive repaymentForecast is a bounded recorded-balance plan, not an interest
projection or payoff quote. It caps the final installment, subtracts posted payments
allocated to the exact current due instant from the first installment, and never
subtracts those payments twice from the already-updated balance. It uses bigint
cents; no currency conversion or mixed-currency sum is introduced. A 24-installment
window exposes the remaining recorded balance rather than claiming payoff.

The retained repayment RPC in 20260812113000_bind_loan_repayment_accounts_v1.sql
allocates interest first, records applied_due_at, and advances the due date only
when posted payments satisfy scheduled_payment. Its product cadence is seven days
per payment_frequency_cycles. The forecast uses those existing semantics without
changing them. It deliberately excludes interest not yet recorded and future
interest. Missing cadence, incomplete/unallocated payment history, invalid amounts,
and inconsistent facility reads return unavailable rather than inventing terms.
The existing product read is local-currency scoped, so foreign-product cadence can
be unavailable. These separate reads are not an atomic database snapshot.

Existing response fields and all five original query shapes are preserved.
Only the new display uses the new projection; the repeated legacy schedule is not
shown as a verified forecast. Existing application and repayment commands, routes,
authentication, economic policy, and both gated Business lending creation paths
are unchanged. Defaulted and paid history never gains a repayment action.
No schema/migration/RPC, deployment, secret, hosted data or other branch is changed.

## Verification

Pinned Node 22.23.1, npm 10.9.8 and Deno 2.9.3; repository locked dependencies.

- Focused/retained Deno suites: 94/94 (14 new forecast cases plus 80 retained).
- New Player lifecycle/forecast normalization/render cases: 9/9.
- Retained Business/Banking surface tests pass.
- Complete Player verification passes.
- Backend TypeScript and all 28 Edge roots pass.
- Complete backend smoke passes.
- Complete root npm test passes, with the retained macOS GNU-tar platform skip.
- Chromium: 4/4 desktop/mobile cases exercise exact forecast/default display,
  keyboard disclosure toggles, repeated opening, departure/return, authoritative
  refresh, optional-history failure/recovery, no accidental repayment and no overflow.
- Desktop/mobile synthetic fixture screenshots captured; desktop visually inspected.
- Independent read-only reviewer found no actionable source issue and independently
  passed the 9 UI and 14 forecast cases. No files changed during review.
- Architecture inventory is regenerated for 1,320 source files. All debt ceilings
  and measurements remain unchanged. No verifier or ratchet is weakened.

Historical failures were resolved, not relabelled: initial retained golden tests
compared the additive forecast alongside old fields; they now strip only that new
field while preserving every old assertion. Initial browser start collided with
another worker's port; rerun used an isolated port. An unused server scope literal
in the display DTO added an unnecessary compatibility marker; the browser now
omits server-only scope metadata instead of raising any architecture ceiling.

Exact remote-head CI and any required staging/runtime qualification remain pending.
Synthetic browser and unit coverage is not hosted PostgREST/RLS or live repayment
certification. No ready-for-review, merge, auto-merge or production action is claimed.

## Rollback and next step

Revert this isolated read/UI change to remove its optional projection and panels;
there is no persistent economic state or schema to reverse. Next: bind the actual
PR authority, qualify the published exact commit, and return the draft for review.

## Publication

Draft PR: https://github.com/kohnerbouchard-star/Student-Profile/pull/925.
Reviewed implementation: f21a47bd90f34b6732494bccb26636693190222a.
The actual-number pr-925.json authority preserves every merged PR921 check
(118 required, 87 critical), denies production actions, and keeps both verifier
files read-only. No implementation source changes accompany this registration.
Exact-head hosted CI remains pending.
