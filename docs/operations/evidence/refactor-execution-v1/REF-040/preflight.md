# REF-040 — retained Markets calculation scope blocker

## Identity, ownership and disposition

- Audited source: `b85a337bd74683484aa6395483cecaecd55072c8` (2026-10-01).
- Task: REF-040; risk R2; ARCH-206/ARCH-402; dependency REF-038 is VERIFIED_COMPLETE.
- Status: BLOCKED, pending scope clarification. This record is documentation-only.
- Active PR review: #805 owns Stock-runner qualification and subsequent execution separation. Protected #736/#735/#731/#730/#690/#668/#624 and dependency #620 remain separate. No active Markets boundary owner was found.
- Editable paths: this evidence record, `tasks/REF-040.md`, and only the REF-040 object in `backlog.json`. No other task status, global ledger, runtime, tests, workflow, package, inventory, schema or production configuration is changed.

## Approved-feature classification

The selected family is retained isolated expansion-domain work, not a dead-code candidate approved for removal. `docs/markets/full-financial-markets-expansion-authority-v1.md` assigns the full financial expansion and includes corporate/sovereign/agency bonds, coupons, maturity, accrued interest, default and recovery. Its controller gate requires separate persistence/shared integration ownership, migration range, collision rules and staging release train. `docs/markets/full-financial-markets-pure-domain-completion-v1.md` and `active-domain-tranche-v1.md` explicitly describe these pure calculations and preserve the integration hold. `callable-bond-policy-v1.md` likewise keeps activation disabled.

Historical prose saying PR #305 is draft/unmerged is stale. The live [PR #305](https://github.com/kohnerbouchard-star/Student-Profile/pull/305) metadata was checked: merged on 2026-07-25 as `8e07ba06fec84adfc4154515a2b544f04387dd35`, from `785b2c9fb10b8d754fd30caa804dd66c7f4d81ac`. Its merged isolated implementation is present here. That source merge does not establish approval or existence of persistence, API registration, capability publication, activation or production consumers. No such approval was found in the current task or authoritative beta/architecture roadmaps.

ARCH-402 calls for minimal boundaries for cross-domain use; REF-040 explicitly requires classification when the selected family has no production consumer. There is no existing public seam to certify. Creating `markets/index.ts` solely to route internal helpers/tests through it would manufacture an unused public API and would not satisfy the intended consumer migration. No source movement, deletion, activation or replacement family is authorized by this evidence.

## Exact caller and import-closure evidence

A repository-wide textual source/import/dispatch/configuration search covered 4,069 tracked paths (2,906 TypeScript/JavaScript/HTML/JSON/YAML/SQL paths). All occurrences of the three module basenames outside documentation were inspected; runtime roots, scripts and workflow registrations were separately checked.

- `bondMath.test.ts` imports accrued interest, holding cash flow, recovery, coupon schedule and valuation functions.
- `callableBondPolicy.ts` imports only `calculateDayCountFraction` and `generateBondCouponSchedule` from bondMath; its only importer is `callableBondPolicy.test.ts`.
- `fixedIncomeAnalytics.ts` imports the same two helpers; its only importer is `fixedIncomeAnalytics.test.ts`.
- No Stocks, Edge, browser, scheduled job or runtime registration imports any of these three modules. No dynamic import or string dispatch for them was found.
- `.github/workflows/full-financial-markets-expansion.yml` intentionally runs the whole Markets directory as tests and a separate reference simulation CLI; the latter does not reach this bond family.
- The bondMath runtime closure is itself and `decimalMath.ts`; `financialMarketContracts.ts` is type-only. The module has no IO, hidden clock reads, external imports or mutable module state. No cycles or new runtime dependencies are introduced because source is unchanged.
- Before/after: three direct bondMath importer files, two intra-domain helper consumers, zero external production consumers, zero Markets public index files; all counts unchanged. This is a retained-code classification, not proof of dead code or production readiness.

## Preserved calculation contract

Seven pure exports: `generateBondCouponSchedule`, `calculateBondAccruedInterest`, `valueBond`, `calculateBondHoldingCashFlow`, `calculateBondRecoveryValue`, `calculateDayCountFraction`, and `buildBondCashFlowIdempotencyKey`. Five exported interfaces describe valuation/default/cash-flow inputs and outputs. Cash-flow identities are calculated strings; they do not perform settlement or ledger writes.

Amounts and face quantities use decimal strings with six fractional digits and BigInt-scaled arithmetic; multiplication/division round half away from zero. Annual yields/coupon/recovery rates use finite numbers in [0,1] where validated. Returned annual yield uses eight decimal places; day-count fractions use twelve. Dates use validated YYYY-MM-DD UTC boundaries. Yield valuation uses the existing continuous exponential discount. Face amounts/quantities must be positive after decimal parsing; invalid dates/amounts, reversed day counts, invalid schedule relationships and malformed idempotency identities throw existing Error messages. Accrued interest preserves early-zero behavior at/before issue, at/after maturity and for zero coupons; valuation at/after maturity returns zero prices and no remaining flows. Default/recovery and existing validation ordering remain unchanged.

## Verification at the audited source

Pinned tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Tests used the neutral Deno configuration, existing committed lockfile and frozen resolution; no production credentials or network permissions were supplied.

- `deno test --config backend/supabase/functions/deno.json --lock=backend/supabase/functions/deno.lock --frozen backend/src/domains/markets`: exit 0; 136 passed, zero failed, across 28 existing test files. This includes the existing six bondMath tests and fixed-income/callable/decimal tests. It does not claim newly added exhaustive invalid/nonfinite characterization.
- Same Deno flags with `backend/src/domains/stocks/calculations/stockMarketEngine.test.ts`: exit 0; 31 passed, zero failed.
- `npm --prefix backend run test:player-market-assets`: exit 0; 73 passed, zero failed.
- No source refactor occurred. Full backend typecheck/smoke, connected staging, production, database acceptance and runtime deployment were NOT_RUN for this classification; no completion credit is claimed from the focused tests.

## Required next decision and rollback

Keep REF-040 BLOCKED until approved feature scope identifies a production consumer for this calculation seam or the owner explicitly changes the task outcome. Do not silently call it complete, defer/remove feature scope, activate instruments or substitute another calculation family. Unrelated eligible REF work may continue. Publication/merge of this record does not unblock the source task. Rollback removes only these documentation changes; all calculation modules and Stock/Business authorities stay intact.

Documentation validation: 50 stable unique task IDs, all task paths, acyclic dependency graph, REF-040 evidence link and exact unchanged other 49 backlog records passed. `npm run security:secrets` and `git diff --check` passed. Exactly three documentation/data paths are permitted; source tree contents are unchanged.
