# Preserve Admin account controls during Overview updates

## Registration and ownership

Roadmap: `MAINT-ADMIN-ACCOUNT-CONTROLS-001`. Status: `IN_PROGRESS`. Draft [PR #952](https://github.com/kohnerbouchard-star/Student-Profile/pull/952), branch: `fix/admin-account-controls-20261111`, based on main `143f54b308b25870716bfb956c5b6bc202b40f87`.

Initial public registration `bbc127acfbe07ee4b1a61e886ad5a094320add30`, tree `570f29d6b2c56e0f608a3e50ec71fa2cb17d907f`, contains only this scope record and additive roadmap intake, with sole parent the exact main above. Its checks cannot qualify source absent from that tree. The complete local candidate preserves registration ancestry and incorporates the seven unchanged reviewed source/inventory paths from `385439fd36bf8991f9071c3fb40808da269bc809`. Full-source publication and fresh exact-head hosted qualification remain pending.

This bounded prerequisite repairs an inherited Admin account-menu defect independently of roster PR #938. It does not exempt, alter or weaken the existing roster gate. After this prerequisite is independently reviewed, qualified and merged normally, roster must reconcile actual main and rerun its unchanged exact-head checks.

## Reproduced defect and prepared correction

Overview renders currently replace the account drawer body contents through `accountDrawer.setContent`, `AdminDialog.replaceContent` and `container.replaceChildren`, removing the Settings, Switch game and Sign out siblings. The source defect reproduces in main and the compared roster baselines. Roster PR #938 also fails at the hosted `admin-signout` checkpoint; a fresh unchanged gate must establish whether this correction resolves that hosted failure.

The prepared correction updates a stable account-details child instead of replacing the container. It preserves existing account controls and handlers across repeated Overview refreshes. Focused tests exercise the real application source. An imported helper extends the existing Admin V2 browser ready-state loop across its six viewports, with repeated refresh, cancel and focus-restoration coverage. Historical baseline assertions and the strict BFF read-boundary checks remain intact. Actual sign-out and redirect single-call coverage is hermetic; the unchanged roster lane must still supply hosted native committed-sign-out evidence.

Prepared paths:

- `admin/v2/src/app.js`
- `scripts/admin-account-controls-dom-fixture.mjs`
- `scripts/admin-account-controls.test.mjs`
- `scripts/admin-v2-runtime-ux-stabilization.test.mjs`
- `scripts/admin-account-controls-browser-check.mjs`
- `scripts/admin-v2-browser-smoke.mjs`
- `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`

The inventory changes only the recorded app.js line count from 647 to 650; source and oversized-file totals remain unchanged. No API, authentication policy, backend, schema, migration, RPC, dependency, roster assertion or production change is included.

## Prepared-source evidence and limits

The separate prepared source passes full root tests and 38 focused cases under Node 22.23.1/npm 10.9.8. Independent source review is clear. Root and backend locked installs and the TypeScript portion passed. The full backend typecheck aggregate and backend smoke are blocked by the existing frozen Supabase esm.sh import connection refusal. Native browser and database qualification have not run for this candidate. These observations describe prepared source, not this metadata-only registration or a hosted qualification pass.

## Actual-number integration and qualification plan

The actual [PR952 authority](../../contracts/player-cross-cutting/pr-952.json) binds the complete candidate to PR952 and `main`, preserving main's ordered 143 required and 101 critical identities, all existing guards, and false production-deployment, production-mutation and secret-value flags. The two authority verifier/test files remain unchanged read-only locks.

The recomputed scheduling covers 53 required workflow families plus external CodeQL. The six source paths naturally schedule 18 families; the complete source/inventory and metadata path set schedules 38. Fifteen additional existing PR filters receive only the exact PR952 authority path. Admin Browser additionally receives the three new helper/fixture/test paths in its existing PR filter. Scope is 35 changed paths under 37 exact locks relative to the stated actual main. Preserve every pre-existing filter entry, job, assertion, action, permission, checkout, protected guard and non-PR triggers, apart from the explicitly listed additive dependency paths in existing filtered events below.

Before publication of the complete candidate: independently review source equality, metadata, authority and additive filters; run applicable local checks and report blocked checks honestly. Before merge: require fresh complete exact-head hosted qualification, bind ambiguous check names to their workflows, and prove synthetic merge-tree equality where required. No registration result, earlier head or prepared-source local result substitutes for final-head evidence. No dispatch, blind retry, cancellation, gate waiver or production action is authorized by this record.

Rollback is a normal reviewed source revert; no database or hosted-state rollback is needed. No broader roster, Admin, beta or production completion is claimed.

Registration-plan correction: the initial metadata-only record incorrectly described an existing Admin Browser main-push filter. That workflow has no push trigger. The complete candidate adds the three dependency paths only to its existing PR filter and preserves its event set exactly; no push trigger is introduced.

## Durable direct-consumer coverage

The Admin V2 suite imports the new account-controls tests through the existing runtime-stabilization test, which imports the new DOM fixture. Add those two exact dependencies to existing filtered events in ten direct suite consumers: Admin Shell Smoke, Admin Game Lifecycle Controls, Admin V2 Banking, Crafting, Attendance, Messages, Market, News & Events, Players, and REF014 Settings qualification. Only Shell and lifecycle have existing main-push events; both receive the two dependencies in PR and push filters. The other eight receive PR entries only. This adds 24 exact filter entries across ten workflows, nine newly changed because lifecycle already needed its own authority entry. The final change includes 25 workflow files and 42 additive PR/push path entries in total.

Only Admin Browser invokes the native Admin V2 browser runner and its new browser helper; it has PR and dispatch events, with no push event. Root Repository Quality already runs unfiltered for PR and main pushes. Broad generic root-test consumers and protected production-cutover scheduling remain unchanged. No new event, job, action, permission, guard or checkout is introduced. Initial registration scope counts are historical; the complete candidate requires the recomputed 35 changed paths and 37 locks.
