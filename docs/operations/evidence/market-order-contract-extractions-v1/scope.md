# Market order and contract responsibility extraction

- Item: `ARCH-LARGE-MARKET-ORDER-CONTRACT-MODULES-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, local preparation only.
- Base: `d2d951e542b12e9e47f6db1783bdf4ef9993e930`.
- Owner: `refactor/market-order-contract-modules-20261115`.

## Scope

Separate deterministic price-time matching, priority ordering and digest
creation from order-book admission and transitions. The original order-book
facade retains all types, validation, replacement, cancellation and reservation
calculations. Separate reservation admission/transition/decimal validation from
reservation state transitions, without changing validation or error precedence.
Decompose financial-market investment-product and exchange/trading lifecycle
contracts into cohesive type-only owners, retaining the original public import
path.

The three original files become 495, 468 and 455 physical lines; new
runtime/type owners are 217, 199, 143 and 130 lines. Inventory falls from 73 to
70 oversized sources, with source count 1,423 to 1,430. All other debt counts
and ceilings stay unchanged. Original public exports are preserved (15, 14 and
68 type/runtime exports). All 128 complete original declarations preserve
signatures, literals, expressions and operations; only relocation,
imports/exports and deterministic formatting differ. A complete lexical
preservation map retains literal contents and normalizes only export modifiers,
whitespace and optional trailing commas.

Price-time maker selection, input ordering invariance, blocked self-trade pairs,
trade IDs/digests, partial fills, reservation deltas, transition keys and
terminal metadata remain unchanged. Reservation scope, exact decimal policy,
full-fill restriction, fees, limits, budget consumption, replay/version checks
and error ordering remain unchanged. Type-only dependency edges introduce no
runtime cycle.

No schema, migration, API/route/RPC, economics, authentication, live data,
dependency, workflow or package changes. All original test files remain exact.
Recursive Market workflow discovery includes the new tests without package
edits. Global roadmap and final union inventory reconciliation remain
coordinator-owned. The separately owned Market analytical extraction and
Staff/Story batches are not included in this branch.

## Qualification

- Thirty new public-entrypoint characterizations plus sixteen retained order
  cases pass on exact original main and candidate: 46 baseline, 47 candidate
  including one candidate-only binding test for all twenty extracted types.
- Characterizations freeze matching order, price, exact trade IDs and digest,
  input preservation, self-cross handling, reservation amounts/IDs, favorable
  fill release, terminal behavior, validation precedence and public-ID bounds.
- Complete Market domain: 293 passed before final metadata qualification.
- Core TypeScript and the complete declaration/public-export preservation check
  pass. Final committed-head root, Market, Stocks, architecture, secrets,
  formatting and whitespace results are retained with recovery evidence.
- An initial root attempt stopped at the expected uncommitted inventory diff.
  Its log is preserved; it is not counted as a successful root run.
- Full Edge/backend smoke remain incomplete at the unchanged frozen esm.sh SDK
  retrieval restriction. No dependency bypass or repeated blocked download was
  attempted, and local source checks do not constitute full aggregate success.

## Completion boundary

All publication and merges are held while the requested parallel large-file
preparation is underway. No PR number is assigned or guessed. Recovery includes
exact base/head/tree, source archive, base-relative patch, complete-history Git
bundle, preservation map, and logs. Independent source/recovery review, final
union reconciliation and exact published-head hosted qualification are still
required. No production action is authorized or performed.
