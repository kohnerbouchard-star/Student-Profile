# REF-037 — Internal Dashboard financial projection

Status: VERIFIED_COMPLETE (bounded repository seam only). Base: `6288e2e8646771cec66402b64eec631029602091`.
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

Root npm test passed after staging the regenerated inventory. Draft PR #799
reserves this scope; its initial documentation commit is
`3225c74329f7d9524e7d8f4c490b92b003e3dfa0`. Exact PR authority is
`docs/operations/contracts/player-cross-cutting/pr-799.json`; verifier and tests
remain unchanged. Seven meaningful paths plus one generated inventory path.

## Exact-head qualification and serialized integration

Implementation head `507f883c0ea9a86e8c583b5e4010ab1908620b7a`, tree
`952f1625b0c44ca809bb47b20d0ea9ed40d854b8`, passed all 32 observed PR
workflows (31 success, one intended skipped). This includes Business Financial
Market, Backend Typecheck/full smoke, Player Terminal Verify, Multiplayer,
Repository Quality and Store FX/cutover qualification. Local complete owning
Business financial Deno suite passed 61/61; final root tests and backend tsc pass.

Integrated REF-036 closeout main `09fd066c44a8b49f69b36eca1ba6b3baacddd8ce`
once by normal merge, preserving its workflow, acceptance harness and three
records. No conflict. Recomputed inventory is unchanged. REF-037's production
projection is unchanged by integration; the inherited Staff qualification
workflow now also exercises the accepted REF-036 progression harness. Fresh
combined-head CI is required before merge; prior-head results are not reused
as combined-head evidence.


## Verified completion

PR [#799](https://github.com/kohnerbouchard-star/Student-Profile/pull/799) merged
as `5cce070918f517e8387e6150f62853a129111232` after independent review.
Original implementation head `507f883c0ea9a86e8c583b5e4010ab1908620b7a`
and combined head `09045515476881f7c04557f411c43aa7d5c3ff8d` each separately
passed all 32 observed PR workflows (31 success, one intended conditional skip).
Combined tree `9121dd85e2fed3a77cc6231f3c8f92f77592f361` exactly equals the
fetched merged-main tree. Final combined qualification includes Business
Financial Market `36859606812`, Staff/Progression qualification `36859606481`,
and connected Player Store cutover `36859607045`; these are PR-head evidence,
not mislabeled main runs. Local merged-main Dashboard 21/21 and architecture
checks also pass.

Merged-main checks reached terminal on 2026-10-01: 17 workflows, 16 success
and one intended skipped Edge inventory workflow. Across their 41 jobs, 34
succeeded and seven were expected conditional skips (two inventory, four
release parity/publication, one dependency review); none failed or remained
pending. Main runs include:
- Repository Quality `36861426520`, Backend Typecheck `36861426809`
- Player Local Currency `36861426538`, Supply Chain `36861426576`
- Store cutover `36861426704`, Atomic Settlement `36861426812`
- Store offers `36861426667`, withdrawal `36861426612`, listing `36861426727`
- Timed Manufacturing `36861426748`, CodeQL `36861427267`
- Beta Security `36861426567`, Beta Pilot `36861426775`
- Timezone `36861426657`, Runtime Wiring `36861426557`
- Production Git Release contract `36861426606`
- Edge Inventory `36861426772` (both live convergence jobs intentionally skipped)

Main Store cutover's six jobs passed, including full Chromium, connected
Buyer/seller journeys in two games, twice database replay/lint, serial/race/
isolation acceptance and all Edge roots. No new runtime deployment or production
mutation was requested or performed. Release parity/publication jobs and
live inventory convergence remain conditional skips, not claimed live evidence.
Only this evidence, REF-037's task and its manifest record change in closeout;
the other 49 task records, protected owners and global beta ledger are preserved.
No scoped blocker remains. Next exact ticket: REF-038, independently preflighted.
