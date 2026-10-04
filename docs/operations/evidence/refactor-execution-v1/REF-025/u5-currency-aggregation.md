# REF-025b2 — Exact per-currency Loans projection
Base: `0384fe285a12b2e429e1cb28ac46dfea9519a346`; parent-approved seven-path scope,
maximum350 changed lines. REF025 remains BLOCKED; 025b3 actual consumer is required.
Paths: existing Business-banking contracts, Supabase repository and route tests;
new domain/loanCurrencyProjection.ts; this evidence; PR-bound authority manifest;
generated docs/architecture/inventories/econovaria-architecture-inventory-v2.json.
Main freeze is preserved; feature-branch review only, parent controls merge.
## Contract and transport
Optional currencyProjection version1 retains every pre-existing response field.
Only product/loan selects add text-cast aliases; one context RPC/five queries and
all predicates, eligibility, order/limits, schedules, permissions and rights stay.
Eligible offer maxima and active/delinquent/restructured principal+interest sum
within each currency. Next payment sums all active obligations at the earliest
instant per currency; equal dates combine. Schedule installments sum per due date.
Groups/dates sort deterministically. No FX, cross-currency total or economic write.
Strict nonnegative numeric(14,2) strings become BigInt minor amounts; output uses
two fractional digits (loan column scale, not a new currency-registry precision).
No rounded JS-number input/coercion. Treasury's registry-precision Money contract
is not relabeled as loan-column scale; no cross-domain helper import is added.
Empty input is complete with empty groups. Valid absent membership is 0.00; missing
or invalid amount makes the affected aggregate null and complete=false. Missing
currency rows are counted once, excluded from groups and mark the whole projection
incomplete. Invalid due dates make next payment amount/due null. Partial groups
must not be presented as complete totals. Existing numeric totals remain untouched.
Disposable proof used PostgreSQL17.6, PostgREST14.14 (pinned CLI's server version),
and PostgREST JS2.108.2 npm distribution (Edge's package version, not its esm bundle).
Two real REST selects preserved aliases, numeric old fields, game/player filters,
nulls, zero and 999999999999.99/0.01/0.10 strings. No view/RPC or application schema
change was needed. Synthetic fixtures only; three containers/internal network removed.
Frozen Edge esm.sh imports remain locally blocked; this proof does not certify a
hosted deployment. Prior mock-only evidence is not substituted for this REST proof.
## Qualification and limits
Predecessor708cbbdb:13 successful runs/two expected skips; accepted patch identical.
Main freeze/independent owner rehearsal remain.
Owning tests assert full old payload parity, exact query trace, mixed/missing
currency, zero/unavailable, precision rejection, >safe-integer totals, equal-date
sums, ordering and preserved denial/errors. Validation commands/results and exact
head CI are recorded in PR metadata. No live SQL, settings, deployment, dispatch,
release-hold restoration or U1 guard changes. No whole-parent completion credit.
Inventory only adds one source file (1271->1272; domain6->7), no debt/ceiling change.
Rollback removes additive projection/aliases/helper; no balances or liabilities move.
