# REF-012 — Attendance request adapter execution scope

Status: IN_PROGRESS. Owner continuation: "ok finish the work please". Continue existing PR #759 / `refactor/ref-012-attendance-request-adapter`; do not create a replacement branch, start REF-013, or deploy.

## Exact checkpoint and inherited work

Current main/base: `d7112eb6cde0dad8b48fb04a55b32ad56c3f8b6d`, tree `b9d1dbaa676c107e762e7cc3fc20484315d41464`. Re-read PR759 head before this repair: `1b27dad8e0713ae24c776f3759d15cb994ceaae7`. REF-005 and REF-011 are verified in the base backlog. The task maps to ARCH-500/ARCH-700.

The preceding implementation has ten changed paths and 555 additions / 226 deletions. It moved the Attendance transport into an adapter but left undefined test constants, stale variable assertions, an incorrectly escaped fixture selector, and an undeterministic read-cache wait. General green workflows did not execute that focused suite. Its old three-file characterization description and PLANNED task metadata do not describe the current implementation. No existing test result is promoted to proof of the defective candidate. Main is unchanged and the PR remains draft. The original preflight is retained in Git at `1b27dad8e0713ae24c776f3759d15cb994ceaae7`; its initial-tranche restrictions and local-result claims are historical, not current qualification.

## Explicit bounded children

The parent exceeds its original ten-path / 400-semantic-line review threshold once missing browser and runner evidence is included. These children are registered before further edits. They stay on the existing owner PR with separate scopes; the parent cannot close until all qualify.

### REF-012a — Repair the explicit request boundary

Six editable source/test paths: `admin/admin-auth.js` (only the explicit Attendance handoff/public authenticated request export), `admin/admin-bootstrap.js` (one module reference), `admin/attendance-reward-request-adapter.js`, `admin/attendance-reward-save-controller-v3.js` (explicit invocation/context identity), `admin/attendance-reward-settings-route-bridge-v2.js` (one-way retained read facade), and `scripts/admin-local-mutation-ui-contract.test.mjs` (repair/expand the existing owning tests). Preserve the original eight assertion contracts, targeting the new owner where behavior moved.

Preserve string/Request/JSON/form/object-body normalization before authenticated Request construction, supplied-window precedence/casing, headers/options, retry identity and response ownership. Keep one downstream Settings mutation. The adapter must not assign global fetch. Preserve the existing authenticated wrapper signature and all session, CSRF, device, game binding and denial behavior. Guard acknowledgment against a replaced context without introducing another refresh or writer. No unrelated wrapper changes.

### REF-012b — Verify the retained browser lifecycle and close the runner gap

Two editable paths: `scripts/admin-attendance-reward-settings-smoke.mjs` (extend its real-page fixture for combined/direct saves, one mutation/acknowledgment, retry identity, malformed input, denial/dependency failure, navigation/remount and fetch identity); `.github/workflows/admin-shell-smoke.yml` (only add the focused existing unit commands/path filter). Reuse `admin-quality-smoke-fixture.mjs` unchanged, retain every existing browser test and budget, and write evidence to the existing artifact directory. No new browser framework, dependency or release workflow.

### REF-012c — Qualification and documentation closeout

Supporting paths: this record; `docs/operations/evidence/refactor-execution-v1/REF-003/candidates.json` (only reviewed Attendance/bootstrap identities/descriptions, preserving dispositions and retirement gates); `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` (deterministic measured output, no raised ceiling); `docs/operations/contracts/player-cross-cutting/pr-759.json` (exact bounded path list, every required check retained). Final closeout may update `docs/roadmaps/refactor-execution-v1/tasks/REF-012.md`, this record and only REF-012's status/SHA/evidence fields in the existing 50-task backlog. No other task gets completion credit.

The original ~194-line bridge is mainly moved, not a new reward implementation. Review the narrow authenticated handoff/context-safe acknowledgment separately from mechanical movement and executable fixtures. These child scopes do not authorize other source paths.

## Reachability and retained ownership

The raw retained Admin HTML loads the serial bootstrap and canonical adapter before the save controller, renderer, simplified presentation, Settings lifecycle and error bridge. Built default Admin HTML is V2 and has a different graph; copied assets are not hosted-use evidence. Keep the old bridge filename as a one-way read facade because historical/direct consumers have no verified retirement window.

Attendance-only saves retain verification GET plus one PATCH and payload-bound retry keys. Combined core/Attendance saves retain the generated terminal's effective-payload key, PUT difficulty descriptor and existing authenticated PATCH normalization. Its `EconovariaAttendanceRewardSettingsRouteBridge.getCurrentAttendanceWindow` read forwards to the same adapter. Do not edit generated output or split the command.

Saved-event owners remain the renderer, save controller, simplified Settings, Settings lifecycle and error bridge. Keep the renderer's body MutationObserver, card-local listeners, document-lifetime controller listeners and timers. Test route remounts without claiming a new whole-module disposal architecture. No observer/module deletion.

## Validation and safety

Run full `test:admin-local-mutation-ui`, `test:admin-v2`, existing Attendance/Admin browser suites, interaction/assets/architecture/high-priority/legacy/security/root checks and backend typecheck/smoke. Record exact head, actual job/step results, counts/artifact identities and whitespace checks. CI uses Node22.23.1/npm10.9.8 and locked Chromium/dependencies. Local Node22.16.0 is supplementary; this session's clone failed DNS and Deno is absent. Missing tools do not count as passes. VM, fixture browser, disposable connected database and production are separate evidence classes.

Protected: generated Admin output, formulas/schema, authentication outside the narrow handoff, SQL/RPC/migrations, shared ratchets/ceilings, dependencies/lockfiles, credentials/cloud/releases, global beta ledger, other tasks and PR668/736 ownership. No production action. Normal expected-head merge only after all applicable gates; no bypass. Roll back source and wiring together while preserving later accepted incident fixes. Until every child qualifies, REF-012 remains IN_PROGRESS and PR759 draft.

## Bounded qualification diagnostics amendment

Repair commit `75f0bc4659c753d74e6fcd6038334b02fabd31c8` publishes the source and focused/browser registration. Local syntax checks and 19 selected VM/source/auth cases pass with supplementary Node22.16.0. Exact-head qualification remains open; the hash-bound REF-003 register and deterministic inventory still require reconciliation.

Before the next workflow edit, extend REF-012b's existing workflow path permission only to a final diagnostic capture step, executed after the unchanged test steps and before their existing always-upload. Capture checkout commit/tree identity and copies of exactly three existing repository-owned JSON inputs: the REF-003 candidate register, REF backlog, and checked-in architecture inventory. Run the existing unmodified architecture generator and capture its generated inventory separately. This provides exact bytes for scoped evidence reconciliation in an environment without a full local clone. It is not a new test, check waiver, source export program or release action. Do not archive the entire repository or any environment, credential, browser session or live data. Earlier test failures remain failures; Repository Quality must still pass the unchanged committed-inventory and hash-bound-source assertions on the final candidate. No additional tracked path, dependency, permission or budget increase is introduced by this diagnostic step.
