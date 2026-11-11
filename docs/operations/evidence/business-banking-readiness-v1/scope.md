# Business acceptance Banking readiness

Roadmap: `CI-BUSINESS-BANKING-READINESS-001`. Status: `IMPLEMENTED_NOT_MERGED`.
Local owner: `fix/business-banking-readiness-v1`.
Base: freshly fetched and independently API-verified main `01af400b7786e151b768d59e4ab0861bbbdb9534`, tree `4e1d4b08bb57955955e35e4130c523c30885d6e4`.
Draft [PR #950](https://github.com/kohnerbouchard-star/Student-Profile/pull/950) was created only after independent source review cleared the exact candidate. Public source `7b277aeb39d3e770dbffccfb5ff88f29619f9fb9` has sole parent the main commit above and tree `6c5ee81f2bdc7443f685540013e1819cc49e9efd`, identical to reviewed local `03b9f47d2b9a5f603aff426b7dd86879235ebf89` including all modes and non-scope entries. The shared Release Promote slot was verified empty before publication. Initial automatic CI is interim registration evidence, not final qualification. The actual-number amendment below is local only and awaits independent review before publication. This is a test-harness prerequisite to qualifying Store PR #945, not a Store or application correction.

## Ownership and diagnosis

Nine open PRs were audited on 2026-11-11: #945, #946, #938, #933, #620, #668, #624, #735 and #731. Their complete changed-file lists contain no competing Business balance helper. PR #946 also changes `player-terminal/package.json` in a different test command; preserve both additive commands during later integration. Store quote, Player focus, roster, CSS/refactor, dependency and release owners remain separate. Actual main already contains normal Store runner merge #949; earlier unmerged roadmap wording remains historical. No teacher, scanner, refactor, runner, authority or release content is removed.

[Player run 42994254623, job 130434271074](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42994254623/job/130434271074), artifact `13843842658`, failed the retained before-credit comparison with browser balance 0 and database balance 40. All 16 recorded Business HTTP responses were 200; ledger reads also returned 200. No fixture credit, Business mutation or later Store journey was reached. Earlier Commerce transferred 40 to the same synthetic recipient in the Business funding currency and verified durable persistence and replay. The earlier passing runner qualification used different Commerce and Business currencies, so its legitimate zero balance could mask a premature zero read. The earlier pass does not establish that its read was premature. Neither the fixture nor the real mismatch assertion should be changed.

The old core helper waited only for the Banking wrapper, then immediately returned zero for a missing optional card or parsed a visible bootstrap-zero card. The connected BFF loader replaced it with another version retaining those false-zero paths. Empty read models contain checking zero before resource readiness. Both helpers lacked route/resource/error/stale and authoritative-data versus rendered-card checks.

The original artifact does not contain card presence, resource readiness or the ledger response body. It cannot distinguish missing-card zero from a visible bootstrap zero in this particular incident. Deterministic reproduction of both faulty paths is not a reconstruction of that unrecorded interleaving. Existing Commerce readiness rejects both; the relevant harness/UI/ledger/SQL are unchanged between main and the failed Store head, so the quote parser is not implicated.

## Bounded implementation

- Copy Commerce's synchronous `readyCurrencyBalance` predicate verbatim into the Business core. A source-parity regression binds its semantics to the unchanged Commerce helper without adding imports to nested temporary harness modules.
- Require settled Banking route, no route error, ready resource, non-stale authoritative data and a matching visible checking/cash card. Genuine ready zero is valid. Missing optional currency is zero only when authoritative data and DOM both establish absence.
- Use one existing Playwright `waitForFunction` with a 30-second deadline. No sleep, data reset, repeated navigation, fixture mutation retry or increased timeout is introduced.
- Preserve all before/after database comparisons, threshold checks, single fixture credit, Business persistence/replay checks and every other source byte outside the helper section.
- Remove only the obsolete `adaptBusinessFundedBalanceWait` transformation and its invocation. All other loader and Business materialization transformations remain exact.
- On failure, capture seven explicitly selected boolean flags, with a separate one-second maximum. No raw DOM text, session, ledger, identifier, currency, error payload or credential enters this snapshot. A failed snapshot remains unavailable; it never turns the failed read into zero or success.

Implementation/test paths:

- `scripts/business-banking-player-business-browser-acceptance.core.mjs`
- `scripts/connected-player-bff-acceptance-loader.mjs`
- `scripts/lib/business-banking-readiness-fixture.mjs`
- `scripts/business-banking-readiness.test.mjs`
- `scripts/business-banking-readiness-browser.mjs`
- `player-terminal/package.json` (only the Banking verification test command)

Evidence and additive roadmap are the remaining scoped paths. No application runtime, SQL, migration, route, RPC, dependency or economic contract changes. The generated architecture inventory is byte-identical to main: 1,352 source files and 93 oversized files, with every other count and threshold unchanged. No new 500-line script is added.

## Verification and holds

`baseline-regression.json` executes unchanged-main core and both real materialization stages with deterministic synthetic inputs: four regression expectations fail (missing-card and bootstrap-zero at each stage); two authoritative-40 controls pass. No database or browser fixture was mutated.

The new deterministic suite has 47 cases covering delayed readiness, absent and bootstrap cards, genuine zero/40, rounded displayed amounts, required versus optional absence, fallback checking data, route/resource errors, stale data, hidden or inconsistent cards, malformed data, bounded timeout, handle disposal and privacy-safe failure diagnostics. It executes the actual two-stage source transformation with only filesystem and dynamic-import effects substituted. Both final and core readiness functions are identical; real storage and replay guards remain present. The suite is registered in the retained Player `banking-read` verification, not merely run ad hoc.

Local source implementation is `d5b7452cba45f8f2f326cc804e563a3f292d8e1f`; provenance hardening is `b4ba1c2dc9d7450c02749dbf07219bfdd7d977d9`, tree `aea768341f9881baf4cce28fa686e6d5e7e95703`. Final committed-source checks at the latter head pass: full root `npm test`, full Player `verify` including all 47 new cases, backend TypeScript, 21 retained authority/trusted-entrypoint cases, Business runtime contract, unchanged Commerce diagnostic self-test, syntax, secrets, whitespace and architecture inventory. Root retains its existing PostgreSQL fixture skip; no new skip is added. The final two-stage materialized source is also byte-identical to unchanged main outside the Banking readiness helpers, independently of the source-file preservation audit.

Full Edge typechecking stops at the unchanged frozen Supabase `2.108.2` import on `esm.sh` with connection refused. Aggregate backend smoke completes 23 Deno groups / 960 passed cases and 18 Node configuration cases, then stops at the same import in game-session tests. Neither aggregate is claimed passed. Docker/psql and native Chromium are unavailable in this local environment; prior socket denial is not retried. Local deterministic tests do not qualify the browser, database or load gates.

The separate synthetic Chromium script is prepared but **not locally executed**. It must run on the exact published head after the supported browser installation. It uses actual browser polls to hold both missing and bootstrap-zero reads pending, releases authoritative data separately from the visible card, checks valid zero/40 and optional/required absence, and proves a real 30-second never-ready timeout. No arbitrary sleep or application/backend fixture is used. It requires actual Git HEAD to match `RELEASE_COMMIT` when set and rejects uncommitted changes in all of its materialization inputs and proof source. Its allowlisted artifact records that actual commit, SHA-256 of the fully materialized helpers, case results and measured deadline.

## Actual PR950 authority and hosted qualification amendment

This local amendment binds `pr-950.json` to actual PR #950 and main. Exactly 43 changed paths have 45 exact locks, including the two unchanged read-only verifier/test paths. Every ordered main PR949 identity remains intact: 143 required checks and 101 critical job checks across 53 required workflow families. All production-deployment, production-mutation and secret-value flags remain false.

The nine original source/evidence paths and necessary Player workflow edit naturally schedule 21 required families. Each of the other 32 existing workflows receives only the exact `docs/operations/contracts/player-cross-cutting/pr-950.json` path in its existing `pull_request.paths`. No proposed workflow edit cross-triggers another missing family, so all 32 entries are necessary. Every prior path, trigger, job, action, permission, checkout, concurrency rule and production guard remains unchanged. The inherited external CodeQL identity still requires exact-head evidence.

The only operational workflow amendment adds `node scripts/business-banking-readiness-browser.mjs` immediately after supported Chromium installation in the existing Player job. The current exact-head checkout and `RELEASE_COMMIT` environment remain unchanged. The proof requires committed source equality, writes its bounded allowlisted artifact to the existing uploaded evidence directory, and completes before the existing connected journeys. No existing command, assertion, journey, mutation, retry, timeout, resource/load budget, runtime isolation or production guard changes.

Committed amendment `7a5911b299ba8c108818dbeee14d8578b1b21aa0`, tree `1358e100e2ac6ac1683dfbd224a75491759c6774`, passes full root, full Player verification, backend TypeScript, all 68 focused readiness/authority/entrypoint tests, the 43/45 authority CLI check, exact workflow preservation/minimal-filter audit, secrets and whitespace. The inventory remains byte-identical. The inherited root PostgreSQL skip, frozen SDK limitation and unexecuted hosted Chromium/load gates remain explicit. No amendment is published by this record.

The actual-number authority did not exist before draft creation. Initial source-head CI therefore cannot certify this complete amendment, and missing-number scope failures are not waived or retried unchanged. Publication is held for independent metadata/workflow review and committed-candidate checks. All required and additional naturally triggered workflows must then run on the exact final published head, including the full Player/Business/Store/World journey and unchanged 30/40-player load assertions. Preserve original attempts, skipped steps and inherited lint diagnostics rather than treating them as clean-schema or all-first-attempt evidence.

Require independent hosted/source audit before normal merge. PR #945 remains frozen and gets no functional retry here; after this prerequisite qualifies and merges, it must reconcile actual main and obtain renewed exact-head evidence. No workflow dispatch, production deployment, live data action or gate waiver is authorized.

Next exact item: review the local PR950 qualification amendment, publish only the reviewed exact tree with an expected-head lease, then complete `CI-BUSINESS-BANKING-READINESS-001` hosted qualification before returning to `STORE-FUNDED-QUOTE-EXPIRY-001`.
