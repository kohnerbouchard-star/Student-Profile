# Player Market directory pagination

Roadmap item: `FEATURE-MARKET-DIRECTORY-PAGING-001`.
Status: `IN_PROGRESS`; base `956ad02db949ae9c4cff7d709a18ec28d20c0788`.

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

- 18 focused Node cases pass against real PlayerApi, terminal store and freshness.
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
- Exact-head hosted checks, independent review and actual-PR authority pending.
- Publication was denied by the automated safety reviewer pending explicit approval
  to export this source to the public `kohnerbouchard-star/Student-Profile`
  repository. No remote branch was created; no alternate publication attempted.
- No staging or production deployment is performed or verified.

Next: independent review, draft PR and exact-head hosted qualification. Follow-on
Market capabilities remain separate: server-backed search, asset deep links and
real timestamp-based series controls.
