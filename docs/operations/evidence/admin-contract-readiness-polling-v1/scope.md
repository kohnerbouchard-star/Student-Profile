# Contract create readiness polling correction

## Registration scope

Roadmap: `MAINT-ADMIN-CONTRACT-READINESS-POLLING-001`. Status: `IN_PROGRESS`.

Base is freshly fetched main `6bf9774c97e140beac74f54ba4cee6730df31403`, tree `80db7fb2024b3332cb687860ede84c3ff6f653fe`. The separately reviewed local source correction is `4aab22bb3f8fc40c0d8d89615cd15d28c7e67c97`, tree `1cb4c0fab7f9dfea8d93581a35df6c111e2b69fb`, on `fix/contract-readiness-polling-20261111`.

Initial draft registration contains only this evidence and an additive roadmap intake on exact main. The correction, regression changes, actual-number authority and necessary scheduling entries are not part of that registration. No PR number is assigned in this document. Registration checks cannot qualify the pending source correction. Publish the complete independently reviewed candidate once the real PR number can bind its exact scope, then run fresh full exact-head qualification.

The owner authorized continued checks and ordered merges, including this separate bounded prerequisite before News [PR #942](https://github.com/kohnerbouchard-star/Student-Profile/pull/942). Twelve refreshed open PR pathsets contain no competing change to the selected fixture helper or modal source-smoke. News, Attendance, Messages, roster, Store and other open scopes remain separate. Shared roadmap and workflow files require additive preservation during later reconciliation.

## Failure evidence

News [Admin Shell run 42942669627, job 130267959972](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42942669627/job/130267959972) fails the unchanged complete Contract payload assertion with `Title was not preserved.` Artifact `13821063636` records one POST, no browser errors, instructions text appended to the title, and missing instructions. Pre-submit HTML already contains the corrupted title. Earlier exact title/objective checks passed. Five later acceptance steps remain unexecuted.

The relevant runner, fixture, runtime, accessibility code, HTML, workflow and lockfile match qualified Banking main. That earlier pass does not qualify the failed News run. Runtime inserts the form before a binding frame and a further queued title-focus frame. No exact browser frame trace was captured for this failure, so a particular unobserved interleaving is not asserted.

The readiness defect is independently reproducible without Chromium: pinned Playwright `1.65.0` computes `const success = predicate()` and tests truthiness without awaiting. The old helper passes an async predicate, so even a Promise resolving false ends polling and returns a false handle that its caller ignores. Original deterministic stubs await the predicate directly and conceal those semantics. Executing the actual installed polling implementation with the unchanged-main helper confirms a missing console resolves false immediately with no further poll.

## Prepared correction

Only two source paths change:

- `scripts/admin-quality-smoke-fixture.mjs`: replace the async readiness predicate with synchronous polling using private per-call observation state. A single connected bound console and connected title establish a candidate; its animation frame must complete before a subsequent poll can accept the same console/title with actual title focus. Missing, duplicate, detached, unbound or replaced candidates cannot pass. Replacements require their own frame. The existing default 5000 ms polling deadline includes the frame wait, and both observation/result handles are disposed.
- `scripts/admin-modal-accessibility-source-smoke.mjs`: execute the installed lockfile-pinned Playwright polling function. Retain all original readiness, mounted-boundary and scanner cases; add late binding, stalled-frame deadline, replacement recovery, cleanup and concurrent-isolation regressions. An explicit source boundary fails if a future Playwright package changes its polling implementation layout.

Fixture bytes outside the helper remain exact. Both helper callers, every original form fill, full payload assertion, no-early-write check, negative case, forward/reverse wrap, Escape/restoration check and scanner assertion remain unchanged. No forced focus, input repair/refill, fixed sleep, ignored failure, skipped acceptance, relaxed condition or browser-global/DOM observer state is introduced. No application runtime, dependency, API, backend, migration, RPC, economic, security or production change.

## Local source qualification

The exact local source commit above passes fresh root/backend locked installs under Node `22.23.1` and npm `10.9.8`, complete root `npm test`, modal/readiness/mounted contracts, all 34 retained scanner/integrity cases, loading scope, 74 retained redirect/scroll/production/action-pinning cases, backend TypeScript, secret scan, syntax and whitespace. Source-boundary verification proves all other fixture bytes, complete acceptance runners, runtime bundle, Shell workflow and lockfiles are unchanged. A baseline swap fails behaviorally with no subsequent poll, even when the async-constructor tripwire is removed. Independent source review found no actionable issue and independently repeated the polling failure and corrected readiness checks.

The root suite retains its existing isolated-PostgreSQL reservation-proof skip. Local Contract browser acceptance stops before execution because pinned Chromium headless shell `1254` is absent. Full Edge typecheck and backend smoke reach the unchanged frozen Supabase `2.108.2` esm.sh connection refusal; later aggregate stages remain unexecuted. These are not browser or backend aggregate passes. No earlier hosted result qualifies this correction.

## Authority, qualification and rollback

After draft registration supplies the real number, add a separate exact-path authority preserving main PR940's ordered 137 required and 98 critical identities unchanged. Lock every changed path plus the two unchanged read-only verifier/test paths. Preserve all production-deployment, production-mutation and secret-value denials. Add only the exact new authority path to existing pull-request filters that otherwise miss this bounded scope; preserve every prior path, job, assertion, action, permission, non-PR trigger, checkout and production guard. Actual-number scope and scheduling require independent review before full-candidate publication.

Fresh complete hosted gates must qualify the exact final head, including Contract full-payload and subsequent acceptance steps, mounted focus, all inherited browser/backend/database checks and protected production skips. The retained legacy lifecycle checkout requires proof that its synthetic merge tree equals the reviewed head tree. No blind retry, substituted check or gate waiver is permitted.

Rollback is a normal revert of this bounded harness/metadata correction; no database or hosted-state rollback is involved. After all gates pass, merge this prerequisite normally, reconcile News against actual merged main, and repeat its full exact-head qualification before continuing the serial queue. This item does not mark broader Contract, News, beta or production capability complete.
