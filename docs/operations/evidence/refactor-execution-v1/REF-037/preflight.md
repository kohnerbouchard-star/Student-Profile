# REF-037 — Internal Dashboard financial projection

Status: IMPLEMENTED_NOT_MERGED. Base: `6288e2e8646771cec66402b64eec631029602091`.
Risk R2; ARCH-400/401. REF-021/026/031 are VERIFIED_COMPLETE in the base manifest.

## Scope and ownership

2026-10-01 current-owner reconciliation found no Dashboard owner. Parallel #797
owns REF-036 qualification only. Preserve #736 Player auth, #668 context/global
ledger, #624 CSS, #690 planning and #730/731/735 release controls. No runtime,
production, credential, security, SQL, valuation, ranking or UI policy changes.

Exact meaningful edit allowlist (ten maximum):
- `backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts`
- `backend/src/domains/game-dashboard/infrastructure/dashboardFinancialProjection.ts`
- `backend/src/domains/game-dashboard/api/playerGameDashboardHttpHandler.test.ts`
- this evidence record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-037.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-037 only)
- PR-specific Player cross-cutting authority and its existing registry/test, if required

Generated architecture inventory is separate. No package or workflow edit is
needed: the existing business-financial-market workflow already runs this
Dashboard suite. The local-currency lexical guard remains unchanged and passes.
Parent serializes backlog/inventory integration and review/merge.

## Characterization and mechanical boundary

The same 15 operations remain in one Promise.all. The same scoped table/RPC
calls, select columns, orderings, limits, country conditional read and error
mapping are retained. There is no I/O in the new projection and no new cache.
The full repository class and leaderboard remain unchanged. Auth, capability,
HTTP handler, public contracts and all database authorities remain unchanged.

Move toCashDto, toHoldingDto, summarizePortfolio, balanceTotalForCurrency,
resolveValuationCurrency, normalizeCurrencyCode, unique, sum, toNumber and round,
plus AccountBalanceRow and StockHoldingRow, to the internal infrastructure module.
The repository imports its existing shared helpers instead of duplicating them.
No public barrel is added. All ten function bodies match the base text exactly;
only export markers and the exported sum signature's formatting differ.
Local/ECO separation, UNKNOWN, partial_unconverted, positive position counts,
six-decimal rounding, malformed/nonfinite numeric defaults and missing-stock
zero valuation all retain their existing policy, including defensive behavior.

Before moving code, the existing 19 tests passed; a sixth-scenario matrix added
one test and passed at 20. The matrix freezes SHA-256 of complete synthetic
snapshots and complete query traces (table/RPC, columns, filters, ordering and
limits). Scenarios: scoped other-game/other-player rows, empty/new player, mixed
currency and fractional/invalid numbers, missing optional stock projection,
1,000 holdings, and injected account dependency failure. Each has 18 read calls
except empty, which has 17 because no country-profile lookup is needed. These
are measured fake-client read counts, not database latency measurements.

The separate pure-input test passed against definitions extracted from exact
baseline source and against the final module. It covers ambiguous and preferred
currency, UNKNOWN, ECO cash, currency group sorting, missing stock, nonfinite
numbers and positive position counts. The final owning suite has 21 passing tests.

## Validation checkpoint

Tools: pinned Node 22.23.1, npm 10.9.8, Deno 2.9.3 and existing lock/cache.
Passed:
- Dashboard Deno suite, 21/21, with --allow-env
- Player dashboard-profile, dashboard-refresh, connected-reads, banking-read,
  banking-fx and market-holdings fixture/source checks
- unchanged player-local-currency-authority-contract
- architecture ratchet after regenerated inventory, high-priority boundaries,
  legacy-runtime audit and credential scan
- backend TypeScript phase

Initial aggregate architecture/root tests stopped on intentionally uncommitted
regenerated inventory; final committed-source rerun is required. Initial
compatibility marker census counted the new test title's word "fallbacks" as a
new legacy file; the title was made precise ("invalid numeric defaults") without
changing any assertion or source behavior. Ratchet limits remain unchanged.
Edge typecheck and full smoke are locally BLOCKED by refused download of pinned
esm.sh Supabase 2.108.2. CI must supply exact-head results before acceptance.
No live/staging queries, production changes or deployment evidence are claimed.

## Measures, review and rollback

Production repository: 1,131 -> 959 lines; extracted module: 199 lines. Net
production growth is 27 lines of imports/exports/comments and formatting, not a
claim of deletion. Source/test census: 1,264 -> 1,265; Dashboard: 9 -> 10;
recorded cross-domain imports stay 162: internal type aliases index the existing
DashboardSnapshot contract rather than adding cross-domain imports. Oversized count stays
99, persistence-outside-infrastructure stays 52, compatibility count stays 209.
No architecture ceiling changes. Existing callers still use the same repository.

Three source/test paths; 212 changed test lines and 13 added repository import
lines, plus module imports/comments and export markers: non-move semantic
surface is below 400 lines. The larger textual diff is the exact-body mechanical
move, reviewed separately before implementation. No business behavior changes.

Rollback is a normal revert of this projection/import/test change together;
there is no data operation. Stop on output/query parity differences, ownership
collision or missing required checks. Next exact serial ticket is REF-038 after
REF-036/037 review and acceptance; this record grants no completion credit yet.
