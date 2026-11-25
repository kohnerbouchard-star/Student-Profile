# Player Business installed-route qualification candidate

Status: IMPLEMENTED_NOT_MERGED. Scope ID: PLAYER-BUSINESS-INSTALLED-ROUTE-001.
Implementation: `1d7ff7b948`; no PR opened.
Base: fetched main `73ee21a984`; owner: `refactor/player-business-installed-route`.
No existing local or remote Business-route owner or open PR was found. This is a
bounded Business backlog tranche, independent of Banking and Market/News #1054.
No overall 100-task or Business capability completion is claimed.

## Installed topology and deletion boundary

`core/route-renderer.js` dispatches configured Business to `business-workspace.js`,
which re-exports `business-workspace-page.js`; its wrapper renders
`business-workspace-sections.js`. Both formation fallbacks call `business-page.js`
only when `configured !== true`. Source search found no other runtime caller of
`renderBusinessPage`. Tests which directly rendered its old configured branch
were testing an unreachable surface.

All Treasury browser scenarios now call `renderPlayerRoute` and require the
installed workspace marker. Configured unit and smoke coverage uses the same
route. Formation and assigned-country capitalization currency assertions remain.
The shared exact Treasury panel is installed in workspace Finance, preserving
18-place amounts/rates, cached refreshing/stale/degraded evidence, unavailable
values, empty/loading/unsupported states, restricted-account eligibility,
committed conversion and account-open recovery. Absent-snapshot retry errors
have an accessible alert target. Installed Procurement retains its layout and
funding lines, with the committed-refresh disclosure restored. Recovery coverage
records read requests and requires no repeated economic write.

Deleted only the old configured-page body, its private helpers, the now-unused
full Procurement panel, and workspace's superseded Treasury renderer/Number-based
percentage helper. Kept formation, the shared Treasury panel, exact rate formatter,
and the installed Procurement funding-line leaf. No CSS, backend policy,
API/RPC, schema, dependency, workflow or deployment changes.

The static helper validates every route/workspace import and invocation edge,
then scans the installed sections/shared Treasury/funding-line closure. Negative
controls break route, workspace, wrapper, Treasury and funding-line connections.
Historical source guards now inspect current installed labels and controls;
retired product creation and employee-utilization-only markup is not reinstalled.

## Validation and limits

- Node 22.23.1 / npm 10.9.8; locked root, backend and Player installs succeeded.
- Full root `npm test`, full Player `verify`, backend `typecheck`, affected six
  Business contracts, exact Treasury/receipt tests, mutation controls, source-size
  ratchet, unchanged regenerated architecture inventory, secret scan and diff
  whitespace checks passed.
- Full backend `typecheck:all` is blocked at the unchanged Supabase SDK import
  from `esm.sh` (connection refused), after TypeScript passed.
- Pinned Chromium download returned HTTP 403; the system launcher failed because
  `/usr/lib/chromium/chromium` is missing. Supplemental native Playwright uses
  temporary `@sparticuz/chromium@158.0.0`, original desktop/Pixel 7 projects,
  unique port 4193 (targeted recovery rerun: 4194), and task-local extraction and
  outputs. Video alone is disabled because ffmpeg is unavailable; screenshots
  and failure traces remain enabled. No application dependency changed.
- The first supplemental run passed ten cases and exposed a redundant test click
  which closed the preserved, already-open Treasury form. Removing that click
  made both targeted recovery cases pass. Visual inspection also exposed missing
  design tokens in the original isolated fixture; the final fixture retains
  `player-terminal-app-root`, matching the real typography/icon token scope.
  Final complete supplemental run: **12 passed** (six desktop, six Pixel 7
  mobile), including exact terms, cached/empty/loading/retry, keyboard and
  accessibility checks, no horizontal overflow, and read-only committed/account
  recovery. The corrected mobile-width Treasury screenshot was inspected; exact
  18-place amounts and correctly sized controls remain within the viewport.
  Retained local config/screenshots are under ignored
  `admin-browser-smoke-artifacts/business-installed-20261125/`; final raw log:
  `/tmp/business-installed-fallback-final-20261125.log`.
- These tests execute the real installed renderer and Treasury controller with
  mocked API/read responses; they do not prove authenticated backend/database
  acceptance. Pinned Chromium and normal exact-head CI remain required.
- Backend smoke passed multiple local groups, then failed at the same unchanged
  `esm.sh` Supabase SDK import (connection refused); aggregate smoke is not passed.
- No disposable DB was needed for these frontend-only edits. No hosted database,
  staging, live account, production deployment, merge or push was performed.

Next: run the exact candidate's Treasury desktop/mobile Playwright suite with
locked Chromium, finish required Edge/backend checks with locked SDK access,
and obtain normal review/CI before considering merge. Pinned-browser failure
is an execution-environment blocker, not a test waiver or completion credit.
