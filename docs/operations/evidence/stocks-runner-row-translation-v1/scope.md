# Stocks runner row translation

Roadmap item: ARCH-LARGE-STOCKS-RUNNER-ROWS-001. Status: IMPLEMENTED_NOT_MERGED.
Base: 75b43ec51fb8659b8e3fae1c197062c676343a3b. Owner: refactor/stocks-runner-repository-20261113.

## Boundary

Keep the complete SupabaseStockMarketRunnerRepository class, client boundary and persistence-error translation unchanged. Isolate persistence row shapes and exact select columns in stockMarketRunnerRows.ts, and pure database-row interpretation in stockMarketRunnerRowMapping.ts. These remain inside the Stocks infrastructure owner, not a new shared abstraction or public domain barrel. The existing repository exposes the same class and four projection exports. Re-exported functions retain their implementations; new helper exports are adapter-internal.

Every original class/method, function, interface and constant body is retained apart from export modifiers. Read ordering remains: session existence, bounded Business-event consumption, tick selection/duplicate check, active assets, represented-country data, active shocks, regime. Every game filter, query order/limit, error precedence and apply_stock_market_runner_tick RPC argument is unchanged. No dual write, auth/context alteration, schema/migration, route/RPC, economic policy, UI or production action. This preserves existing behavior without endorsing every inherited malformed-data choice.

Seven live open PRs were inspected: #620, #624, #668, #731, #735, #933 and #938. None owns the selected Stocks files; roster and Player lifecycle ownership remain untouched. Only the verified #956/#957 predecessor intake records are reconciled. Global-ledger and unrelated historical records remain with their owners.

## Characterization

The original adapter had eleven tests. Sixteen new cases were added before runtime extraction, in the existing registered test file: seven numeric conversion cases; optional numeric/history/key-collision behavior and input immutability; exact fundamental keys; latest-country sequence/date precedence, stable ties and identity; macro rounding/scaling/empty/invalid behavior; inclusive event windows, regime tie and complete I/O ordering; three persistence-error precedence cases; and missing-game/empty-apply boundaries. All 27 pass on unchanged main and candidate. The original eleven cases and smoke registration remain retained.

Physical line counts are 1,002 to 465 for the repository, 182 for rows/selects and 406 for pure mapping. Generated inventory is 1,371 sources / 85 oversized, down from 86. Other counts remain 52 persistence candidates, 70 cross-domain import matches, 26 browser transport shims and 210 marker files. No ratchet ceiling or scanner changes.

## Qualification

Core TypeScript and the 27-case baseline/candidate suite pass. Full local checks and independent review are in progress; exact-head hosted and post-merge qualification remain mandatory. No publication or merge has happened at this preparation checkpoint. Browser/database feature acceptance remains covered by the existing required suite; no new hosted feature or production readiness claim is made.

Next: finish local qualification and independent review, preserve/restore private recovery, then publish a bounded draft with actual-number authority preserving all predecessor checks. Qualify and merge serially on current main under owner authorization, with production still held.

## Local qualification result

Independent review confirms all 42 original top-level declarations, including the entire persistence class and both error functions, are unchanged except leading export modifiers. No declaration was added, dropped or duplicated; the same five runtime exports are preserved. The imported graph is acyclic; row/mapping dependencies introduce no new I/O. The reviewer independently reran all 27 cases against both the unchanged-main implementation and candidate with network denied, plus core TypeScript and whitespace checks. A review observation strengthened the three error cases to assert safe messages and HTTP status as well as codes.

Fresh pinned Node 22.23.1 / npm 10.9.8 installs pass. Full root, 404 Stocks tests, core TypeScript, deterministic inventory, secret and whitespace checks pass. Full typecheck:all is incomplete because the frozen Supabase 2.108.2 SDK connection is refused during Edge checking. Backend smoke passes 23 Deno groups / 1,027 cases plus 18 Node cases, then encounters the same dependency refusal in Game Sessions; it is not an aggregate pass. Hosted exact-head qualification must close these environment limits without weakening checks or changing dependencies. No live data, production deployment or browser behavior change is claimed.
