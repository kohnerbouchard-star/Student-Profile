# REF-015 / U7 — synchronous Settings stylesheet ownership

Parent accepted five paths / 180 semantic changed lines on 2026-10-04, including the narrow existing Settings-owner handoff. Base: `d2aa78c8ddd25d086db08dadc66e7af47ec598bd` (fetched main); branch: `refactor/ref-015a-settings-style-owner`. This is migration qualification, not deletion or REF-015 completion. Parent alone reviews/merges.

## Exact scope and implementation

1. `admin/settings-simplified.js`: retain `ensureStylesheet()` defaults; add ID/href parameters and existing-owner `ensureFinalPolishStylesheet()`.
2. `admin/settings-save-error-bridge.js`: synchronously delegate when that method exists; otherwise retain synchronous guarded insertion for older/standalone clients.
3. `scripts/admin-settings-save-lifecycle.test.mjs`: extend existing DOM fixture and synchronous ownership/idempotence/default-style tests; preserve negative cases.
4. `scripts/admin-settings-disclosure-smoke.mjs`: add real classic-script fallback, stylesheet order/request and CDP window/document listener measurements.
5. This evidence document.

The initial new-loader/eight-path proposal was rejected in favor of reusing the existing Settings owner. No new module, bootstrap/ratchet/CSS change or asynchronous forwarding. Normal execution uses the owner once and never also executes fallback; standalone execution appends before the classic script returns. Same-ID elements still short-circuit. The fallback stays explicitly owned until independently retired. Files removed: 0; dead-code reduction: none claimed.

## Reachability and ownership

`admin/index.html:56` loads the bootstrap; `admin/admin-bootstrap.js:55` dynamically imports the bridge after the presenter and lifecycle module, with serial imports at lines 235–245. This order is unchanged. Candidate installs no listeners/observers/timers/transport wrapper. Save/error events remain REF-014-owned.

`copyBrowserRoot` / `canonicalizeAdminV2` in `scripts/build-vercel-runtime-config.mjs:221–245` retain the public asset even though built default HTML becomes V2. Neither build nor V2 files changed. Old `/admin/settings-save-error-bridge.js` and CSS URLs, including query variants, remain available. Hosted consumer absence is UNKNOWN.

PR #765 merged as `b4f803fb3957ee7ad33bab2c0a8eea53952bb231`; its former branch is absent. Connected GitHub search found no active Settings/U7 owner. Parent accepted the narrow handoff; #844 Story, #840 BFF, #668 context and all release/security owners remain protected. New main's #842 loan projection does not overlap these five paths.

## Qualification

Pinned Node 22.23.1 / npm 10.9.8 / Deno 2.9.3 installed outside the repository; root/backend frozen npm installs passed. Playwright 1.62.0's bundled Chromium download received HTTP 403 Domain forbidden. Supplementary local browser runs use installed Chromium 151.0.7922.173 through a temporary launch override; pinned browser CI remains required. No repository dependency/lockfile changed.

| Check | Local result |
| --- | --- |
| Unchanged-base owning suite / Settings browser journey | 54 tests PASS; browser PASS after supplying the workflow's synthetic runtime configuration via a temporary local server |
| Candidate `test:admin-local-mutation-ui` | 60 PASS; existing denial/offline/retry/stale-response/disposal/focus cases retained |
| `test:admin-v2` | PASS |
| Settings disclosure/browser journey | PASS, no recorded errors; synchronous standalone script and duplicate query-variant load verified |
| `test:admin-v2:browser`, source and synthetic built output | Each PASS: 25 checks, 8 existing legacy-contract exceptions, 0 failures, 12 screenshots |
| Assets, interaction, high-priority, legacy-runtime audits; legacy-runtime tests; Player runtime cutover; secret/diff checks | PASS |
| Existing Admin architecture and architecture-v2 ratchets | PASS against unchanged inventory; not a fresh inventory acceptance claim |
| Backend `typecheck:all` / `smoke` | BLOCKED fetching frozen `esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs`; no dependency substitution |
| Full `npm test` / architecture inventory acceptance | Pending exact inventory-path amendment below; do not regenerate a protected tracked file silently |

Identical instrumented browser journeys used base versus candidate runtime sources. Settings-entry window/document listeners are 55/126 in both; after save/remount 55/127 in both (the harness adds one saved-event observer); standalone 0/0 in both. Every checkpoint has exactly one final-polish link and identical full stylesheet order. Normal shell requests one bridge and one CSS; standalone requests two bridge URLs and one CSS. These exact candidate-specific measurements match; no application-wide or hosted traffic assertion.

Evidence is local `/tmp/ref015-evidence/`: owning logs, `baseline-measured/runtime.json` SHA-256 `430cffa18daf651f6941b09a647c706e0875b1e8d4c98182c8f1abf35eb30296`, candidate counterpart `candidate-measured/runtime.json` SHA-256 `17e6220d2407d2fceda1c2f4b2d1b32a4ee79cb00b6a97d1b24a06f91c861351`, source/built screenshots and logs. Fixtures are synthetic; no real student data. The old historical 220-test result is not reused as qualification.

## Required scope amendment and remaining gates

The generator was evaluated with only its output destination redirected to `/tmp/ref015-evidence/generated-inventory.json`, leaving the tracked inventory untouched. Exact required generated change: `admin/settings-simplified.js` line count 640 -> 643 and its resulting sorted-position move; all inventory counts/thresholds unchanged. Requested sixth path: `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`. Parent approval is pending before editing it. Its workflow triggers may additionally require a real PR-number-bound authority manifest; identify/request that exact path before writing. No verifier/test/workflow broadening.

Vercel project `prj_xdyYj6NclqUD8XwTrXX6ueXJseV9`, team `team_PRsNkw4DHrGsUHl6ikKw2XyJ`, is read-accessible. A static-source aggregate query for the bridge URL over 2026-10-03 UTC failed HTTP 400; a source-unrestricted 24h runtime aggregate returned an empty table. Neither proves static/CDN coverage or a quiet day. Later retirement needs an existing complete, redacted static-access export, alias/cache coverage and named monitoring owner. No new drain, retention/configuration change or credentials requested.

Migration qualification needs no quiet window while compatibility remains. Deletion still requires 14 consecutive pre-disable quiet days, separate approval, 7 post-disable days and 30 recoverable-retention days. Daily evidence is <=24h/1,000 records, all statuses count, unknown callers/legacy traffic reset applicable windows; missing/saturated evidence is incomplete. No raw identities/headers/bodies retained. Source/config hashes and rollback ownership remain required.

Rollback is a normal bounded source revert, preserving later security changes. All eight candidates, especially the Attendance stub, remain retained. REF-015 stays BLOCKED with null implementation/merge identities; REF-047/048 dependencies, REF-019/020 pauses, nine U1 guards, release holds and `releaseCertificate:false` stay unchanged. No deployment, runtime disablement, production/security mutation or retention change. Next: approve the exact generated-path amendment, finish exact-head CI, then parent review; deletion stays separate.
