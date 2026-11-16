# REF-040 U6a — retained calculation characterization

REF-040 remains **BLOCKED**, dependent on REF-038; no completion credit.
Base: `fd0d8a616f4db78c4dfd463542e3514663f9a9fc` (fresh main, 2026-10-02).
Branch: `refactor/ref-040-u6a-characterization`; parent reviews and merges the draft.
The [interim amendment](u6a-interim-outcome.md) and [historical preflight](preflight.md)
remain intact; D3-A stabilization does not deliver D3-B production integration.

## Approved scope and behavior

Exactly three editable paths: this new evidence document and
`backend/src/domains/markets/calculations/bondMath.test.ts` plus
`backend/src/domains/markets/calculations/decimalMath.test.ts`.
Budget: at most 380 nonblank changed lines, including comments and metadata.
No production code, formula, public barrel, package, workflow, migration, runtime,
REF-042, U1, credential, release or CampusPay change is authorized or included.

Eight added bond cases characterize rate/nonfinite bounds, nonpositive/rounded
amounts, date/error precedence, leap/month-end/day-count references, maturity and
continuous discounting, early-zero ordering, schedule/identity rejection and recovery.
Three added decimal cases cover signed rounding ties, malformed/nonfinite inputs,
rounded-zero division and clamp bounds. Existing positive and round-trip tests remain.
Expected values use explicit references, not a copy of implementation algorithms.
Synthetic identities reuse the existing fixture; no capability registration is added.

Known behavior is not approved product policy: accrued interest returns early zero
before full bond validation; backward coupon scheduling carries clamped month days;
continuous bond valuation is not equivalent to periodic fixed-income analytics.
**Potential defect requiring separate owner decision:** any non-null `recoveredAt`,
including malformed, impossible or future dates, suppresses recovery flows without
validating/comparing that date, while recovery valuation remains nonzero. The named
regression records this behavior explicitly; it neither fixes nor blesses it.
No instrument, issuer, funding/liability, date convention or recovery policy is selected.

## Qualification and exact-source limits

Tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3; Deno official release archive checksum
`8101865641cbede56f08ad19c0a67a87df84bce127fee0d3e3e1f7467717ffa6` verified.
Tools/caches/logs are disposable `/tmp` files. Lockfiles remain unchanged. Local test
processes exclude live credentials and retain the workspace proxy/trust settings.
Results below apply to the base plus this bounded test delta; published head and
exact-head CI/diagnostic links are recorded in the draft PR, not invented here.

- `deno test --config backend/supabase/functions/deno.json --lock=backend/supabase/functions/deno.lock --frozen backend/src/domains/markets`: exit 0, 147 passed/0 failed.
- Same frozen flags with `backend/src/domains/stocks/calculations/stockMarketEngine.test.ts`: exit 0, 31 passed/0 failed.
- `npm --prefix backend run test:player-market-assets`: exit 0, 73 passed/0 failed.
- `npm --prefix backend run test:stock-market-calendar`: exit 0, 67 passed/0 failed.
- `npm --prefix backend run typecheck:all`: exit 1; TypeScript completes, Edge-root check blocked downloading pinned `esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` through the proxy.
- `npm --prefix backend run smoke`: exit 1 at Game Sessions' same dependency; 879 preceding Deno cases passed; this is partial evidence, not full smoke qualification.
- `npm test`: exit 0 after fixture-identity correction; initial attempt found three synthetic IDs in the capability-string inventory. Reusing established fixtures fixes that test-only issue; generated inventory is not part of this scope.
- `npm run security:secrets` and `git diff --check`: pass; final scope/link checks and root audit result are reported with publication.

Historical `d032df9fcb7aadd63d03d5af7bd9210cb92db994` results remain separate:
136/31/73/67 focused passes, root checks passed, backend incomplete. They are not
relabelled current-head evidence. No staging, live database or runtime checks ran.

## CI and remaining acceptance gates

Both test files match Backend Typecheck's `backend/**` and Full Financial Markets
Expansion's `backend/src/domains/markets/**` PR filters. No filter amendment needed.
Markets checks out exact PR head and runs directory/Stock tests and direct full
backend typecheck/smoke. Its existing `--no-lock` test command does not replace the
local frozen runs above. Backend Typecheck checks the merge ref and its grouped
`set +e` typecheck status can mask an earlier failure: inspect actual diagnostics
and require direct exact-head Markets results, not just a badge. PR620's artifact
version edits are separate workflow ownership; this scope does not touch them.

Fresh caller scan retains three direct bondMath importers (its test and two internal
helpers), zero external production consumers/public indexes, and the unchanged pure
bondMath+decimalMath runtime closure with type-only financialMarketContracts.
Full backend qualification, independent review and an accepted accountable expansion
continuation with concrete existing EXP-MKT mapping/prerequisites/lifecycle exits
remain closeout gates. Historical Chat3/PR305 is not that handoff. U6b controller,
shared-file/migration, API/capability, release-train and product decisions remain open.
Broader fixed-income/callable gaps are not claimed exhausted by these tests.
Next: parent exact-head review; keep REF-040 BLOCKED. Rollback reverts only this
three-file characterization, preserving production formulas and all release holds.
