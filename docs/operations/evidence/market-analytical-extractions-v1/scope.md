# Market analytical calculation extractions

- Item: `ARCH-LARGE-MARKET-ANALYTICAL-CALCULATIONS-001`.
- Status: `IMPLEMENTED_NOT_MERGED`. Local preparation only; no PR, remote
  publication, merge, deployment or live mutation.
- Base: `d2d951e542b12e9e47f6db1783bdf4ef9993e930`.
- Branch: `refactor/market-analytical-calculations-20261115`.

## Ownership

Collective investment valuation and validation stay in their original
entrypoint. Index methodology, weighting and deterministic rebalance move
together to `indexMethodology.ts`. Shared decimal guards and rounding belong to
`collectiveInvestmentNumericPolicy.ts`.

Statement policy adjustment and bounded deterministic series stay in their
original entrypoint. Statement metrics, ratio guards and credit scoring move
together to `financialStatementMetrics.ts`; shared clamp/round belong to
`financialStatementNumericPolicy.ts`.

Bond valuation, accrued interest and holding cash-flow construction stay in
their original entrypoint. Coupon generation, date parsing/day counts and
definition validation move together to `bondCouponCalendar.ts`. Shared
structural types move to `bondCalculationTypes.ts`.

All original public exports remain available, with direct reexports of moved
declarations. All 77 original declarations retain their exact signatures and
bodies (only internal export modifiers are added where needed). No formulas,
errors, validation order, random calls, assertions, thresholds, packages,
dependencies or workflows change. Original tests are untouched. Each resulting
runtime owner has fewer than 500 physical lines.

## Verification and limits

The same 33 new public-entrypoint characterization cases and 24 retained focused
cases pass on original baseline and candidate. They cover leap years, coupon
clamping, exact errors/precedence, cash-flow order/identities, filtered index
components, deterministic tie ordering, all event-adjustment bounds, collapsed
growth bounds, zero denominators and metric error ordering. The recursive Market
workflow discovers the new test automatically.

Full Market, Stocks, root, core TypeScript, architecture, secret and whitespace
gates are recorded against the final local commit in the recovery evidence.
Original declaration formatting is retained rather than rewriting bodies to
satisfy newer Deno formatting; formatting results are separately recorded. Full
frozen Edge/smoke remain blocked by the previously established esm.sh SDK
retrieval refusal, not waived or retried. No claim of aggregate frozen success
or release readiness is made.

Recovery evidence includes the full source archive, verified full-history
bundle, exact base-relative patch, declaration preservation map, head/tree
manifest and command logs. Integration must regenerate the architecture
inventory and rerun exact-head gates after combining independently owned
batches. The global roadmap, contracts facade, order state machines, Staff
Contract HTTP and Story engine remain separately owned.
