# Player Dashboard readiness and missing readings

## Proposed scope intake

`PLAYER-DASHBOARD-ARRIVAL-READINESS-001`: `IMPLEMENTED_NOT_MERGED`.
Owner: `fix/player-dashboard-readiness-20261114`, based on main
`2198e7a907d2d87a9eb79867abf9c2f6615cdd59` (2026-11-14).
The coordinator retains the global roadmap and serial publication/merge lane.
No production deployment or hosted mutation is part of this work.

This reconstructs the lost Dashboard preparation against current main, rather
than importing a donor branch. The live open-PR roster was checked. PR #966
owns session recovery; local navigation source `39bd8ed0` owns News/Loans/Messages.
Dashboard adds only `worldRuntime` to its existing optional resource list.
PR #624's exact pathset retains CSS, main, disclosure and invalidation ownership;
none of those runtime files change here. PR #668 retains the global ledger.
The generated inventory changes only the source-file count, 1395 to 1396.
No architecture ceiling or debt limit changes.

## Existing authority and implementation

- `player-terminal/src/api/resource-plan.js`: optional World read, using existing
  capability admission, request timeout, cache, invalidation and error handling.
  No new endpoint, route, write, retry loop or forced navigation.
- `pages/dashboard-readiness.js` and `pages/dashboard-page.js`: consume existing
  `resourceStatus`, World `arrival.required`, questionnaire and assignment.
  Required but unfinished Arrival is first in the existing Next Actions list.
  The existing Contracts, News and Messages links remain available. Unsupported,
  loading, unknown and failed reads do not certify readiness; country-only
  runtime views cannot certify Arrival. World continues to own all forms and
  mutations. No economic lockout is invented.
- `api/country-news-read-model.js` and `api/read-model-values.js`: absent, blank,
  nonnumeric and boolean growth/inflation/stability readings remain null. Finite
  numeric values, including measured zero and numeric strings, remain readings.
  `components/modal.js` safely renders those same nullable values.
- `api/read-model.js`: production Dashboard snapshots preserve missing net worth,
  holdings and cash as unknown, and do not fabricate a daily-return series.
  Inventory retains the existing catalog-price estimate only if every owned item
  has a finite price and quantity; an empty known inventory remains zero.
  The Dashboard labels this an estimate. Failed/non-ready optional resources are
  not rendered as current zero counts, quiet news or available money.

Read contracts checked: `response-normalizer.js`, `resource-support.js`,
`player-api.js`, `features/world/world-runtime-flow.js`, `pages/world-page.js`,
backend `PlayerGameDashboardSnapshot` and the current Dashboard repository.
World's existing policy explicitly says no class permanently blocks economic
activity. No backend, API, RPC, schema, dependency pin or economic policy changes.
Direct legacy flat-adapter partial-merge semantics and unrelated country policy/
Portfolio normalizers are not redesigned by this bounded correction.

## Behavioral evidence

The 24-case `tests/dashboard-readiness.mjs` runs through production page/read-model
entrypoints and PlayerApi. On untouched main it passes 3 and fails 21; on the
candidate all 24 pass. Coverage includes required/completed/optional Arrival,
missing questionnaire, unsupported/loading/unknown/unavailable state, rejection
of cached status and country-only runtime, nullable and measured-zero country
indicators, safe country modal, absent financial readings, failed-resource masking,
missing inventory prices, and real optional-read success, failure, timeout,
malformed-response and manifest-disabled behavior. All requests are GETs.

Existing country projection expectations change only where the previous
behavior manufactured zero or 50 from missing data; their valid-value coverage
remains. Combined Dashboard/country/feature projection suite: 60/60 pass.
The registered Dashboard browser suite retains protected-map/layout coverage and
adds Arrival navigation plus Back without removing the core game-loop actions.

## Local qualification and remaining gates

Pinned Node 22.23.1 / npm 10.9.8:

- Full `npm --prefix player-terminal run verify`: passed.
- Full root `npm test`: passed, including architecture and secret gates.
- `npm --prefix backend run typecheck`: passed.
- Focused 60-case projection suite: passed.
- `git diff --check`: passed.
- `npm --prefix backend run typecheck:all`: core passes; full Edge blocked by
  connection refusal fetching the unchanged frozen Supabase 2.108.2 SDK from
  esm.sh. This is not a full Edge pass or waiver.
- Locked Player `npm ci` succeeded with a writable local cache. Pinned Playwright
  1.59.1 collects four Dashboard cases across desktop/mobile, but launch stops
  before assertions because its Chromium is missing. Official Chromium v1217
  download returns a truncated ZIP. No substitute version is used; hosted
  Chromium remains mandatory, including responsive geometry and Back behavior.
- Full backend smoke progresses through the earlier suites but stops at
  `test:game-sessions` on the same frozen SDK connection refusal. It is not a
  complete smoke pass.
- Independent parent source review found no actionable issue and separately
  reran the 24 readiness plus 16 country projection cases, 40/40 passing.

No staging/live runtime evidence is claimed. Next: independent source review,
recovery verification, current-main union with the navigation correction,
actual-number authority registration, fresh exact-head hosted gates and normal
coordinator-controlled merge. This evidence does not mark beta readiness complete.

## Combined frontend PR970 qualification

Both independently reviewed source tranches are combined in [PR970](https://github.com/kohnerbouchard-star/Student-Profile/pull/970). Published source `23cd327416949eff01a8f0707a7430dfa0e6225f` has tree `0d23c80a74e7548436626b4031984a38781527d1`, exactly matching local source `29af110b2c5cb041006a147a47671d7bb73e912c` on merged main `1bfaf07dd9cc40a4152db2df0cf3139f5a22bed7`. The complete session #966 and release #967 source, tests, authority, workflow guards and earlier registrations are preserved. No live-state or production action occurred.

Independent integration review verifies all 61 incoming release files, the unchanged 20-file frontend delta, and independently regenerated inventory. Combined release/session/navigation/Dashboard regressions pass 129/129. Fresh full pinned Player/root suites, core TypeScript, architecture and secrets checks pass. Current locked Playwright 1.59.1 is installed; official Chromium download was truncated, so no local browser assertion is claimed. Frozen SDK retrieval still prevents full local Edge/backend completion.

Actual-number authority retains the ordered 149 required/104 critical common Player identities and both read-only verifier locks from #966. Fifty existing qualification workflows receive only one additive PR970 path registration each, including explicit retained Workforce scheduling. All existing jobs, assertions, action pins, permissions, manual release locks and deployment guards remain unchanged. Full exact-head hosted qualification remains mandatory; initial draft-head checks are not final evidence.

Fresh path inventories for ten other active PRs show no frontend source/test ownership overlap. Only the deterministic architecture inventory is shared and will be regenerated after predecessor merges. Marketplace #965 has first merge priority; reconcile actual main and requalify before this PR's normal serial merge. These records remain IMPLEMENTED_NOT_MERGED and do not certify staging, production or beta readiness.
