# Draft pull request — Admin UI v2 Phase 1

## Title

`refactor(admin): add source-owned v2 shell and Overview boundary`

## Description

### Roadmap

`BETA-ADMIN-UI-V2-001 — Source-owned Admin v2 foundation and Overview reference migration`

### Summary

Adds an opt-in source-owned Admin entry at `/admin/v2.html` and migrates only Overview into a vanilla-ESM component architecture. It uses the accepted Econovaria v606 terminal visual character as its design baseline; local screenshots are reviewed, while final reviewer and preview parity evidence remain pending. `/admin` remains the legacy application for every route not yet migrated. Selecting an unmigrated route renders an explicit v2 handoff screen; the user then chooses **Open existing admin** to leave v2 for the canonical legacy URL.

World Management now appears as a first-class primary destination in the `World` navigation group, while its page remains clearly labeled and legacy-owned for this phase. Overview is the only migrated route.

### In scope

- `AdminShell`, navigation, topbar, page frame, route and permission boundaries;
- shared dialog, confirmation, drawer, icon, media, data-state, toast, form, validation, and table primitives;
- reset/tokens/base/components/utilities/Overview CSS layers, plus the unchanged shared `admin/css/session-gate.css` bootstrap prerequisite;
- one canonical navigation registry with independent short-height rail scrolling;
- one explicit v2 Admin API adapter and safe error envelope;
- authoritative Overview data through the existing `/api/admin` dashboard, game-list, notification, and Store read contracts;
- initial-loading, ready, refreshing, stale, empty, and failed states;
- unit/DOM, keyboard, dialog-focus, state, permission, and browser coverage;
- architecture, legacy inventory, donor disposition, and phased deletion documentation.

### Out of scope

- Backend, API endpoint, authentication, authorization, BFF, Supabase, rate-limit, migration, database, or production configuration changes;
- Player Terminal or player-facing behavior;
- rewriting Players, Attendance, Contracts, Store, Marketplace, World Management, Settings, Logs, Games, account, security, notifications, or help;
- importing generated v606 markup or replacing the accepted visual system;
- new global stabilization CSS, new or additional global fetch wrappers, body-wide `MutationObserver`s, runtime style injection, or platform-prototype patches;
- deleting any legacy Admin file or promoting production.

### Migration boundary

- `/admin/v2.html` is the source-owned v2 shell and Overview.
- `/admin` remains the independent legacy v606 application.
- V2 does not load or change legacy `admin-auth.js`; it uses a source-owned, dependency-injected, read-only BFF transport without patching global `fetch`.
- Unmigrated navigation destinations first render a source-owned route-boundary screen; its explicit action opens the validated legacy destination.
- PR #498's modal focus guard, if merged, remains legacy-only and is not loaded by v2.

### Test checklist

- [x] Navigation registry and World Management contract tests
- [x] Safe error normalization and raw-message redaction tests
- [x] Keyboard navigation and collapsed accessible-name tests
- [x] Shared dialog focus trap, Escape, inert background, cleanup, and restoration tests
- [x] Permission-denial tests with no protected Overview request
- [x] Initial-loading, ready, refreshing, stale, empty, and failed-state tests
- [x] `/admin/v2.html` direct-navigation and reload routing test
- [ ] V2 route-boundary selected-game privacy contract — all eight UUID-free URL assertions remain enabled and red; the product owner accepts the existing UUID-in-`?game` contract as non-blocking Phase 1 legacy privacy/hygiene debt, not as a passing check
- [ ] Deferred legacy `/admin` ratchets — inherited shell-scroll assertions and the stale v606 hash remain separate debt; neither was changed
- [x] Navigation rail scrolling at short viewport heights
- [x] Long administrator, game, and player name fixtures
- [x] No horizontal document overflow
- [x] No unexpected console or page errors; deliberate HTTP-status responses are exactly correlated
- [x] No raw backend, SQL, Supabase, stack, function, environment, service-role, or private UUID text
- [x] Required Phase 1 release checks listed below
- [x] Existing authentication, BFF request-auth, expiry, and privacy boundary contracts
- [x] Player Terminal verification remains green
- [x] `git diff --check`
- [x] Diff confirms no Backend, migration, Supabase config, Player, production config, or unrelated changes

### Screenshot checklist

- [x] 1440×900
- [x] 1280×720
- [x] 1024×768
- [x] 768×1024
- [x] 390×844
- [x] 320×568

The local screenshots are sanitized and use an explicitly controlled same-origin Admin BFF fixture. They include initial-loading, empty, stale, failed, and permission-denied evidence in addition to ready and short-desktop states. The product owner has authorized committing this bounded tranche; these captures were regenerated from the reconciled worktree and will be included in the implementation commit.

### Local test results

