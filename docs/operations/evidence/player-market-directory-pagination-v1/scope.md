# Player Market directory pagination

Roadmap item: `FEATURE-MARKET-DIRECTORY-PAGING-001`.
Status: `IMPLEMENTED_NOT_MERGED`; draft [PR #997](https://github.com/kohnerbouchard-star/Student-Profile/pull/997); base `956ad02db949ae9c4cff7d709a18ec28d20c0788`.

## Current-main audit

The existing Player Market adapter requests `/players/me/stocks/assets` with a
100-row initial limit. Its authenticated server contract already supports offset
pagination (limit at most 100, offset at most 10,000), but the terminal did not
consume `pagination.nextOffset`, so later instruments were unreachable in the
directory. Search and sector filtering operate only on loaded assets, not on a
server-wide query. This tranche labels that limitation rather than pretending to
implement global search. No active Market feature PR owned this capability at
inspection; #624 remains the CSS owner and no CSS is changed.

## Bounded implementation

- `market-directory-model.js`: validate existing pagination and append unique
  assets while retaining current detail, selection, prices, and existing order
  authority; derive sector options from the loaded union.
- `market-directory-flow.js`: existing PlayerApi read, terminal-store publication,
  shared freshness/lifecycle ownership, duplicate click suppression, abort on
  route/session teardown, delayed-result rejection after refresh, safe retry and
  invalid-session handling. Partial pages never settle full-resource invalidation.
- Market page and composition: load-more control, loaded-count live status,
  explicit loaded-only search wording, search retained across page append.
- Permanent Node tests registered under existing `market-flow`; desktop/mobile
  browser cases for appended search results and leave/return stale-result denial.

No new HTTP route, RPC, migration, database write, economic behavior, permission,
CSS, dependency version, deployment setting, or manual hosted-state mutation.
No complete Market, live runtime, full search, deep-link, or timestamp-series
acceptance is claimed. Refresh intentionally starts the existing first-page
snapshot again; offset pagination does not promise a stable snapshot while the
server directory changes concurrently.

## Qualification

- 23 focused Node cases pass against real PlayerApi, terminal store and freshness.
- Full Player `verify` passes.
- Architecture inventory regenerates from 1,623 to 1,625 sources; all debt counts
  unchanged. Full root aggregate passes on Node 22.23.1/npm 10.9.8 after
  installing the pinned dependencies.
- Pinned Playwright Chromium download fails with truncated archive; system
  Chromium fallback cannot launch (`ProcessSingleton socket() EPERM`), including
  the approved escalated attempt. Four browser cases are not executed, not passes.
- Backend core TypeScript passes; all-Edge checking is blocked by the frozen SDK
  download connection failure. Backend smoke likewise stops at the unchanged
  Supabase SDK import after passing the preceding domain suites.
- Actual-number PR997 authority passes its verifier and all 16 authority tests.
  Current path-filter derivation selects 38 workflow families, 78 active job
  tuples and four guarded skips; no workflow changes or skipped-gate waivers.
  Independent review and exact-head hosted checks remain pending.
- Initial publication was denied pending explicit public-destination approval.
  The owner subsequently approved "Upload and publish" / "Publish". Git transport
  lacked credentials; the authorized GitHub connector published draft #997 at
  `22cd6e12ae7b1d0fcd6e7cd9c2489ecde29a9645`, exact local source tree
  `34c25996cdfdc4dca43f199abfc83e7a7a5b51fb` (local `cc25d5d8`).
  That source-only head is interim; actual-number metadata is qualified separately.
- No staging or production deployment is performed or verified.

Next: independent review, draft PR and exact-head hosted qualification. Follow-on
Market capabilities remain separate: server-backed search, asset deep links and
real timestamp-based series controls.

## Independent review correction

The first review found that the real authenticated adapter replaced its shared
Market snapshot with the later page even though the terminal retained the union.
That prevented authoritative order-detail projection for an earlier-page ticker.
`player-terminal/src/api/market-read-model.js` now retains earlier assets for a
positive-offset read; offset-zero refresh still replaces the directory normally.
A real `createStudentProfileApiCall` regression traverses AAA page 0, BBB page 1,
then obtains current price, history and tick for both tickers and checks refresh.
All 43 focused pagination/projection cases pass. This correction receives no
live trading or economic mutation acceptance credit. Fresh exact-head review and
qualification are required; prior source-only runs remain historical.

Second review identified response sanitizer truncation above 1,000 accumulated
assets. The authenticated adapter retains its internal directory but projects
only this requested page or detail into PlayerApi. The shared adapter also
rejects aborted/session-obsolete Market reads before snapshot mutation; newer
directory reads supersede earlier ones. Terminal aggregate replacement aborts
an outstanding page. Real adapter/API cases cover 1,001 assets, latest detail,
abort, session rotation and superseding refresh. No sanitizer limit is relaxed.
