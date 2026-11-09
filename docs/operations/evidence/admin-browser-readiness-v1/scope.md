# Admin browser interruption and keyboard readiness correction

## Ownership and scope

Draft [PR #928](https://github.com/kohnerbouchard-star/Student-Profile/pull/928), reviewed implementation `bfec5a8684990784fc560547c1d0d84a6c025ba2`. Actual-PR authority binds nine changed paths under eleven locks, retaining byte-identical 118 required/87 critical check arrays and unchanged read-only verifier/test files. Production/mutation/secret flags remain false.

Roadmap item `MAINT-ADMIN-BROWSER-READINESS-001`, isolated branch `fix/admin-browser-interruption-checks`, based on freshly fetched main `08134650d1e0c8cfebb811a5d97331196ebe08e3`. The owner directed getting needed changes passing on current main and implementing identified corrections. This is a separate bounded maintenance PR for shared failures across current feature branches, not a replacement feature branch.

Existing PR #668/global-ledger ownership and every existing intake entry are preserved. Active Phase 15 certification PR #731 owns different files; no active PR owns this browser correction. PRs #922–#927 stay separate. The only workflow change adds exact test-file triggers to the existing Admin Browser E2E workflow; no job, step, gate or permission is removed or relaxed.

No application, CSS, backend, API, database, migration, dependency/lockfile, generated inventory, release contract, production, or hosted-data mutation changes. No manual workflow dispatch or merge is performed by this slice.

## Verified causes and correction

1. **Session redirect interrupts the outgoing module graph.** Unchanged main reproduces aborted V2 module requests during direct unauthenticated navigation. The session gate redirects before the entire module graph finishes loading. Treating every such cancellation as an asset failure makes correct rejection fail nondeterministically.

   The test now records each request's original document URL, main-frame ownership, method, resource type and navigation flag. A candidate must be a GET script with exactly `net::ERR_ABORTED`, from the original `/admin/v2.html` document (or its existing selected-game-query cleanup), followed by the already asserted same-origin sign-in destination/reason. Only `/admin/v2/src/*.js` descendants and two concrete imported dependencies qualify. The two exceptions are source-asserted imports, not an Admin-wide wildcard.

   Every candidate must independently return HTTP 200, nonempty content and an exact JavaScript MIME essence, with redirects forbidden. Only after this additional check is it removed from the unexpected-failure assertion. Original failures and successful verification records remain in browser evidence. CSP/Trusted Types, page errors, console errors, static HTTP failures, API/fetch failures, wrong origin/document, unrelated resources, non-abort failures, duplicate navigations, session authorization, no-data-flash and no-bearer assertions remain enforced. This is not a blanket aborted-request filter.

2. **Visible legacy preview precedes keyboard-controller installation.** A read-only browser probe held only `keyboard-navigation.js`: after preview visibility an action opened with controller readiness false and modality null. Releasing the module changed readiness to true and subsequent keyboard input recorded keyboard modality, with zero writes. The smoke now waits at most ten seconds for the actual keyboard controller before starting its keyboard journey; the modality assertion is unchanged.

   A second macOS harness issue was independently observed: Enter on a closed native select submitted the synthetic form before all fields were edited. Headless macOS now uses native keyboard type-ahead and Tab. The original Linux Home/ArrowDown/Enter path is retained unchanged. Both paths require the exact selected value, and a new assertion rejects any mutation during every field-editing step. No DOM value assignment, synthetic change event or Playwright selectOption bypass is used.

## Local evidence

Node 22.23.1, npm 10.9.8, locked Playwright 1.65.0 / Chromium 158 on macOS. Local Deno 2.8.3 is separate from hosted pinned-runtime evidence.

Passed:

- Four registered diagnostic/readiness tests, including a matrix of wrong document/origin/reason/method/frame/resource/error cases, unavailable/redirected/empty assets, incorrect and suffixed MIME types, concrete dependency imports, retained keyboard and no-early-write assertions.
- Complete V2 browser gate three times: 25 checks passed, all eight existing documented URL-contract exceptions retained, zero failures. The final run includes strict MIME essence validation.
- Full keyboard-only player, contract, store and scanner journeys: all four passed, every modality is keyboard, no pointer events, and one scanner write. The deliberate held-module baseline probe wrote nothing.
- 95 retained Admin unit tests and keyboard-navigation source/focus/in-flight/deep-workflow contracts.
- Full root `npm test`, backend smoke, TypeScript and all 28 Edge typechecks. Root retains its explicit macOS GNU-tar deterministic-release skip; no Linux certification is inferred from it.
- Independent read-only review and rerun of all four focused tests. Review found a MIME suffix edge case and an overbroad assignment-test regex; both were corrected and re-review found no remaining actionable finding.

Raw synthetic logs/artifacts are under `/tmp/admin-readiness-*`. Baseline/candidate history is retained: the first classifier omitted a concrete imported legacy client and then the existing selected-game query cleanup; both stayed fail-closed until the narrow observed cases were modeled. Two native-select alternatives failed exact-value assertions before the final macOS type-ahead path passed. No failing assertion was deleted to make a candidate pass.

## Publication and remaining work

Keep the PR draft until exact-final-head hosted checks are qualified. Local evidence does not certify the Linux keyboard path or live application behavior. Actual-number authority registration is validated; independent registration review and exact-final-head hosted qualification remain. Shared intake additions must be reconciled additively.

Next exact item: publish the independently reviewed correction, register its actual number and qualify its final head. Feature branches can consume the merged correction through their own reviewed current-main updates; do not silently copy changes into those branches or claim their old failing heads passed.
