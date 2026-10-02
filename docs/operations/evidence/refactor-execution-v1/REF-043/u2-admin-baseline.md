# U2 — Admin navigation baseline repair

Status: IN_PROGRESS on the approved World browser-contract amendment;
REF-043 remains BLOCKED and REF-044 remains gated pending full qualification.
Repository qualification only. Parent retains merge authority.

## Scope and ownership

Approved plan #816: 187fca2af9bd3b257c393064cb86fcfd7eac8267.
Execution base: merged main 56957a9265fb2890ac45417663582726103cd91e.
Branch: fix/ref-043-u2-admin-navigation-wrap; draft PR #817.
First tested head: 1788bcbcab52b37cd2da50acf98e0409ef79f50e.

Parent explicitly accepted these four paths after preflight:

- admin/v2/styles/components.css: label wrapping and prevent badge compression.
- .github/workflows/admin-browser-e2e.yml: existing #810 browser qualification step.
- docs/operations/evidence/refactor-execution-v1/REF-043/u2-admin-baseline.md.
- docs/operations/evidence/refactor-execution-v1/REF-043/u2-ownership.json.

The parent owns pending #810 Banking work and explicitly handed off only its
qualification wiring. Banking source, assertions, existing preflight/task/backlog,
generated architecture inventory, Player CSS and all migration/release paths
remain unchanged. The companion ownership JSON records fresh heads and exact
changed files for #624/#668/#690/#730/#731/#735/#736/#810; no other collision
exists. U1 retains migration/release ownership. CampusPay was not accessed.
No API, authentication, economic, dependency, credential, cloud or release change.

## Baseline and proposed correction

Inspected [run 36885470152](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36885470152)
and [artifact 11174828911](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36885470152/artifacts/11174828911).
ZIP SHA256: 7c1c5385e8b9b25bf3a64cf4269a922d0952462d3af728b1711c682fe11a8acc.
Historical base eed2b365f2314f7b788bd658b419cf05bc42200a and #810 candidate
17f5499b1b296fab69f7841df86cc1d48ecbf85b both fail the unchanged assertion
`ready 1440x900 route market truncates horizontally`, with zero completed cases.
This proves historical failure parity, not browser acceptance.

The 16.5rem rail places an icon, label and Monitor badge in a flex row.
AdminNavigation renders the registry label; app.js supplies its mode badge.
The label's nowrap/hidden/ellipsis rule conflicts with the full-visible-label
contract. Replace it with normal wrapping and overflow-wrap:anywhere while
retaining min-inline-size:0. This is a hypothesis until exact-head CI measures it.
Rail width, colors, labels, badges, icons, accessible names, collapsed hiding,
scroll ownership, keyboard/focus behavior and every assertion are preserved.
Existing links have minimum height, allowing wrapped rows to grow naturally.
Two CSS selectors change; no caller/event/listener or request fan-out change.

## Qualification

The approved baseline merge changes documentation only; application/test source
is identical to the locally tested 26820b10f8ad8e74ca3606b6ad48f34c1a8bf02d.
Pinned Node 22.23.1, npm 10.9.8, Playwright 1.62.0 and Deno 2.9.3 were used.
Baseline root/backend npm ci, root npm test, Admin 86/86, economic writes 2/2,
Player Banking public 38/38 and backend tsc passed. Full backend typecheck/smoke
were blocked fetching pinned esm.sh Supabase code. Local browser attempts on
main/historical base/candidate stopped at launch: pinned Chromium v1234 full
and headless downloads returned HTTP 403, including the approved escalation.
Zero local browser cases completed. No substitute browser or bypass is used.

CI preserves #810's pinned installation, exact-head checkout, full Admin suite,
connected Admin/ledger journeys, sanitization, artifact upload and enforcement.
The handed-off step first runs the unchanged suite against a detached worktree
at untouched 56957a9265fb2890ac45417663582726103cd91e. It requires a nonzero
baseline exit and the exact known Market assertion, then runs the full candidate
suite with its exit enforced. Separate baseline/candidate JSON and screenshots
enter the existing sanitized artifact. A different baseline failure blocks CI.
Candidate covers all existing desktop/mobile viewports and short-rail cases;
no zero-case run earns acceptance. Other applicable checks remain required.

