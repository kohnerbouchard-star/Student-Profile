# Fixed-income curve ownership extraction

- Item: `ARCH-LARGE-MARKET-FIXED-INCOME-CURVES-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; local preparation only, no PR or hosted
  qualification yet.
- Owner: `refactor/market-fixed-income-20261115`.
- Baseline: fetched main `874355480e31eafc5b4b3b2fa4f2fbccf14db9e7`.

## Scope and ownership

Separate versioned curve validation, interpolation/extrapolation and yield
resolution from bond cash-flow analytics. Keep the existing public import path
and all six runtime exports. Direct re-exports retain function and frozen policy
object identity. A small shared yield-policy owner avoids circular dependencies,
duplicate policy objects and duplicated yield validation/rounding.

`fixedIncomeAnalytics.ts` retains all cash-flow generation, accrued interest,
pricing, yield solving, duration and convexity formulas. `fixedIncomeCurves.ts`
owns curve policies/types, country-currency validation, deterministic keys,
bounded interpolation and spread resolution. `fixedIncomePolicy.ts` owns shared
yield bounds and numerical validation/rounding. All 28 original declarations are
retained in full; changes beyond relocation are imports, exports and
deterministic formatting. No validation order, rounding, numerical bounds,
economic policy or error text changes.

There are no API, route, RPC, schema, migration, dependency, production,
deployment, credential or permission changes. Root/backend package scripts,
original tests, REF-003 evidence, financial-statement source and all unrelated
owners remain unchanged. Existing recursive Market workflow discovery registers
both new tests without package-script edits.

The coordinator audited all nine open PR pathsets (#973, #972, #938, #933, #735,
#731, #668, #624, #620): none touches the Market domain. Generated inventory is
the only shared path. Global roadmap reconciliation remains owned by #668; this
bounded evidence records the new scope without editing that ledger.
Notifications/Campaign, roster, CSS, release controls and dependency owners
remain separate.

## Qualification

Pinned local tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Shared existing
dependencies were reused without modifying dependency files.

- Original six fixed-income cases pass before and after extraction.
- All 54 new public-entrypoint characterization cases pass against unmodified
  baseline and candidate (60 combined). Frozen results cover
  exact/interpolated/extrapolated rates, positive/negative slope caps and rate
  clamps, inversion, curve identity/error ordering/deduplication, malformed
  tenors and policies, spread/error precedence, negative-yield policy, coupon
  boundaries, frequencies, supplied prices and full numerical analytics results.
- One additional candidate-only binding test verifies all five extracted public
  runtime bindings are identical to their owning exports.
- Expanded Market domain: 202 passing cases; retained stock engine: 90 passing
  cases.
- Core backend TypeScript, full root `npm test`, architecture
  inventory/ratchets, secret scanning, focused Deno formatting and Git
  whitespace checks pass. The root suite retains its existing
  isolated-PostgreSQL proof skip; no test was weakened or skipped for this
  tranche.
- Four deterministic reference simulations run successfully using the retained
  configuration with `--no-lock --node-modules-dir=manual`: default seed and
  `refactor-parity-1`, `refactor-parity-2`, `refactor-parity-3`.
  Baseline/candidate output comparison is independently owned by the
  coordinator.
- Declaration preservation review accounts for all 28 original complete
  declarations after deterministic formatting and optional punctuation/export
  normalization. Public exports remain six, with no wrapper functions.
- Source physical lines: analytics 513 to 293; curves 308; shared policy 49.
  Inventory line convention counts analytics 514 before extraction. Oversized
  source count falls 77 to 76; source count increases 1,411 to 1,415 (two
  runtime owners and two test modules). Every other architecture debt count and
  ceiling is unchanged.

Local full Edge typecheck and backend smoke are **blocked**, not passing: the
frozen Supabase SDK `@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs`
cannot be retrieved from esm.sh (connection refused). Core TypeScript passes
separately. No dependency or frozen-lock bypass is used for these gates; hosted
exact-head qualification remains required. An initial root attempt caught a
stale generated inventory following test formatting; regeneration and a complete
rerun passed, with original failure evidence retained.

## Completion boundary and next action

No merged-complete, runtime, staging or production claim. This preparation is
committed locally with recovery archive, patch, Git bundle, source-preservation
report and test logs. The coordinator must independently review and restore the
exact committed tree, reconcile any changed main/inventory, publish only when
authorized, register actual-number qualification authority, and run all required
final-head hosted gates before the normal serial merge. Production remains held.

Next exact item: qualify `ARCH-LARGE-MARKET-FIXED-INCOME-CURVES-001`; the
separately owned `ARCH-LARGE-MARKET-FINANCIAL-STATEMENTS-001` must remain an
independent batch.

## Provisional reviewed-Statement union

Local preparation normally merges exact reviewed Statement draft head
`c92dab1db2425332ba8b947938cfcdb0fe84322c`, tree
`8520f06290902f9eff3aa85f87aa839a3412fd65`, through local merge
`3518e8c41e4040080853dc39eb5861b99529b406`. The actual-main baseline remains
Campaign merge `b7e37658f1f5cbbc64a9a19fd011f0996fbcadd9` for this checkpoint.
Statement PR #974 is still undergoing hosted qualification: this is not an
actual-main integration or a claim that Statement has merged.

Preserve original Fixed Income implementation
`5a90f87a1f17a65fb0a56a983c1ae4c780603dcf` and its complete recovery. Only
generated inventory conflicted and was regenerated. All original Fixed Income
runtime/tests and every incoming Statement, Campaign and Notifications
source/test, authority, PR-filter registration and other workflow byte remain
unchanged. All previous roadmap bytes are preserved with exactly one bounded
Fixed Income intake insertion. No actual-number authority is guessed or created
for this batch.

The union has 1,423 source files and 73 oversized files, versus 1,419/74 on the
reviewed Statement draft. All other architecture debt counts and ceilings remain
unchanged. Combined Market, retained Stocks, core TypeScript, full root,
architecture, secrets and whitespace checks must qualify the committed local
union. Their exact outputs and identities are retained in the separate
provisional union recovery package. Earlier source-stage passes do not qualify
this union. The known frozen SDK refusal still prevents claiming complete
Edge/backend smoke qualification; unchanged blocked requests are not retried.

Stop at this local prepared union. After Statement actually merges and its
required postmerge evidence clears, normally merge actual main, preserve any
intervening changes, regenerate inventory if needed, and repeat final gates and
independent review before coordinator-authorized draft publication and
actual-number authority. Final hosted qualification, normal serial merge and
postmerge verification remain mandatory. No remote publication, merge, dispatch,
live mutation or deployment is performed by this preparation; production remains
held.

## Actual-main integration checkpoint

Statement PR #974 merged normally at actual main
`4f62ab63247cd71f44ab4bff583ba16db8fc1cd4`, tree
`8520f06290902f9eff3aa85f87aa839a3412fd65`, with parents Campaign main and
reviewed Statement head. Local normal merge
`ed76af8210537195f87452308c07b4fb8d166e22` preserves original Fixed Income
implementation and provisional union history and integrates this actual main
without conflicts. Earlier provisional statements above describe that
checkpoint, not current main. This batch remains `IMPLEMENTED_NOT_MERGED`.

Actual-main scope is eight paths: five unchanged Fixed Income runtime/test
blobs, generated inventory, this bounded scope and exactly one own roadmap
entry. All other actual-main bytes, including Statement authority and workflow
registrations, package scripts, dependency locks and REF-003 evidence, remain
unchanged. Inventory moves from 74 to 73 oversized source files and from 1,419
to 1,423 total source files; all other counts and ceilings remain unchanged.

Fresh committed-head combined Market, Stocks, core TypeScript, full root,
architecture, secrets, formatting, whitespace and preservation gates are
required and recorded in the actual-main recovery package. Prior local frozen
SDK/Edge and smoke limitations remain explicit; no dependency workaround is
introduced. Exact-head hosted Full Financial Markets qualification must close
that gap for this batch, even though Statement already passed its own hosted
gates.

The coordinator must independently restore and review this complete source
archive, actual-main-relative patch and full-history Git bundle before draft
publication and actual-number authority registration. No PR number is guessed.
Statement postmerge audit must clear before the next normal main merge. No
remote mutation, deployment or production action occurs in this local work.

## Actual-number draft qualification

Verified draft
[PR #975](https://github.com/kohnerbouchard-star/Student-Profile/pull/975)
publishes reviewed source head `44239f1d2b559ff9cd9ab5dccb06bf311fc25f2a`, tree
`ba41860942d73989442a76be2e292dcdd7d49db9`, against actual Statement main
`4f62ab63247cd71f44ab4bff583ba16db8fc1cd4`. This metadata remains local until
independent review and coordinator publication.

Own PR #975 authority preserves the exact ordered 151 required and 105 critical
identities from main's PR #974 authority, including Full Financial Markets. All
production, mutation and secret-value permissions remain false. Exactly 49
inherited pull-request filters gain only this authority path. The complete
main-relative delta is 58 files, locked by 61 allowed/required paths including
three unchanged read-only locks: both authority verifier files and Full
Financial Markets workflow. Source, package scripts, census and all prior
authorities and workflow bytes are retained.

Event-action-aware qualification requires 63 opened/synchronize/reopened PR
workflow families successful, plus separate dynamic CodeQL and both exact-head
funding-core jobs. Closed-only Branch Hygiene is not an opened PR family. The
main push set remains 28 families with separately reviewed guarded skips. Any
changed head/base/pathset requires re-derivation rather than a relaxed gate. All
original 151/105 identities and Player logical steps remain mandatory.

Committed metadata gates and recovery are reviewed separately from initial
source evidence. Full hosted qualification, normal expected-head merge and
postmerge audit remain pending. Statement #974 postmerge clearance is required
before this batch can merge. No production action is authorized.
