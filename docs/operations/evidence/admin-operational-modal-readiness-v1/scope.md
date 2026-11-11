# Admin operational Player modal readiness

Roadmap: `CI-ADMIN-OPERATIONAL-MODAL-READINESS-001`.
Status: `IMPLEMENTED_NOT_MERGED`; draft [PR #951](https://github.com/kohnerbouchard-star/Student-Profile/pull/951). The source is published; the actual-number amendment below remains local and unpublished. No runtime qualification is claimed.
Owner: `fix/admin-operational-modal-readiness-v1`.
Implementation and source-check commit: `babf81a6626b795c05196ef04558264a0aed1eda`, tree `dd797b1ba9e5308d9f2e513c1fd4408b04edd6c9`. The subsequent evidence-only record retains all source and workflow bytes.
Base: freshly fetched main `773e72cf857165bc73cfcb16adabce40f1b64eb0`, tree `44e01ffdcd040b655fd6fd46b891feccef0d039d`.

## Ownership and inherited failure

The 2026-11-11 active-branch and open-PR audit found no separate owner for this operational-modal readiness correction. Store focus remains owned by draft [PR #946](https://github.com/kohnerbouchard-star/Student-Profile/pull/946), frozen at `c72c380c09e2b6e7a335b1ac9942c1b88a085aaa`, tree `5c02b658681c04f1e9eb8e4d4129c717c858f1a0`. Roster #933/#938, Player CSS #624, context #668, dependency #620 and release #731/#735 remain separate. No donor or Store-focus source is imported.

Actual main already includes normal Store quote merge #945 and its Banking readiness #950 and runner #949 predecessors. Their older unmerged roadmap wording is historical source status, not fresh runtime certification. This additive intake preserves every prior record, scanner/teacher/refactor/Store/Banking source, ordered gate and production hold.

[Admin Shell run 43014723694, job 130502808436](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/43014723694/job/130502808436) failed at `Audit mounted Admin operational modal focus`. Artifact `13853010311`, SHA-256 `12d43be666c0d3b0a82de8dcbec682766a045c8c20d69c24cb021a85d9a670a9`, records this order:

1. Harness positions the last `create-player` control at 1582.4 ms.
2. Already-queued runtime initial focus moves to `displayName` at 1585.7 ms.
3. Tab at 1609 ms correctly advances to the interior `rosterLabel` control.

The test never exercised the last-control wrap. Focus remained inside the modal, the active controller matched, stack depth was one and browser errors were empty. The unchanged 5-second boundary assertion then failed; 22 later substantive Shell gates were skipped. Relevant Admin runtime/test blobs match actual main. PR946 changes this workflow only by adding its authority scheduling path. This is an inherited harness race, not evidence of a focus escape or a Store runtime defect.

## Bounded correction

- Reuse the existing `createPlayerScrollProbe` observer through a small `waitForPlayerCreateReady` wrapper. The observer requires exactly one connected modal, console, pane and display-name input, bound controls, visible geometry, stable identities across a completed animation frame, and the actual active element matching the input.
- Keep the existing synchronous Playwright polling predicate and 5000 ms deadline. Immediately revalidate the exact observed surface and focus before disposing its handle.
- Invoke that readiness wrapper only for `add-player`, before `boundary(modal, true)`. No runtime autofocus is changed, no sleep or timeout extension is added, and no fixture state, scroll, DOM marker or focus is repaired.
- Preserve every forward/reverse, scanner, Escape, opener-restoration, keyboard-modality, zero-pointer and browser-error assertion. The operational smoke is byte-identical to main outside the import and Player-only readiness lines.
- Move the existing deterministic Player fixture into a shared test-only module. Its entire binding/poller/harness implementation and all 32 previous test bodies are unchanged apart from relative imports. No application, CSS, dependency, schema, migration, route, RPC or economic-write change exists.

The workflow actually executes `admin-mounted-modal-focus-reconciled-smoke.mjs`, which directly imports the operational smoke and the permission diagnostic. There is no loader/materialization transform on this path. The new shared proof fixture verifies that entrypoint and executes the real operational pre-boundary and forward/reverse source. The older `admin-mounted-modal-focus-smoke.mjs` transformation wrapper is not invoked and remains untouched.

## Deterministic proof and retained coverage

Sixteen new cases execute the installed lockfile-pinned Playwright poller, the actual bundle's `bindPlayerModalControls`, the operational smoke's real boundary sequence and the modal controller's actual keyboard trap:

- Baseline removes only the new Player readiness call. The queued initial focus displaces the harness's last control; Tab reaches the interior input and the unchanged forward boundary fails with focus still inside.
- The candidate waits for that callback and passes both actual wrap assertions and their focus traces.
- Disabling either forward or reverse trapping in the synthetic control causes the respective retained boundary check to fail. Readiness cannot hide real keyboard failures.
- Delayed binding, stuck frames, missing modal/input, unbound controls, hidden pane, wrong focus, replaced surfaces and post-readiness replacement/focus loss fail closed. Handles are disposed, browser-context failures propagate, and there are no observer focus/DOM writes.

The existing 32 Player readiness controls still pass, including duplicate/disconnected surfaces, identity replacement, unbinding/rebinding, concurrent waits and scroll diagnostics. The sixteen new cases are registered through the existing modal source contract, which the root suite and Admin Shell job already run. They are not ad hoc-only tests.

## Native qualification prepared, not executed locally

One small script, `scripts/admin-operational-modal-readiness-browser.mjs`, runs after the existing Chromium installation in the same Admin Shell job. No broad duplicate job or workflow is added. It requires committed, tracked proof inputs, checks the actual Git head against the workflow's exact head, and records commit/tree plus input/source hashes in the existing artifact directory.

Its isolated synthetic HTML contains no account, backend or student data. It executes the actual runtime binding and complete modal/keyboard controllers. Only the synthetic binding's scheduled callback is delayed through native animation frames; native scheduling is restored immediately, and the observer/trap remain unchanged. The proof first reproduces the baseline's real 5-second boundary rejection, then holds the actual corrected sequence pending through delayed focus, releases the real callback and verifies native forward/reverse wrap, Escape, opener restoration, dialog semantics, keyboard modality and no pointer input. A never-focused control must hit the original 5000 ms readiness deadline. Unexpected network or page errors fail the proof.

The artifact is an allowlist of source identities, hashes, booleans, durations and error counts. It does not serialize document text, input values, user/session identifiers, responses, credentials or student records. The existing full mounted BFF smoke and all later Shell gates remain mandatory after this synthetic proof.

Admin Shell's PR and main-push filters add the exact operational/probe/test/shared-fixture/proof paths. Admin Scroll's filters add only the newly shared fixture path so future fixture-only edits retain its original checks. All pre-existing workflow paths, commands, jobs, action versions, permissions, exact-head checkout, manual/production guards and other triggers remain unchanged. The one new Shell step is the only operational workflow amendment.

## Actual-number authority and merge plan

No PR number is guessed and no executable PR authority is created before a real draft exists. Initial publication is held for independent review. When the coordinator authorizes that step:

1. Re-fetch actual main, audit active owners, review the exact source tree and verify the shared publication slot. Open one draft containing only this bounded prerequisite.
2. Use the returned actual PR number to register an exact-path authority. Preserve main PR945's ordered **143 required / 101 critical** identities, both read-only verifier/test paths and all false production-deployment, production-mutation and secret-value flags. These arrays and all existing manifests are unchanged in this candidate.
3. Compute the complete changed-path scope and actual workflow scheduling. Add only that actual authority path to existing PR filters that demonstrably need it. Preserve prior filter entries, guards, commands and head bindings. Independently review the authority/metadata amendment before its one qualification publication.
4. Treat initial pre-registration CI as interim evidence. Qualify every required workflow/job against the final exact head, including the native delayed-focus proof, every original operational modal and all 22 previously skipped later Shell gates. No blind retry or waiver of the inherited failure is permitted.
5. After independent hosted/source audit, merge normally, verify merge-tree identity and inspect fresh main checks. Only then may #946 reconcile that actual merged main and obtain renewed exact-head qualification. Earlier Store desktop/mobile success does not qualify that future union.

No production deployment, workflow dispatch, live mutation, gate waiver or broad completion claim is authorized by this source-only prerequisite.

## Local verification and limits

Checks repeated on committed source `babf81a6626b795c05196ef04558264a0aed1eda` pass: full root `npm test`, full Player `verify`, backend TypeScript, 48 combined readiness cases, 26 authority/trusted-entrypoint/supply-chain cases, retained modal/Contract/scanner source controls, syntax, secret scan and whitespace. The root suite retains its unchanged PostgreSQL fixture skip. Regenerated architecture inventory is byte-identical to actual main: 1352 sources, 93 oversized sources and 52 persistence exceptions; every other count and threshold is unchanged.

Full Edge typechecking stops on the unchanged frozen Supabase `2.108.2` import at `esm.sh` with connection refused. Full backend smoke completes 23 Deno groups / 968 passing cases and 18 Node configuration cases, then stops at that same frozen import before the game-session group. No executed case fails, but the aggregate is not passed. Docker/psql are absent. Native Chromium was previously denied its required socket even on escalation; no launch or escalation is retried here. The synthetic and full mounted browser gates remain unexecuted locally and mandatory on the exact hosted head.

Preservation review confirms exactly twelve main-relative paths, no runtime changes, the complete prior roadmap and all 143/101 gates unchanged, and exact workflow preservation after removing only the documented path entries and one proof step. Both edited YAML files parse. No independent review or native qualification is claimed yet.

The source-publication plan above is now fulfilled as recorded below. Keep #946 frozen until this prerequisite's exact-head and merged-main audits clear.


## Actual PR951 source and local qualification amendment

Draft PR951 publishes source `e069999416c7d92c2d6413cb7d5e08735fa03416`, with sole parent main `773e72cf857165bc73cfcb16adabce40f1b64eb0` and exact reviewed tree `c1ea984a88f444ad8e9b81301458196f0f3361b4`. Public API and fetched Git objects confirm all twelve changed paths, modes, blobs and non-scope entries match the local source candidate. Active-owner and fresh-main checks were repeated; the shared Release Promote slot was empty across queued, in-progress, pending, waiting and requested runs before publication. Initial automatic checks are interim registration evidence, not final qualification.

The actual-number `pr-951.json` amendment locks **56 changed paths / 58 exact paths**, including both unchanged read-only verifier/test paths. It preserves main PR945's ordered **143 required / 101 critical** identities, all 53 required workflow families and all false production/secret flags. Prior manifests and application/runtime bytes remain untouched.

Source scheduling contributes seven exact path entries to each Shell PR/push filter and one shared-fixture entry to each Scroll PR/push filter: **16 entries across two workflows**. Those published workflow bytes and the single Shell Chromium proof step remain unchanged in this amendment. The necessary six PR-head checkout bindings across Lifecycle, Repository Quality, Runtime Wiring, Staging Preflight and Supply Chain retain action versions, commands, permissions and all deliberate merge-candidate certification. Accounting for these required workflow edits, fifteen families naturally schedule. Each of the remaining thirty-eight receives only its exact PR951 authority path in the existing PR filter: **38 additional entries**, or **54 source-plus-authority path entries total**. No prior path is removed and no non-PR scheduling is added by this amendment.

The audit tests necessity against the complete changed-path set, excluding only a filter edit's own self-triggering file. All 38 entries remain necessary; none is replaced by a cross-trigger from another proposed workflow edit. Every required workflow/job/step identity is bound to its existing source, with Attendance's generic `focused` label explicitly bound to Admin V2 Attendance. The source and metadata together edit 45 existing workflow files, without a new job or workflow.

Exact preservation checks remove only those 38 entries and six checkout amendments and recover the published workflows byte-for-byte. All published executable test sources, original source trigger additions, native proof, prior roadmap records, read-only verifiers, architecture inventory and complete predecessor content remain unchanged. No Store focus or separate Admin Browser repair is included. The previous Admin Browser startup failure has an unclassified upstream cause; unchanged source must pass on this legitimately corrected final head and later on reconciled #946, with no speculative repair or historical success credit.

This metadata amendment is **not published**. Require committed-candidate checks and independent review before publication. Then require complete exact-head hosted qualification, including actual delayed-focus Chromium, the full mounted modal sequence, all later Shell steps and Admin Browser, before normal merge and a fresh main audit. Initial missing-authority checks are neither waived nor retried unchanged. No workflow dispatch, production action or #946 functional retry occurs here.

Next exact item: review the committed local PR951 authority/scheduling amendment, publish only its reviewed exact tree with the expected public-source head, then audit final-head qualification. The remaining local SDK, PostgreSQL and native-browser limits above remain explicit.
