# REF-015 — Bounded review finished; removal BLOCKED

Date: 2026-09-30. Source main: `368db59335d9f417c818881d19e3d4d9cd56fb67`.
Owner: PR #765 / `refactor/ref-015-admin-shim-retirement`.
Task status: BLOCKED. Documentation review is ready for exact-head qualification; no source deletion is approved and no task-completion credit is claimed.

## Scope and result

The second pass extends the original three candidates with five adjacent retained Admin bridge/adapter files. It is bounded source review, not another application-wide semantic audit. Eight files / 1,235 physical lines were inspected; all eight remain. Runtime source files removed: 0; runtime lines removed: 0; tests removed: 0. Source request/listener wiring is unchanged. Browser request/listener count deltas were NOT_MEASURED, not zero.

| Retained path under `admin/` | Exact source blob | Positive consumer or unresolved gate | Remaining responsibility |
| --- | --- | --- | --- |
| `attendance-reward-settings-route-bridge-v2.js` | `997c57a13c2fed2aa5b138c57e7714b1e499efa0` | Current bootstrap uses the replacement; old public-URL clients and retirement approval are unknown. | Existing 14-line forwarding stub dynamically loads the canonical adapter and preserves the compatibility getter. |
| `player-access-code-bridge.js` | `b48bcfef6921cab7c52a5ff23861bce7fae4f8fb` | `admin/index.html:42`; credential-event consumers in Player creation modules. | Creation response handling, conditional follow-up reset and one-time credential event. REF-013 replaced existing-player reset only. |
| `settings-save-error-bridge.js` | `453096926a5d0e897be246e8bd6828541d85af50` | `admin/admin-bootstrap.js:55`. | Required final-polish stylesheet loading; REF-014 did not retire that responsibility. |
| `logout-account-trigger-bridge.js` | `0f9bf43c794a9c39363d9dd79f05bc7ac3ddff63` | `admin/admin-bootstrap.js:9`. | Delegated click/keyboard logout recognition and confirmation opening. |
| `settings-lifecycle-bridge.js` | `379d5589edbc2bdd94a9abbb7b0c2b8e8213b05d` | `admin/admin-bootstrap.js:54`. | Settings readiness reconciliation, mounted event and route/request/game/attendance lifecycle listeners. |
| `game-creation-runtime-bridge.js` | `0ce82e842290de45faad789d98f643601b1c2787` | `admin/admin-bootstrap.js:28`. | Narrow idempotency-key-qualified game-create transport, timeout/abort handling and New game control mounting. |
| `modal-lifecycle-bridge.js` | `cf49f2920ec3bfac31e32b3e96014393f52ba202` | `admin/admin-bootstrap.js:20`. | Retained modal lifecycle/accessibility activation and dismissal handling. |
| `create-action-adapter.js` | `039e29f8646b65c351825a2604e80384ab3c1bbd` | `admin/index.html:41`. | Player/Contract/Store creation payload translation and existing Contract single-flight handling. |

The serial bootstrap uses `import(modulePath)`: its literal module arrays are genuine dynamic source consumers. The build copies the browser tree and then replaces output `admin/index.html` with V2 HTML (`copyBrowserRoot` / `canonicalizeAdminV2`). A different built-default page neither retires the raw shell nor proves absence of historical/direct clients. No candidate is declared safe from a missing direct TypeScript import.

## Reopening conditions

Attendance requires the existing runtime-retirement policy's representative retained-client/old-URL evidence and approval, followed by canonical behavior coverage and browser asset/interaction checks at the deletion head. Keep its minimal stub until then.

The other seven require reviewed preservation or replacement of the listed live responsibility, zero remaining required static/dynamic/build/event callers, and any applicable hosted-client retirement evidence. Those behavior migrations are separate bounded work, not silently added to REF-015. Retain all behavioral and negative-state tests.

A different Admin shim may be proposed later only with the same candidate-specific evidence. The review does not assert that all Admin debt is understood or that no dead code exists elsewhere. Do not reopen the task merely to meet a removal count.

## Reproducible supplementary validation

Provenance is detailed in `preflight.md`. The freshly reconstructed local source tree is `fd6a465b8964b710691dc204b0510e88244b637b`; its runtime/build/test/policy files match observed main. Local Node is 22.16.0, versus pinned 22.23.1. These fresh local checks supplement, and do not replace, exact-head CI.

| Existing suite / expanded command family | Result | Fresh log SHA-256 |
| --- | --- | --- |
| `test:admin-local-mutation-ui` | 54 passed, 0 failed/skipped | `4109bf31cd6cfc07da6db28d7b79f881c852b30347d029e814c3a1afe853b698` |
| `test:admin-v2` | 86 passed, 0 failed/skipped | `8a78eba6869a86b55420045b1105c44caece1368f7c5ea43c0a9b930c0947855` |
| `node --test scripts/architecture/refactor-candidate-audit.test.mjs` | 17 passed, 0 failed/skipped | `db7beecaa813426f17ea6aaae4a30f0edb70f3bfa84231536a0c6ff180ba93c0` |
| `node --test scripts/legacy-runtime/runtime-retirement.test.mjs` | 63 passed, 0 failed/skipped | `53d629a617b81dcb74d3e8bcadf55c795a2143abc9c56ce8d343e055f0dce5f1` |

All four suites exited 0, totaling 220 tests. Fresh asset-reference, runtime-interaction-wiring, legacy-runtime inventory, legacy-browser-transport, architecture, high-priority-boundary, secret and diff checks also exited 0. Architecture regeneration produced no tracked drift. Interaction static coverage inspected 188 Player and 279 Admin button templates and 101 Player endpoint mappings; this is not browser execution.

The existing immutable-snapshot classifier was rerun without changing the register: 4,000 archived tracked files, 761 candidates, 23 reviewed sources, 0 confirmed dead and 558 unknown. That denominator belongs to the verified artifact tree, not a fabricated current-main checkout. The four main-only REF-014 documentation/data files were separately reconciled. This classifier is not a complete dynamic call graph and grants no deletion approval.

Task 15's browser crawl, measured request/listener comparison, full backend/Deno execution and hosted quiet-window observation were NOT_RUN in this pass. No deletion was attempted that would require those missing acceptance gates. Applicable documentation checks and exact-head CI must pass before this documentation PR merges; a green documentation PR is not runtime certification.

## Sequencing and completion meaning

The owner approved continuing to REF-016 after independent ownership checks. REF-016 depends on verified REF-006, not REF-015. Preserve REF-015 as BLOCKED, with null implementation/merge identities, even after this audit documentation is merged. REF-047/048 still retain their REF-015 dependency. No task is marked DEFERRED_BY_OWNER, REMOVED_BY_OWNER or VERIFIED_COMPLETE to bypass this blocker.

No runtime, API, schema, RPC, migration, workflow, generated bundle, secret or production setting changes are included. All other 49 backlog entries are unchanged in this PR. Task 16 changes belong on its own branch; Task 17 is not started. The next execution item may be REF-016, while the next removal action remains satisfying REF-015's recorded gates.