## Remaining gates and rollback

Await exact-head browser/connected/Admin/Banking CI before any repair success
claim. A newly exposed failure is evidence requiring diagnosis, not permission
to relax assertions or expand scope. Record actual head/run/job/artifact IDs.
Keep the repair PR draft. Afterwards reconcile existing #810 instead of
recreating its Banking extraction; REF-043 still requires its own acceptance,
normal merge and merged-main closeout before REF-044 can advance.
Rollback is a normal bounded source revert, preserving later accepted changes.

## First exact-head CI outcome

[Admin run 36945872525](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36945872525),
job 110647758282, tested 1788bcbcab52b37cd2da50acf98e0409ef79f50e.
[Artifact 11201699512](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36945872525/artifacts/11201699512),
ZIP digest fc6446b2a3413b83ec03351b699bcc86d000ca0627cfef0c4d3092d8589842e4.
Pinned Chromium installed. Untouched main reproduced the exact Market failure.
Candidate passed ready navigation/layout at 1440x900, 1280x720, 1024x768,
768x1024, 390x844 and 320x568, plus the 1024x540 short-rail case: seven complete
cases. Then verifyWorldPlannedBoundary timed out at browser-smoke.mjs:566,
waiting for world-management[data-mode="planned"]. Navigation registry marks
World Management migration:"v2" and app.js mounts its real controller. This
pre-existing test/source mismatch was masked by the earlier navigation failure.
No assertion was altered; the complete suite is FAILED, and connected journeys
were skipped, not passed. World test-contract reconciliation is outside the
four-path lock and requires parent acceptance before any test-source edit.

Inspected 1440x900 and 320x568 screenshots. The desktop Monitor badge compressed
beside its wrapped label. Added flex-shrink:0 to its existing selector to retain
the badge's intrinsic width; this follow-up requires fresh exact-head evidence.
Candidate local root npm test, Admin 86/86, Banking 38/38, economic writes 2/2,
architecture/high-priority/legacy/interaction audits, secrets and syntax pass.

## Approved World test-contract amendment

After independent read-only review, the parent expanded the path lock only to
scripts/admin-v2-browser-fixture-server.mjs and scripts/admin-v2-browser-smoke.mjs.
All protected owner heads were rechecked unchanged; neither added path collides.
Merged #513, e59c39c04523f81c79aab976e2404fbadc4b48b0, accepted World as V2;
promotion 7cca54e4033ef13768611c39a5850fb9998077ce and current unit contracts
confirm that disposition. The old browser verifier and fixture were not updated
by that merge. Current-head artifact 11202062265 from run 36946144938 confirms
seven layout passes followed by the planned-selector timeout and seven fixture
404s; it is failed evidence, not full browser acceptance.

The fixture now serves seven exact World GET/query shapes using responseEnvelope.
A minimal runtime supplies Pack admin-world-browser-fixture and revision 19;
other panels contain contract-valid empty data. Unknown query/method/game/path
requests retain rejection. The replacement verifies seven successful responses,
exact same-origin BFF URLs, GET-only behavior, selected-game/publishable-key/device
headers and no bearer authorization, plus READY without partial-panel errors.
It verifies the fixture Pack/revision, active World navigation, unchanged V2
document/game, World grouping, no planned/legacy boundary or legacy handoff,
and all five local anchor labels, hrefs and unique targets. Existing layout,
keyboard/focus, privacy, runtime-error, planned/legacy-route loops and debt
accounting remain intact. There are no product-route or mutation changes.

The section-anchor hashes may route to Overview under the existing hash router.
This is source-supported only, not runtime verified. This amendment checks their
structure, does not click them, does not fix routing and makes no click-success
claim. That separate behavior must not be disguised as part of this test repair.

Local validation: seven exact read responses and five negative method/query/
path/game probes passed; Admin 86/86 and both script syntax checks passed.
New fixture/browser delta is below 160 meaningful changed lines; total source/
workflow/test delta is below 200. Ownership JSON and this evidence are reported
separately. Full exact-head browser and subsequent connected CI remain required.
