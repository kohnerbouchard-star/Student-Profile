# Add Player scroll readiness and diagnostic evidence

## Registration scope and qualification hold

Roadmap: `MAINT-ADMIN-PLAYER-SCROLL-READINESS-001`. Status: `IN_PROGRESS`. Separate owner: `fix/player-scroll-readiness-20261111`, based on freshly fetched main `34c6b7694d4a2e429716db7fc728ae41d02ee0d2`, tree `428beabf26b492d44f52acd026ca260bf1ad345d`.

This first draft registration contains only this scope and an additive roadmap entry on exact main. It deliberately excludes the prepared source, workflows and actual-number authority. No inventory change is needed: the two new scripts are outside the inventory's source roots, and deterministic regeneration is byte-identical to main. Registration CI cannot qualify source absent from the registration tree.

The prepared source is local commit `13a9b07531cdbb817fbe158c799852c103b0ec16`, tree `3dd0ee06743a2759cacbbdcfe4500844f42d98d8`. It changes four harness/test paths only. Contract PR #947 is already merged in the stated main; its qualified helper, regression suite, acceptance runners and all application runtime remain exact.

This separate prerequisite precedes News [PR #942](https://github.com/kohnerbouchard-star/Student-Profile/pull/942), subject to independent review and full qualification. News, Attendance, Messages, roster and Store ownership remain separate. All twelve refreshed open PR pathsets are clear of the four source files. No production action is authorized.

## Evidence and established limit

News head `6b85305d8d6917aa5964910206aa284ecc3c2cfb` failed [Admin Scroll Integrity run 42953849694, job 130304174519](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42953849694/job/130304174519) at `Add Player pane scrollTop did not advance.` Artifact `13825784110`, ZIP SHA256 `18cd9fd695120f24dcd23582fff0a40ae91b7bce042111a409ef1f0af0744fe9`, records passing shell/drawer checks, modal failure, no browser errors and the Display Name field focused at the top. Passing main [run 42952431079, job 130299609992](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42952431079/job/130299609992), artifact `13825268674`, ZIP SHA256 `671acbd0997d3fa384bc314c783e324f6631033c573609399a64d8b80cac0416`, shows the modal scrolled and all checks passing. The runner and runtime bundle are unchanged between those sources.

An exact-source binding probe proves a harness readiness gap: Player binding adds `.is-player-modal` and sets `controlsBound=true` before its queued Display Name focus callback runs. The earlier visible-selector wait can therefore finish with initial focus still pending. The runner then injects filler, assigns `scrollTop=220` once and observes for 100 ms. A pending native focus could reset scrolling, but the historical artifact contains no frame/identity/filler/geometry timeline. The exact historical cause is not uniquely proven, and replacement or layout change cannot be excluded. Deterministic lifecycle tests do not simulate or claim native browser scrolling.

## Bounded source correction

- `scripts/admin-player-scroll-probe.mjs`: private per-call observation of exactly one connected, bound Player modal/console/pane/input. Synchronous pinned Playwright polling waits for a candidate-specific animation frame and freshly revalidates identity and actual input focus. A replacement must complete its own frame; missing, duplicate, unbound, hidden or disconnected surfaces cannot pass. The default 5000 ms deadline includes frame completion. Pane acquisition rechecks the qualified surface instead of silently targeting a replacement.
- `scripts/admin-player-scroll-readiness.test.mjs`: execute the installed lockfile-pinned Playwright polling function and exact extracted runtime binding. Reproduce the old visible-selector gap, and cover delayed binding/focus, invalid/replaced candidates, stalled frames/timeouts, post-barrier changes, disposal, isolation and diagnostic evidence. The exact runner callback proves the immediate snapshot retains the single assignment result before a later queued reset.
- `scripts/admin-scroll-integrity-smoke.mjs`: await that barrier before the unchanged filler injection. Keep the single literal `scrollTop=220` write, original 100 ms observation and every original overflow, scroll-advance, containment and browser-error assertion. Capture ready, before, immediate, after and failure diagnostics; the immediate snapshot is returned in the same browser evaluation as the scroll write. Additional assertions reject replacement of the qualified surface or removal/replacement of filler. Dispose private browser handles.
- `scripts/admin-scroll-integrity-contract.test.mjs`: import the focused regression suite through the existing gate entrypoint; all five original scroll contracts remain exact.

Diagnostics contain only geometry, local node/focus identity, connectedness, binding/frame state and filler retention. No input values, tokens or whole DOM are recorded. No runtime autofocus change, forced focus, repeated scroll repair, filler reinsertion, longer blind delay, ignored failure, skipped assertion, relaxed condition, dependency, backend, schema, migration, API or RPC change is introduced.

## Local source verification

Node `22.23.1`, npm `10.9.8`, Playwright `1.65.0`; fresh root/backend locked installs pass. The source candidate passes 37 focused cases (32 new, five retained), complete root tests, unchanged Contract/modal/loading/scanner contracts, retained authority/production/workflow guards, backend TypeScript, secrets, syntax and whitespace. Deterministic inventory regeneration is unchanged. Exact preservation checks retain all 4,494 pre-existing nonscope blobs/modes and every original scroll assertion, filler operation and original observation duration.

The existing root isolated-PostgreSQL reservation proof remains skipped. Pinned Chromium `1254` is absent, and native browser acceptance has not run locally. Full Edge/backend aggregates remain subject to the unchanged frozen Supabase `2.108.2` import refusal; source/dependency/lock bytes are retained. These are not native browser or backend aggregate passes. Fresh complete exact-head hosted qualification remains mandatory.

## Actual-number authority and trigger proposal

After draft registration yields a verified PR number, prepare one complete source/authority/scheduling candidate for independent review. Inherit main PR947's exact ordered 137 required and 98 critical check identities. Preserve all production-deployment, production-mutation and secret-value flags as false; keep verifier/test files read-only.

Recomputed from the actual four source paths, five required workflow families schedule naturally. Including the proposed scope/roadmap and actual-number authority paths schedules 12 of the 50 required families naturally. Thirty-seven remaining workflows need one exact new actual-number authority path in their existing PR filters. Shell requires no edit: its existing filter for `.github/workflows/runtime-interaction-wiring.yml` is satisfied by that necessary workflow change. The Scroll workflow additionally needs the two new helper/test paths in its existing PR and main-push filters so future helper-only changes run the gate. This changes 38 workflow files in total, yielding 45 final changed paths under 47 exact locks. No inventory path is added.

Preserve every existing filter entry, job, assertion, step, action, permission, checkout, concurrency setting and protected guard. No wildcard, dispatch, blind retry, check substitution or gate waiver. CodeQL and all inherited identities require fresh exact-head evidence. Default synthetic-merge checkouts must have the same tree as the reviewed final head. The initial metadata-only checks and old passing runs do not qualify the final candidate.

Next: independent source and metadata/plan review, reviewed draft registration, verified actual-number candidate, all fresh hosted gates, then a normal prerequisite merge. Reconcile News with that actual merged main and repeat its complete qualification before later serial merges. A normal revert rolls back this bounded harness correction; there is no database or hosted-state rollback. No broader Player, News, beta or production completion is claimed.
