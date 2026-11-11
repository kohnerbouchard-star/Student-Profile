# Preserve Admin account controls during Overview updates

## Registration and ownership

Roadmap: `MAINT-ADMIN-ACCOUNT-CONTROLS-001`. Status: `IN_PROGRESS`. Proposed draft branch: `fix/admin-account-controls-20261111`, based on main `143f54b308b25870716bfb956c5b6bc202b40f87`.

This initial registration contains only this scope record and an additive roadmap intake. The application correction and its tests are prepared separately but are not present in this registration tree. There is no assigned pull-request number yet. Registration checks cannot qualify source absent from this tree.

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

After an actual draft PR number is returned, preserve registration ancestry and incorporate the independently reviewed source without changing its seven paths. Bind a new exact-path authority to that actual number and `main`; preserve main's ordered 143 required and 101 critical identities, all existing guards, and false production-deployment, production-mutation and secret-value flags. The two authority verifier/test files remain unchanged read-only locks.

The current plan covers 53 required workflow families plus external CodeQL. The six source paths naturally schedule 18 families; the complete source/inventory and metadata path set schedules 38. Fifteen additional existing PR filters need only the exact new authority path. Admin Browser also needs the three new helper/fixture/test paths in its existing PR and main-push filters. Expected scope is 26 changed paths under 28 exact locks, subject to recomputation against the final actual-main candidate. Preserve every pre-existing filter entry, job, assertion, action, permission, checkout, protected guard and non-PR trigger except those explicitly additive Admin Browser dependency paths.

Before publication of the complete candidate: independently review source equality, metadata, authority and additive filters; run applicable local checks and report blocked checks honestly. Before merge: require fresh complete exact-head hosted qualification, bind ambiguous check names to their workflows, and prove synthetic merge-tree equality where required. No registration result, earlier head or prepared-source local result substitutes for final-head evidence. No dispatch, blind retry, cancellation, gate waiver or production action is authorized by this record.

Rollback is a normal reviewed source revert; no database or hosted-state rollback is needed. No broader roster, Admin, beta or production completion is claimed.