- `npm run test:admin-v2`: pass, 6/6 unit contracts.
- `npm run test:admin-v2:browser`: exit 0 with 32 passing Phase 1 checks, 8 expected legacy-contract exceptions, and 0 failures. The eight UUID-free URL predicates remain enabled and factually false because every legacy destination preserves the authoritative selected-game UUID in the visible V2 and handoff URLs; they are not waived, removed, or reported as passing. Source and built-dist dispositions match.
- Browser diagnostics: final source records 1,387 and built dist records 1,384 JavaScript/CSS responses with zero MIME errors, missing/failed static requests, CSP/Trusted Types warnings, or unexpected console/page errors; each run records 24 deliberate session/API HTTP failures exactly correlated with its expected status and safe error code.
- `npm run test:auth-boundaries`: pass, 16/16 general contracts and 8/8 Admin BFF request-auth contracts.
- `npm run audit:admin-contracts`, `npm run test:admin-mounted-event`, `npm run test:admin-redemptions`, `npm run test:admin-game-lifecycle`, `npm run test:admin-game-session-controls`, `npm run test:admin-economic-writes`, `npm run test:admin-local-mutation-ui`, `npm run test:admin-messaging`, `npm run test:admin-progression`, `npm run test:player-runtime-cutover`, and `npm run security:secrets`: pass.
- `node scripts/admin-scroll-integrity-smoke.mjs`: pass on both exact clean `origin/main` and the V2 worktree with byte-identical output.
- `node scripts/admin-shell-smoke.mjs`: inherited partial failure with the same first differing output on exact clean main and the V2 branch; identity, keyboard, mounted-event, and modal-accessibility children pass, but only 2/4 viewport-scroll assertions pass.
- `node scripts/admin-v606-full-drift-audit.mjs`: inherited failure with the same first differing output on exact clean main and the V2 branch; the accepted hash for `admin/css/page-shell.css` is stale (`c4df8ae6…` expected, current `a9644c2…`).
- The v2 tranche does not edit the failing legacy runtime, stylesheet, or test files and does not weaken their assertions.
- `git diff --check`, v2 syntax checks, and changed-scope audit: pass.
- Browser manifest and captures: `docs/operations/evidence/admin-ui-v2-phase1/`.

### Legacy and deletion note

Phase 1 intentionally deletes no legacy Admin file. The generated v606 bundle, legacy entrypoint, ordered compatibility scripts, feature bridges, feature styles, session/auth runtime, and Admin assets remain under `/admin`. The approved continuation order is Store with shared artwork, World native, Players and Attendance, Contracts, Marketplace/Settings/Logs, then legacy deletion after the required ownership and parity gates. See `docs/architecture/admin-ui-v2-phase1.md` for the exhaustive retained-category inventory, selective `frontend/admin-terminal-source-v1` donor disposition, and route-by-route deletion plan.

### Deferred debt and remaining authorization gates

- Current `main` has the two documented baseline-identical legacy ratchet failures: two viewport-scroll assertions in `admin-shell-smoke.mjs`, and the stale `admin/css/page-shell.css` hash in `admin-v606-full-drift-audit.mjs`. They are separate deferred legacy debt; this branch does not weaken the checks, change the accepted hash, or claim ownership of their correction.
- The legacy selected-game contract requires an internal UUID in `?game=`. The product owner accepts this as a documented, non-blocking Phase 1 legacy privacy/hygiene exception. All eight UUID-free URL assertions remain red and separately reported. A coordinated public-handle/Backend/legacy design is deferred and not authorized here.
- Native `<dialog>` migration is also deferred to separately authorized compatibility, focus, and browser work; the current shared source-owned dialog contract remains the Phase 1 implementation.
- PR #498 is a separate draft legacy modal compatibility fix. Reconcile `admin/index.html` overlap and merge order; do not make v2 depend on its prototype guard.
- Local direct load and reload of `/admin/v2.html` pass without changing API rewrites; no extensionless alias is claimed. Preview/runtime verification remains pending.
- Rerun the documented commands and screenshots against the authorized implementation commit, then add CI/workflow and preview links before marking ready.
- No implementation commit, push, pull request, CI run, preview verification, merge, staging evidence, or production authorization exists at this pre-commit handoff point. The product owner has authorized the first four actions for this bounded tranche; merge and production remain unauthorized.

### Approved continuation order

1. Store and shared artwork.
2. World Management as a native v2 route; until then it remains a first-class, clearly legacy destination.
3. Players and Attendance.
4. Contracts.
5. Marketplace, Settings, and Logs.
6. Legacy deletion only after source ownership, merge, parity, and cutover gates are satisfied.

### Legacy files intentionally unchanged

`admin/index.html`, `admin/dist/**`, existing legacy `admin/*.js`, legacy `admin/css/**`, and `admin/assets/**` remain in place and unchanged. The migration boundary is wholly owned by the new v2 entry and source tree. No deletion is authorized in this phase.
