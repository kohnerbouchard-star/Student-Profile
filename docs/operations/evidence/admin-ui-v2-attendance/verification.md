# Admin UI V2 Attendance Verification

This record captures the completed focused verification for the source-owned Attendance migration. It distinguishes the audited branch point, current `origin/main`, exact tested head, and automatic preview results.

## Branch and reconciliation

- Original audited branch point: `b7827211f0ff15b8a963219a63738180b33a1b3d`
- Current `origin/main` fetched during continuation: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
- Branch: `refactor/admin-ui-v2-attendance-v1`
- Draft PR: `#522`
- Merge: not performed

The two commits added to `main` after the audited branch point change only `player-terminal/` source. They do not overlap the Admin V2 Attendance route, shared Admin V2 navigation, or Attendance verification files. No merge or rebase was therefore necessary to reconcile Attendance with current `main`; preserving the existing branch avoided unrelated churn.

## Focused cases

`scripts/admin-v2-attendance-api.test.mjs` covers:

- exact authoritative `GET /attendance/today` read path;
- exact supported Attendance mutation paths and idempotency;
- no invented check-out/delete operation;
- scanner success using the server-returned player, attendance timestamp/status, and reward outcome;
- duplicate/repeated scan behavior through authoritative `attendance.wasCreated === false`;
- scanner 5xx failure sanitization with no raw backend detail exposure;
- read failure sanitization;
- 0-player, 1-player, and 48-player rosters;
- long Korean player names;
- permission denial before any protected Attendance read;
- empty and stale/retry data-state behavior;
- private player UUID exclusion from normalized presentation data;
- legacy scanner 250 ms re-arm, 1.2 s success reset, and 2.0 s failure reset constants;
- keyboard form submission and scanner focus restoration;
- desktop/tablet/mobile responsive source constraints, including 1100 px and 760 px breakpoints and long-text wrapping.

The client does not create a browser-side duplicate policy. It presents the server-authoritative `wasCreated` result and preserves the server-returned attendance timestamp.

## Exact focused CI

Dedicated workflow: `Admin V2 Attendance`

- Exact tested head: `a4fdf18716124fb14e33cc67375572b0443c9e9f`
- Workflow run: `31174850043`
- Job: `focused`
- Result: **PASS**

Checks on that exact head:

- Attendance JavaScript/test syntax: **PASS**
- Focused Attendance suite: **8/8 PASS**
- Admin V2 regression suite: **39/39 PASS**
- `git diff --check origin/main...HEAD`: **PASS**
- changed Attendance source/docs high-confidence secret scan: **PASS**

The 39-test Admin V2 regression suite includes shared navigation/data-state/error tests plus existing Overview, Store, and Market coverage. The shared migration assertion recognizes exactly Overview, Attendance, Market, and Store as source-owned V2 routes; Attendance is removed from the legacy-route expectation.

## Security and privacy

- Permission: `attendance.manage`.
- Permission denial occurs before Attendance `load()` and the controller independently fails closed.
- Browser-visible Attendance rows contain route-local row keys rather than ownership UUIDs.
- Private player UUIDs exist only in the controller-private mutation reference map.
- Scanner credentials are submitted through the existing Admin BFF boundary and are not copied into rendered Attendance state.
- Unsafe backend messages/details are normalized to the shared Admin V2 safe error envelope.
- No new Attendance backend endpoint, persistence model, authorization model, or mutation was introduced.

## Automatic preview

The Git-connected Vercel integration created automatic PR #522 previews from this branch.

A verified READY implementation preview exists for commit `d7c523602b8c1e56ce7debf81822c4f6d15a2348`:

- Deployment: `dpl_FmGchyZdGB5mpKVxJgbSxWmUzm8t`
- State: **READY**
- Source: `git`
- PR: `522`
- Branch: `refactor/admin-ui-v2-attendance-v1`
- Branch alias: `econovaria-git-refactor-admin-ui-v2-attendance-v1-econovaria.vercel.app`

The preview is protected by Vercel SSO; an authenticated-tool request to `/admin/v2.html` returned the expected Vercel SSO redirect rather than exposing the protected page body directly.

Subsequent test/evidence-only pushes were rejected by Vercel's account-level `build-rate-limit` (`upgradeToPro=build-rate-limit`), so no newer preview deployment replaced the READY implementation preview. This capacity condition is external to the Attendance test/build result and no manual deployment was performed.

The final completion report records the status against the final evidence-only branch head.
