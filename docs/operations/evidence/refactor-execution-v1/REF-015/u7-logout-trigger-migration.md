# REF015 / U7 — logout trigger responsibility migration

Parent approved at most seven paths, 350 total changed lines and 100 runtime changed lines. Base main `0ebc3d7dc3c03ec31f945dd546e3c726fb534bb1`; branch `refactor/ref-015b-logout-trigger-owner`. This is ownership migration, not retirement or REF015 completion. Parent retains independent review and merge.

Editable scope: `admin/logout-confirmation.js`, `admin/logout-account-trigger-bridge.js`, `scripts/admin-logout-account-trigger-source-smoke.mjs`, `scripts/admin-logout-confirmation-browser-smoke.mjs`, generated `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` only if needed, this evidence file and the new PR-specific Player authority manifest. Inventory generation produced no diff. Unchanged verifier/test entries in the authority are locks, not edit permission.

The existing confirmation owner exposes `installAccountTriggerBridge`. The bridge calls it synchronously at its existing serial bootstrap position. The owner method preserves the complete existing trigger implementation; the bridge retains the original body as fallback for absent/older owners. It still reads the current confirmation global at event time. The earlier confirmation listeners are untouched, preserving capture ordering. No eager installation, extra normal-path registration, new module, timer, observer or transport wrapper.

Raw HTML loads `logout-confirmation.js` at line49; bootstrap dynamically imports the bridge in the game-session-access phase before the hardened logout controller. HTML, bootstrap and the build remain unchanged. Browser-root copying retains the old public URL despite canonical V2 output HTML. The public frozen `EconovariaAdminLogoutAccountTriggerBridge.isLogoutControl` contract stays available. Unknown external/direct clients remain unknown. No current REF003 hash-bound review names these two files, so no register refresh is needed.

Open PR ownership was rechecked before implementation: no logout-specific owner appeared. Story#849, Loans#846, context#668, auth/release#730/#731/#735/#736 and CSS#624 remain protected. No auth handler/controller, session transport, workflow, HTML, CSS, package or lockfile changes.

## Qualification

- Added executable classic-script behavior checks in the existing source-smoke entry point before source edits; unchanged-source baseline and candidate pass. Cases cover present/older/missing owner, dynamic late owner arrival/removal, exact registration position/count, one delegation without fallback registration, all control signals, nested targets, confirmation exclusion, native-button keyboard handling and Enter/Space/other keys. Existing negative assertions remain.
- Existing real-account browser journey passed before/after with identical instrumentation: listener type/capture multisets match (window21/document66), opening/cancellation send zero logout POSTs, confirmation sends exactly one, cleanup/redirect and bounded presentation pass, errors empty. No acceptance threshold was relaxed.
- Evidence: `/tmp/ref015b-baseline/report.json`, `/tmp/ref015b-candidate/report.json` and their browser logs. Synthetic fixtures only. Local browser uses installed Chromium151 through a temporary launcher because the pinned Playwright browser download was previously blocked; pinned exact-head CI is required separately.
- Inventory generation passes without changes. Root/backend and exact-head qualification results are recorded in the draft PR after execution; no completed CI claim is made here in advance.

## Holds and observability

No files removed or disabled; no request/listener reduction claimed. All eight candidates remain. REF015 stays BLOCKED with task implementation/merge identities null; REF047/048 dependencies, REF019/020 pauses, nine U1 guards and release holds remain unchanged. Rollback is a bounded source revert preserving later security changes.

Static-access coverage remains unproven: the prior Vercel static aggregate query returned HTTP400, and an empty runtime aggregate did not establish CDN/static coverage. Retirement needs an existing read-only redacted access export covering retained URLs, aliases, query variants, cache hits and all statuses, with a named monitoring owner and complete daily slices (at most24h/1000 records). Missing/saturated coverage is incomplete. No telemetry guesses, new drain, retention/settings change or raw student data.

Deletion still needs consumer attribution, 14 consecutive pre-disable quiet days, separate approval, 7 post-disable observation days and 30 recoverable-retention days. Unknown callers/legacy traffic reset applicable windows. Migration does not grant completion credit or waive those gates.
