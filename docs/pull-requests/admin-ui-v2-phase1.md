# Draft pull request — Admin UI v2 Phase 1

## Title

`refactor(admin): add source-owned v2 shell and Overview boundary`

## Description

### Roadmap

`BETA-ADMIN-UI-V2-001 — Source-owned Admin v2 foundation and Overview reference migration`

### Delivery state

- Status: `IMPLEMENTED_NOT_MERGED`
- Base: `f2694e40bac39b4ceb20951d88dddd38c6a9270a`
- Implementation commit: `3baed2ae36b9cbdf19fadab9b696f5b504d89eeb`
- Draft PR: [#502](https://github.com/kohnerbouchard-star/Student-Profile/pull/502)
- Git-connected preview: https://econovaria-git-refactor-admin-ui-v2-overview-a22902-econovaria.vercel.app

### Summary

Adds an opt-in source-owned Admin entry at `/admin/v2.html` and migrates only Overview into a vanilla-ESM component architecture. It uses the accepted Econovaria v606 terminal visual character as its design baseline; local screenshots are committed and the static preview contract is verified, while reviewer approval, required workflows, and merge remain pending. The registry now owns the exact eight-group, 18-route product taxonomy. Exact legacy destinations render the deliberate **Open existing Admin** handoff; domains without a stable standalone legacy destination render a neutral source-owned planned state with no unrelated link.

Market and Marketplace are separate routes, permissions, and boundaries: financial Market uses the exact legacy `Market` section, while Marketplace is planned and never links to Market. World Management remains a first-class primary destination in the `World` group and is planned because v606 exposes only a global modal launcher, not a standalone route. Overview is the only migrated route.

### In scope

- `AdminShell`, navigation, topbar, page frame, route and permission boundaries;
- shared dialog, confirmation, drawer, icon, media, data-state, toast, form, validation, and table primitives;
- reset/tokens/base/components/utilities/Overview CSS layers, plus the unchanged shared `admin/css/session-gate.css` bootstrap prerequisite;
- one canonical navigation registry with eight exact groups, 18 exact routes, authoritative permissions, explicit `v2`/`legacy`/`planned` dispositions, semantic inline icons, and independent short-height rail scrolling;
- one explicit v2 Admin API adapter and safe error envelope;
- authoritative Overview data through the existing `/api/admin` dashboard, game-list, notification, and Store read contracts;
- initial-loading, ready, refreshing, stale, empty, and failed states;
- unit/DOM, keyboard, dialog-focus, state, permission, and browser coverage;
- architecture, legacy inventory, donor disposition, and phased deletion documentation.

### Out of scope

- Backend, API endpoint, authentication, authorization, BFF, Supabase, rate-limit, migration, database, or production configuration changes;
- Player Terminal or player-facing behavior;
- implementing any route other than Overview, including Players, Attendance, Market, Banking, Loans, Contracts, Business, Crafting, Store, Marketplace, Inventory, World Management, News & Events, Messages, Progression, Settings, or Logs;
- importing generated v606 markup or replacing the accepted visual system;
- new global stabilization CSS, new or additional global fetch wrappers, body-wide `MutationObserver`s, runtime style injection, or platform-prototype patches;
- deleting any legacy Admin file or promoting production.

### Migration boundary

- `/admin/v2.html` is the source-owned v2 shell and Overview.
- `/admin` remains the independent legacy v606 application.
- V2 does not load or change legacy `admin-auth.js`; it uses a source-owned, dependency-injected, read-only BFF transport without patching global `fetch`.
- Exact legacy destinations first render a source-owned route-boundary screen; its explicit action opens the validated legacy destination.
- Planned destinations render a source-owned non-error state and expose no legacy action or unrelated link.
- PR #498's modal focus guard, if merged, remains legacy-only and is not loaded by v2.

### Test checklist

- [x] Exact group/route order, labels, permissions, icons, uniqueness, and dispositions
- [x] Market and Marketplace remain independently reachable with distinct permissions and boundaries
- [x] World Management remains first-class and renders the planned boundary
- [x] Safe error normalization and raw-message redaction tests
- [x] Keyboard navigation and collapsed accessible-name tests
- [x] Shared dialog focus trap, Escape, inert background, cleanup, and restoration tests
- [x] Permission-denial tests with no protected Overview request and fail-closed planned-route activation
- [x] Initial-loading, ready, refreshing, stale, empty, and failed-state tests
- [x] `/admin/v2.html` direct-navigation and reload routing test
- [ ] V2 route-boundary selected-game privacy contract — the same eight UUID-free URL assertions remain enabled and red; the product owner accepts the existing UUID-in-`?game` contract as non-blocking Phase 1 legacy privacy/hygiene debt, not as a passing check
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

The local screenshots are sanitized and use an explicitly controlled same-origin Admin BFF fixture. They include initial-loading, empty, stale, failed, and permission-denied evidence in addition to ready and short-desktop states. The captures were regenerated from the corrected taxonomy worktree and remain tracked on this branch.

### Local test results

- `npm run test:admin-v2`: pass, 6/6 unit contracts.
- `npm run test:admin-v2:browser`: exit 0 with 42 passing Phase 1 checks, 8 expected legacy-contract exceptions, and 0 failures. The same eight UUID-free URL predicates remain enabled and factually false because the authoritative selected-game contract persists in the visible V2 URL and any available handoff URL; they are not waived, removed, or reported as passing. Source and built-dist dispositions match.
- Browser diagnostics: final source records 1,860 and built dist records 1,855 JavaScript/CSS responses with zero MIME errors, missing/failed static requests, CSP/Trusted Types warnings, or unexpected console/page errors; each run records 24 deliberate session/API HTTP failures exactly correlated with its expected status and safe error code.
- `npm run test:auth-boundaries`: pass, 16/16 general contracts and 8/8 Admin BFF request-auth contracts.
- `npm run audit:admin-contracts`, `npm run test:admin-mounted-event`, `npm run test:admin-redemptions`, `npm run test:admin-game-lifecycle`, `npm run test:admin-game-session-controls`, `npm run test:admin-economic-writes`, `npm run test:admin-local-mutation-ui`, `npm run test:admin-messaging`, `npm run test:admin-progression`, `npm run test:player-runtime-cutover`, and `npm run security:secrets`: pass.
- `node scripts/admin-scroll-integrity-smoke.mjs`: pass on both exact clean `origin/main` and the V2 worktree with byte-identical output.
- `node scripts/admin-shell-smoke.mjs`: inherited partial failure with the same first differing output on exact clean main and the V2 branch; identity, keyboard, mounted-event, and modal-accessibility children pass, but only 2/4 viewport-scroll assertions pass.
- `node scripts/admin-v606-full-drift-audit.mjs`: inherited failure with the same first differing output on exact clean main and the V2 branch; the accepted hash for `admin/css/page-shell.css` is stale (`c4df8ae6…` expected, current `a9644c2…`).
- The v2 tranche does not edit the failing legacy runtime, stylesheet, or test files and does not weaken their assertions.
- `git diff --check`, v2 syntax checks, and changed-scope audit: pass.
- Browser manifest and captures: `docs/operations/evidence/admin-ui-v2-phase1/`.

### Preview evidence

- The Git-connected Vercel preview is Ready; no manual or production deployment was performed.
- Direct navigation and reload of `/admin/v2.html` each return initial HTML HTTP 200. All 48 intended preview files return HTTP 200 with correct MIME types; the browser direct-load records all 40 V2 JavaScript and CSS resources with no missing-resource, CSP, or Trusted Types failure.
- The session-dependent preview probe encounters inherited staging-preview CORS behavior. The same condition reproduces on the unrelated PR #501 preview's legacy Admin route, so it is not a new Phase 1 regression. This branch changes no authentication, Backend, BFF, or environment behavior and does not claim authenticated preview-session parity from that probe.

### CI status at the implementation commit

- PR #502 records 31 successful, nine skipped, and six failed check runs for implementation commit `3baed2ae36b9cbdf19fadab9b696f5b504d89eeb`.
- All six failed runs are current-main/base-identical at their first failure: Admin Game Lifecycle Controls reports the legacy runtime style tag; Admin Game Session Controls reports the stale v606 page-shell hash; Admin Scroll Integrity and Admin Shell Smoke report the same two inherited scroll assertions; Repository Quality and Seed Executable Beta Pack report the same existing legacy MutationObserver ratchet.
- The owning legacy runtime, styles, selectors, ratchets, and tests are byte-identical between base and the implementation commit. No V2 file contains a `MutationObserver`, no changed file owns a first failure, and no genuine new Phase 1 regression is present. This branch does not alter or weaken those checks.

### Legacy and deletion note

Phase 1 intentionally deletes no legacy Admin file. The generated v606 bundle, legacy entrypoint, ordered compatibility scripts, feature bridges, feature styles, session/auth runtime, and Admin assets remain under `/admin`. The approved continuation order is Store with shared artwork, World native, Players and Attendance, Contracts, Marketplace/Settings/Logs, then legacy deletion after the required ownership and parity gates. The newly visible planned domains require separate implementation authorization; taxonomy presence is not a migration claim. See `docs/architecture/admin-ui-v2-phase1.md` for the exhaustive retained-category inventory, selective `frontend/admin-terminal-source-v1` donor disposition, and route-by-route deletion plan.

### Deferred debt and remaining authorization gates

- Current `main` has the two documented baseline-identical legacy ratchet failures: two viewport-scroll assertions in `admin-shell-smoke.mjs`, and the stale `admin/css/page-shell.css` hash in `admin-v606-full-drift-audit.mjs`. They are separate deferred legacy debt; this branch does not weaken the checks, change the accepted hash, or claim ownership of their correction.
- The legacy selected-game contract requires an internal UUID in `?game=`. The product owner accepts this as a documented, non-blocking Phase 1 legacy privacy/hygiene exception. All eight UUID-free URL assertions remain red and separately reported. A coordinated public-handle/Backend/legacy design is deferred and not authorized here.
- Native `<dialog>` migration is also deferred to separately authorized compatibility, focus, and browser work; the current shared source-owned dialog contract remains the Phase 1 implementation.
- PR #498 is a separate draft legacy modal compatibility fix. Reconcile `admin/index.html` overlap and merge order; do not make v2 depend on its prototype guard.
- Direct load and reload of the exact preview `/admin/v2.html` route are verified; no extensionless alias is claimed.
- The documented local release checks and screenshots were rerun against implementation commit `3baed2ae36b9cbdf19fadab9b696f5b504d89eeb`; reviewer approval, required workflows, and merge remain pending.
- Draft PR #502 and its Git-connected preview exist. Nothing was merged, manually deployed, promoted to production, or changed in authentication.

### Approved continuation order

1. Store and shared artwork.
2. World Management as a native v2 route; until then it remains a first-class planned destination with no unrelated handoff.
3. Players and Attendance.
4. Contracts.
5. Marketplace, Settings, and Logs.
6. Legacy deletion only after source ownership, merge, parity, and cutover gates are satisfied.

### Legacy files intentionally unchanged

`admin/index.html`, `admin/dist/**`, existing legacy `admin/*.js`, legacy `admin/css/**`, and `admin/assets/**` remain in place and unchanged. The migration boundary is wholly owned by the new v2 entry and source tree. No deletion is authorized in this phase.
