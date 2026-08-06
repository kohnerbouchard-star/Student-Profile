# Admin UI v2 Phase 1 architecture

**Roadmap item:** `BETA-ADMIN-UI-V2-001`

**Owner branch:** `refactor/admin-ui-v2-overview-foundation-v1`

**Status:** `IMPLEMENTED_NOT_MERGED`

**Production promotion authorized:** No

## Purpose

Phase 1 creates a source-owned Admin UI foundation and migrates only Overview. It uses the accepted Econovaria v606 visual character as its design baseline while ending the pattern of adding generated markup, global reconciliation, feature bridges, and global CSS overrides to every new Admin change. Local screenshot review is complete and the static preview contract is verified; reviewer approval, required workflows, authenticated environment parity, and merge remain pending.

This is an architecture migration, not a product redesign. It changes no Backend route, authentication or authorization rule, Supabase configuration, database migration, Player Terminal behavior, or production environment.

## Route and migration boundary

The boundary is an explicit document route:

| URL | Entrypoint | Owner in Phase 1 |
|---|---|---|
| `/admin/v2.html` | `admin/v2.html` | Source-owned v2 shell and Overview route |
| `/admin` | `admin/index.html` | Preserved legacy v606 Admin runtime and exact legacy destinations |

`admin/v2.html` is deliberately a sibling of `admin/index.html`, not `admin/v2/index.html`. This keeps the existing relative login, runtime-config, asset, and authentication URL semantics unchanged. `/admin/v2.html` is the canonical Phase 1 URL; no extensionless rewrite is claimed. Deployment verification must prove direct navigation and reload of that exact URL. Phase 1 does not add or alter API rewrites.

The v2 document owns its complete DOM. It must not import the generated v606 page markup, mount the legacy application inside the v2 root, iframe `/admin`, or make a body-wide observer reconcile the two applications. `AdminRouteBoundary` resolves Overview to the local source module. A route classified `legacy` first renders a source-owned handoff screen inside v2; only the explicit **Open existing Admin** action then performs a full-document handoff under `/admin`. A route classified `planned` renders a neutral source-owned state with no legacy action, because no stable standalone legacy destination exists for that exact domain. Neither boundary imports or blends legacy DOM.

World Management is present in the canonical v2 navigation registry under the first-class `World` group. The retained v606 runtime exposes World operations only through a global modal launcher, not a standalone route, so the strict destination rule classifies the V2 item as `planned`. This does not migrate the page or demote World Management from primary navigation.

### Canonical navigation registry

The registry is the single source of truth for ID, visible label, group, icon, permission, migration status, and legacy destination. Overview is the only native V2 route.

| Group | Route ID | Label | Permission | Migration | Exact legacy section |
|---|---|---|---|---|---|
| Overview | `overview` | Overview | `game.read` | `v2` | — |
| Operations | `players` | Players | `players.manage` | `legacy` | Players |
| Operations | `attendance` | Attendance | `attendance.manage` | `legacy` | Attendance |
| Finance | `market` | Market | `market.manage` | `legacy` | Market |
| Finance | `banking` | Banking | `economy.adjust` | `planned` | — |
| Finance | `loans` | Loans | `economy.adjust` | `planned` | — |
| Work | `contracts` | Contracts | `contracts.manage` | `legacy` | Assignments |
| Work | `business` | Business | `business.manage` | `planned` | — |
| Work | `crafting` | Crafting | `inventory.redeem` | `planned` | — |
| Trade | `store` | Store | `store.manage` | `legacy` | Store |
| Trade | `marketplace` | Marketplace | `marketplace.moderate` | `planned` | — |
| Trade | `inventory` | Inventory | `inventory.redeem` | `planned` | — |
| World | `world-management` | World Management | `world.manage` | `planned` | — |
| World | `news-events` | News & Events | `world.manage` | `planned` | — |
| Engagement | `messages` | Messages | `messaging.moderate` | `planned` | — |
| Engagement | `progression` | Progression | `progression.review` | `planned` | — |
| System | `settings` | Settings | `settings.manage` | `legacy` | Settings |
| System | `logs` | Logs | `audit.read` | `legacy` | Logs |

Market and Marketplace are intentionally separate. The inherited v606 navigation labels its financial `Market` section “Marketplace,” but its renderer and `/market/**` reads are securities and trading functionality. V2 therefore maps that exact surface only to `market`. The dormant Marketplace lifecycle loader requires a standalone `marketplace` section the legacy shell does not expose, so `marketplace` is planned and never hands off to Market.

### Legacy and planned boundary audit

The browser suite exercises every exact legacy item with a non-private opaque fixture context. Activating the item retains focus, the explicit **Open existing Admin** action accepts focus, hash activation adds one history entry, Back returns to Overview, Forward restores the boundary, the full-document handoff adds exactly one `/admin/` navigation, and Back returns to the same V2 boundary without a loop.

| Destination ID | Visible label | Exact legacy section | Selected-game preservation | Focus/history/no-loop |
|---|---|---|---|---|
| `players` | Players | Players | Pass with opaque context | Pass |
| `attendance` | Attendance | Attendance | Pass with opaque context | Pass |
| `market` | Market | Market | Pass with opaque context | Pass |
| `contracts` | Contracts | Assignments | Pass with opaque context | Pass |
| `store` | Store | Store | Pass with opaque context | Pass |
| `settings` | Settings | Settings | Pass with opaque context | Pass |
| `logs` | Logs | Logs | Pass with opaque context | Pass |

All ten planned items render the source-owned planned state, keep focus/history behavior, stay on `/admin/v2.html`, expose no action or unrelated link, and do not enter a navigation loop. A missing planned-route permission fails closed through `AdminPermissionBoundary` before planned content is rendered.

The product owner accepts the eight previously recorded UUID-free URL assertion failures as a documented, non-blocking Phase 1 privacy/hygiene exception. Those same eight assertions remain enabled and red across their current V2 boundary URLs and any available legacy handoff URL; they are reported separately as deferred debt and are not reclassified as passes. The URL result cannot be repaired in V2 alone while also preserving the legacy-selected game: the legacy selection helper and BFF scope expect that UUID. Discussion and implementation of a public, server-authoritative browser handle plus coordinated legacy/backend adoption are deferred to separately authorized work.

The legacy route remains operational and independently testable throughout the migration. A v2 failure must preserve the v2 shell when safe, and it must never silently fall through to a fabricated Overview or blend legacy and v2 DOM state.

## Why vanilla ESM

The Admin runtime is deployed as static browser source copied by the existing Vercel build. Phase 1 therefore uses browser-native ECMAScript modules rather than introducing a framework, compiler, client router, or second package toolchain.

Vanilla ESM provides the useful boundary for this tranche:

- source files and import ownership are visible in the repository;
- the browser loads the v2 feature graph without the generated bundle and feature-specific legacy script chain, while retaining the existing runtime-config, game-selection, and HttpOnly session prerequisites;
- unit and DOM tests can import registries, normalizers, and components directly;
- scoped modules can own setup and cleanup without new globals, broad `MutationObserver`s, or runtime style injection;
- the existing CSP can continue to allow self-hosted scripts without adding an inline-script exception;
- the migration stays reversible because `/admin` remains a separate document.

This is a Phase 1 delivery choice, not a permanent prohibition on a future reviewed build system. Any later toolchain change needs its own dependency, CSP, deployment, and migration assessment.

## Source layout and module contract

The Phase 1 source graph lives under `admin/v2/` and is entered only from `admin/v2.html`.

| Path | Responsibility |
|---|---|
| `admin/v2.html` | Static v2 document, CSP/runtime metadata, stylesheet order, session gate, and module entry |
| `admin/v2/src/main.js` | One boot boundary; verifies prerequisites and starts the application |
| `admin/v2/src/app.js` | Composes shell, route boundary, session, selected game, and Overview controller |
| `admin/v2/src/components/` | Reusable accessible Admin primitives; no route data fetching |
| `admin/v2/src/core/` | Navigation registry, route definitions, permission policy, state model, error normalization, and shared utilities |
| `admin/v2/src/api/` | V2-scoped BFF transport, route-facing HTTP adapter, and authoritative response projection |
| `admin/v2/src/routes/overview/` | Overview controller, data projection, renderer, and route-only behavior |
| `admin/v2/styles/` | Reset, tokens, base, components, utilities, and genuinely route-specific Overview styles |

Module rules:

- `main.js` performs boot only; it does not become a feature controller.
- `app.js` composes dependencies explicitly and must never replace `window.fetch` or install a global transport wrapper.
- Components receive data and callbacks. They do not infer actions from arbitrary DOM or network traffic.
- Route code may import components, core contracts, and the API adapter. Components must not import route modules.
- Listeners are scoped to owned roots and have deterministic teardown where a component can be removed.
- No v2 module injects global style elements, performs post-render glyph replacement, patches platform prototypes, or observes `document.body`.
- SVG-backed icons and repository-owned assets are resolved through `AdminIcon` and `AdminMedia`; meaningful controls retain accessible names when the rail is collapsed.

## Authentication and API contracts

Phase 1 reuses the existing browser security boundary; it does not redefine it.

- Runtime configuration remains repository-owned and environment-neutral.
- The established Admin web-session manager remains responsible for HttpOnly-session refresh, expiry, logout, and bounded browser session metadata.
- Requests continue through the same-origin `/api/admin` BFF surface with `credentials: "include"`, the existing device identity, selected-game binding, CSRF protection for mutations, `cache: "no-store"`, redirect rejection, and the publishable key where the existing boundary requires it.
- V2 deliberately does not load legacy `admin-auth.js`: that runtime patches `window.fetch` and renders the legacy terminal contract through `innerHTML`. Instead, `admin-bff-transport.js` creates a dependency-injected, read-only fetch function used only by the V2 API client. It maps local `/api/admin` requests to the configured HttpOnly BFF, installs no global, deletes any bearer/cookie/CSRF input headers, and restores the existing publishable-key, device, selected-game, credential, cache, redirect, and referrer controls.
- Overview composes the authoritative existing dashboard, game-list, notification, and Store reads through the established `/api/admin` projection: `GET /games/:gameId/dashboard`, `GET /games`, `GET /notifications?scope=admin-console`, and `GET /games/:gameId/store/items?include=stock,prices,purchaseStats`. It does not synthesize counts, balances, attendance, Contracts, activity, game data, or timestamps.
- Route data projection must not render private ownership UUIDs in text, titles, accessible names, or user-visible data attributes. The current selected-game URL contract is the product-owner-accepted, non-blocking legacy privacy/hygiene exception: legacy Admin requires the internal selected-game UUID in `?game=`, so selection preservation and a UUID-free handoff URL cannot both be truthfully claimed. The eight URL assertions remain enabled and are reported as deferred debt. A public game handle and coordinated Backend/legacy contract change are deferred; this Phase 1 decision neither implements nor authorizes them.
- A `401` follows the existing safe session-expiry path. A missing selected game follows the existing game-selection path. Retryable outages preserve bounded, user-safe UI state.

No Backend, `api/`, `backend/`, database, Supabase, authentication-policy, authorization-policy, rate-limit, or Player Terminal file is part of this tranche.

## Permission contract

`AdminPermissionBoundary` is a presentation boundary, not the authorization authority. The server remains authoritative for every read and write.

- The session bootstrap supplies the allow-listed Admin permissions.
- Overview requires the existing read permission for the selected game.
- A denied route keeps the shell and navigation available, renders a safe denial state, and performs no protected route read.
- Navigation visibility and disabled state may improve orientation, but neither grants access nor substitutes for a server check.
- World Management is registered as a primary destination and remains governed by `world.manage` when it becomes v2-owned.
- Permission errors never expose policy internals, ownership identifiers, function names, environment names, or raw server text.

## Data and error contract

The API adapter projects external responses into route-owned view models. Renderers consume only those view models.

The safe UI error envelope is:

```js
{
  code,
  userMessage,
  fieldErrors,
  retryable,
  requestId,
  retryAfterSeconds,
}
```

Unknown, malformed, network, timeout, and server failures normalize to allow-listed user messages. SQL details, Supabase internals, stack traces, function names, environment names, service-role information, private UUIDs, and raw backend exceptions are never rendered or copied into UI-visible diagnostics.

## Route-state contract

Every route or independently refreshable panel has one explicit state:

| State | Required behavior |
|---|---|
| `initial-loading` | Render a shape-accurate skeleton; no fabricated values |
| `ready` | Render authoritative content |
| `refreshing` | Retain valid content and show non-blocking progress |
| `stale` | Retain last valid content, identify staleness, and offer an explicit retry where useful |
| `empty` | Render a truthful empty state and only valid next actions |
| `failed` | Render a safe panel or route error with an explicit retry when `retryable` |

Initial-loading skeletons never replace valid content during refresh. Panel failures stay inside the affected panel. Route failures preserve the shell and navigation. A successful mutation remains successful if a follow-up refresh fails.

## Scrolling contract

- At desktop widths the shell may fill `100dvh`.
- The main route region owns page-level vertical scrolling.
- The left rail owns independent `overflow-y: auto` when its contents exceed the viewport; the game selector and game-code region remain reachable.
- No navigation item may be clipped at short viewport heights.
- Tables may own horizontal scrolling within their component boundary.
- A dialog body may own vertical scrolling between its fixed header and fixed action footer.
- Mobile and tablet layouts use normal document flow where appropriate.
- V2 avoids nested vertical scroll regions and never uses `overflow: hidden` to conceal layout defects.
- Browser verification must prove zero horizontal document overflow at every required viewport.

The inherited Admin shell viewport assertions and stale v606 page-shell hash are not reasons to weaken existing checks. Exact clean-main and V2-branch runs are baseline-identical at their first differing output, so they are recorded as separate deferred legacy debt rather than a Phase 1 regression. This branch does not edit their runtime, styles, selectors, expected hashes, or tests; required-check policy and their owning correction PR remain separate decisions.

## Dialog and drawer contract

`AdminDialog` is the sole v2 modal primitive. `AdminConfirmDialog` specializes its content and decisions without creating another modal framework.

- one fixed header;
- one scrolling body;
- one fixed footer when actions exist;
- max height derived from `100dvh`;
- full-screen or near-full-screen behavior at small viewports;
- deterministic initial focus;
- Tab and Shift+Tab containment;
- safe Escape behavior;
- opener focus restoration;
- inert background while active;
- nested-dialog stack behavior where required;
- listener and inert-state cleanup on every close path.

`AdminDrawer` follows the same focus and restoration rules, while preserving its drawer geometry. V2 does not patch `Element.prototype`, `HTMLElement.prototype`, or `inert`, and does not depend on PR #498's compatibility guard. If PR #498 merges, its guard remains legacy-only under `/admin` and must not be loaded by `admin/v2.html`. A possible future migration of the shared primitive to the native `<dialog>` element is deferred for separate compatibility, focus, and browser verification; Phase 1 neither requires nor claims that migration.

## Component inventory

The required v2 primitives are source-owned under `admin/v2/src/components/`. The component names and paths below reflect the implementation tree, not proposed aliases.

| Component | Actual path | Responsibility |
|---|---|---|
| `AdminShell` | `admin/v2/src/components/AdminShell.js` | Desktop/mobile shell geometry and landmark composition |
| `AdminNavigation` | `admin/v2/src/components/AdminNavigation.js` | Canonical grouped registry, active state, collapsed accessible names, keyboard movement, and selection of legacy or planned boundaries |
| `AdminTopbar` | `admin/v2/src/components/AdminTopbar.js` | Current route, game, and administrator summary without exposing private identifiers |
| `AdminPageFrame` | `admin/v2/src/components/AdminPageFrame.js` | Route heading, actions, state announcements, and route scroll boundary |
| `AdminRouteBoundary` | `admin/v2/src/components/AdminRouteBoundary.js` | Renders source-owned Overview, an explicit legacy handoff, or a neutral planned state with no unrelated link |
| `AdminPermissionBoundary` | `admin/v2/src/components/AdminPermissionBoundary.js` | Safe permission-denied presentation and guarded route activation |
| `AdminDialog` | `admin/v2/src/components/AdminDialog.js` | Shared modal geometry and accessibility lifecycle |
| `AdminConfirmDialog` | `admin/v2/src/components/AdminConfirmDialog.js` | Confirmation content and action state using `AdminDialog` |
| `AdminDrawer` | `admin/v2/src/components/AdminDrawer.js` | Shared side-panel geometry and accessibility lifecycle |
| `AdminIcon` | `admin/v2/src/components/AdminIcon.js` | SVG-backed decorative and semantic icons |
| `AdminMedia` | `admin/v2/src/components/AdminMedia.js` | Repository-owned media with bounded safe fallback behavior |
| `AdminSkeleton` | `admin/v2/src/components/AdminSkeleton.js` | Shape-accurate initial-loading structures |
| `AdminEmptyState` | `admin/v2/src/components/AdminEmptyState.js` | Truthful empty-state message and valid actions |
| `AdminErrorState` | `admin/v2/src/components/AdminErrorState.js` | Safe normalized error, bounded retry timing, and explicit retry |
| `AdminStaleState` | `admin/v2/src/components/AdminStaleState.js` | Retained-content stale status and refresh action |
| `AdminToast` | `admin/v2/src/components/AdminToast.js` | Bounded transient status; never the sole critical error surface |
| `AdminField` | `admin/v2/src/components/AdminField.js` | Label, description, control, validation, and focus association |
| `AdminValidationSummary` | `admin/v2/src/components/AdminValidationSummary.js` | Linked field errors without raw backend messages |
| `AdminDataTable` | `admin/v2/src/components/AdminDataTable.js` | Accessible table semantics and component-owned horizontal overflow |

The supporting source is also implementation-owned: `components/dom.js` contains safe DOM/focus helpers and `components/index.js` is the component export surface; `core/navigation-registry.js`, `core/route-boundary.js`, `core/data-state.js`, and `core/error-envelope.js` own the cross-cutting contracts; `api/admin-bff-transport.js`, `api/admin-api-client.js`, and `api/overview-read-model.js` own the scoped BFF transport, request orchestration, and presentation projection; and `routes/overview/OverviewController.js`, `OverviewNotifications.js`, `OverviewRoute.js`, and `OverviewSkeleton.js` own migrated-route state, rendering, and teardown.

### Actual Phase 1 file inventory

This inventory reflects the locally verified worktree after the composition, route, component, core, API, style, and test files landed. The evidence matrix distinguishes local results from commit-bound CI and deployed-runtime evidence.

| Category | Actual files |
|---|---|
| Static entry | `admin/v2.html` |
| Composition | `admin/v2/src/main.js`, `admin/v2/src/app.js` |
| API and projection | `admin/v2/src/api/admin-bff-transport.js`, `admin/v2/src/api/admin-api-client.js`, `admin/v2/src/api/overview-read-model.js` |
| Core contracts | `admin/v2/src/core/navigation-registry.js`, `admin/v2/src/core/route-boundary.js`, `admin/v2/src/core/data-state.js`, `admin/v2/src/core/error-envelope.js` |
| Component support/export | `admin/v2/src/components/dom.js`, `admin/v2/src/components/index.js` |
| Required components | The nineteen exact component files mapped in the table above |
| Overview route | `admin/v2/src/routes/overview/OverviewController.js`, `admin/v2/src/routes/overview/OverviewNotifications.js`, `admin/v2/src/routes/overview/OverviewRoute.js`, `admin/v2/src/routes/overview/OverviewSkeleton.js` |
| CSS architecture | Retained bootstrap prerequisite `admin/css/session-gate.css`, plus `admin/v2/styles/reset.css`, `admin/v2/styles/tokens.css`, `admin/v2/styles/base.css`, `admin/v2/styles/components.css`, `admin/v2/styles/utilities.css`, `admin/v2/styles/routes/overview.css` |
| Focused tests and browser fixture | `scripts/admin-v2-unit.test.mjs`, `scripts/admin-v2-browser-smoke.mjs`, `scripts/admin-v2-browser-fixture-server.mjs` |
| Local browser evidence | `docs/operations/evidence/admin-ui-v2-phase1/admin-v2-browser-results.json` and twelve PNG captures in the same directory |
| Test command registration | `package.json` (`test:admin-v2`, `test:admin-v2:browser`) |
| Architecture and PR handoff | `docs/architecture/admin-ui-v2-phase1.md`, `docs/pull-requests/admin-ui-v2-phase1.md` |
| Scope ledger | `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md` (coordinated separately from this documentation task) |

## Legacy files intentionally retained

Phase 1 deletes no legacy Admin file. The following path sets collectively cover every existing legacy file under `admin/` at the Phase 1 baseline.

| Retained category | Exact paths or path set | Reason retained |
|---|---|---|
| Legacy document and records | `admin/index.html`, `admin/README.md`, `admin/docs/**` | `/admin` remains the stable v606 boundary and its historical evidence remains authoritative |
| Generated v606 runtime | `admin/dist/admin-overview-terminal.js`, `admin/dist/admin-overview-boot.js` | Players, Attendance, Contracts, Store, financial Market, Settings, Logs, account, Games, help, and notification surfaces remain legacy-owned; its stale Market-as-Marketplace label is not adopted by V2 |
| Accepted visual baseline | `admin/css/admin-overview-terminal.css`, `admin/css/admin-overview-integrity.css`, `admin/css/admin-overview-integrity-v606.edec218457e4.css`, `admin/css/page-shell.css` | Visual/reference parity and legacy runtime operation |
| Session and authentication runtime | `admin/auth-session-manager.js`, `admin/session-gate.js`, `admin/session-timeout-safe-exit.js`, `admin/admin-auth.js`, `admin/admin-auth.css`, `admin/admin-logout-controller.js`, `admin/logout-account-trigger-bridge.js`, `admin/logout-confirmation.js`, `admin/admin-bootstrap.js` | Existing web-session, expiry, logout, bootstrap, and legacy mount behavior remains unchanged |
| Legacy compatibility and interaction layers | `admin/admin-stabilization.js`, `admin/asset-wiring.js`, `admin/classroom-write-fallback.js`, `admin/create-action-adapter.js`, `admin/data-state-contracts.js`, `admin/export-history-modal-accessibility.js`, `admin/interaction-quality.js`, `admin/interaction-quality-control-reset.js`, `admin/keyboard-navigation.js`, `admin/modal-accessibility.js`, `admin/modal-lifecycle-bridge.js`, `admin/overview-quick-actions.js` | Required by still-unmigrated v606 routes; not imported by v2 |
| Player administration bridges | `admin/player-access-code-bridge.js`, `admin/player-create-lifecycle.js`, `admin/player-create-ux.js`, `admin/player-drawer-accessibility.js`, `admin/player-drawer-wiring.js`, `admin/player-identity-wiring.js`, `admin/ledger-adjustment-wiring.js` | Players and related dialogs remain legacy-owned |
| Attendance controllers | `admin/attendance-reward-save-controller-v3.js`, `admin/attendance-reward-settings-route-bridge-v2.js`, `admin/attendance-reward-settings-v4.js`, `admin/scanner-auto-refresh.js`, `admin/scanner-lifecycle-settle.js`, `admin/scanner-reward-localization.js` | Attendance remains legacy-owned |
| Game lifecycle, creation, share, and code controllers | `admin/game-code-wiring.js`, `admin/game-creation-controls.js`, `admin/game-creation-runtime-bridge.js`, `admin/game-creation-style-loader.js`, `admin/game-lifecycle-controls.js`, `admin/game-session-compact-layering.js`, `admin/game-session-controls.js`, `admin/game-session-mount-lifecycle.js`, `admin/game-session-share-link-contract.js`, `admin/share-game-code-layout-fix.js` | Game selection/control surfaces and legacy route handoff remain operational |
| Settings controllers | `admin/settings-lifecycle-bridge.js`, `admin/settings-save-error-bridge.js`, `admin/settings-simplified.js` | Settings remains legacy-owned |
| Expansion feature surfaces | `admin/crafting-oversight-{client,loader,surface}.js`, `admin/inventory-redemption-queue-{client,loader,surface}.js`, `admin/marketplace-lifecycle-{client,loader,surface}.js`, `admin/messaging-moderation-{client,loader,surface}.js`, `admin/messaging-policy-{client,surface}.js`, `admin/progression-review-{client,loader,surface}.js`, `admin/world-runtime-console.js`, `admin/world-runtime-console-loader.js` | These retained drawers, injected panels, and launchers are not stable standalone legacy destinations. Their exact V2 domain items remain planned; World Management remains first-class. |
| Legacy component/feature styles | `admin/css/admin-scroll-integrity.css`, `admin/css/admin-stabilization.css`, `admin/css/admin-stabilization-visual-finish.css`, `admin/css/attendance-reward-settings.css`, `admin/css/crafting-oversight.css`, `admin/css/data-state-contracts.css`, `admin/css/game-creation-controls.css`, `admin/css/game-lifecycle-controls.css`, `admin/css/game-session-compact-layering.css`, `admin/css/game-session-controls.css`, `admin/css/interaction-quality.css`, `admin/css/inventory-redemption-queue.css`, `admin/css/keyboard-navigation.css`, `admin/css/logout-confirmation.css`, `admin/css/marketplace-lifecycle.css`, `admin/css/overview-quick-actions.css`, `admin/css/player-create-confirmation.css`, `admin/css/player-runtime-integration.css`, `admin/css/responsive-card-grid.css`, `admin/css/session-gate.css`, `admin/css/session-skeleton.css`, `admin/css/settings-final-polish.css`, `admin/css/settings-simplified.css`, `admin/css/world-runtime-console.css`, `admin/messaging-moderation.css`, `admin/progression-review.css` | Still required by legacy pages and compatibility surfaces; v2 retains only the scoped `admin/css/session-gate.css` bootstrap prerequisite, then uses `admin/v2/styles/**` for its UI |
| Repository-owned Admin assets | `admin/assets/icons/**`, `admin/assets/images/**`, `admin/assets/media/**`, `admin/assets/videos/**` | Shared visual assets remain valid; reuse must go through v2 icon/media primitives without changing bytes or Player assets |
| Historical marker file | `admin/window.ECONOVARIA_ADMIN_MOTION_BACKGROUND` | Preserved pending a deliberate provenance/consumer audit; Phase 1 does not delete unexplained legacy artifacts |

Brace notation in this inventory abbreviates the exact filenames already present in the same directory; it does not authorize deletion of any matching future file. The final PR diff must confirm that no retained legacy path was removed or rewritten; the Phase 1 route boundary is implemented wholly in the new v2 entry and modules.

## Donor branch disposition

`frontend/admin-terminal-source-v1` is a protected source-preservation donor, not an active feature authority. Its tip, `a772fbd7757f01c6b383a7ccb944be23f48a5d18`, preserves six unique commits around a v532-era static prototype. It is far behind current `main`, predates the accepted v606 runtime, contains generated output and preview/sample data, and has no open pull request.

Phase 1 may inspect it for provenance, source splitting lessons, and reusable repository-owned assets. It must not:

- branch from the donor tip;
- merge or rebase the donor into the v2 branch;
- wholesale cherry-pick its fragments, generated bundle, CSS, API adapter, demo data, or unsupported feature previews;
- treat its branch-only state as capability completion.

Any reused file or idea must be selected individually, checked against current `main`, attributed in the PR inventory, stripped of fabricated data and obsolete contracts, and covered by current tests. After the Admin migration finishes, the controller should record whether the donor is tagged as an immutable archive or deleted after all useful source is reconciled.

## Phased deletion plan

Deletion is gated by source ownership, parity evidence, merge to `main`, and any required runtime verification. No phase may delete a legacy surface merely because a replacement exists on an unmerged branch.

1. **Phase 1 — shell and Overview:** delete nothing. Establish `/admin/v2.html`, canonical navigation, primitives, authoritative Overview, exact legacy handoffs, and neutral planned boundaries. Overview remains the only migrated route at the end of this phase.
2. **Store and shared artwork:** migrate Store next and establish the reviewed repository-owned artwork/media treatment shared by later native routes. Retire only Store-specific legacy surfaces after merge and parity evidence.
3. **World native:** migrate World Management as the primary native `World` destination. Until that tranche is merged, it remains a first-class navigation item with a clearly labeled planned boundary. Retire `world-runtime-console*` only after world permissions, short-height navigation, and connected-data evidence pass.
4. **Players and Attendance:** migrate Players and Attendance in that order within the approved tranche. Remove only route-specific bridges, controllers, modals, and CSS whose consumers are proven absent.
5. **Contracts:** migrate Contracts after Players and Attendance, preserving server-authoritative reward and game-scope boundaries before removing its legacy surface.
6. **Marketplace, Settings, and Logs:** migrate these remaining canonical destinations after Contracts, with route-specific parity and security evidence before any matching legacy removal.
7. **Legacy deletion and archive closure:** only after every canonical destination is source-owned and merged, secondary legacy utilities are source-owned or explicitly dispositioned, replacement browser/security gates pass, and an authorized cutover exists, redirect `/admin` to the source-owned entry. Then remove the generated bundle, legacy bootstrap/order chain, broad observers, superseded transport compatibility layers, reconciliation styles, and superseded v606-only tests; retain or relocate still-used shared assets. Disposition `frontend/admin-terminal-source-v1` through a reviewed tag/archive-or-delete decision. The Phase 1 scoped read transport does not authorize changing or removing the legacy Admin transport.

## Risks and dependencies

| Risk or dependency | Required treatment |
|---|---|
| PR #498, `fix/admin-modal-focus-order-v1` | It owns a narrow legacy inert/focus-order compatibility fix, not v2 architecture. Reconcile merge order and any `admin/index.html` overlap. If merged, keep its guard under `/admin`; never load it in v2. |
| Current-main legacy ratchet failures | Exact clean-main and branch runs show `admin-scroll-integrity-smoke.mjs` passes byte-identically. Two inherited failures remain baseline-identical at their first differing output: `admin-shell-smoke.mjs` passes its four source children but only 2/4 viewport-scroll assertions, and `admin-v606-full-drift-audit.mjs` expects obsolete `admin/css/page-shell.css` blob `c4df8ae6…` instead of current `a9644c2…`. They are separate deferred legacy debt. Do not weaken them, update a hash merely to pass, or attribute them to v2; their required-check disposition and owning PR are outside this branch. |
| Selected-game URL privacy/hygiene | The eight UUID-free URL assertions remain enabled and red. The product owner accepts the existing `?game=<UUID>` handoff contract as a non-blocking Phase 1 legacy exception, reported separately as deferred debt. Public-handle design and coordinated Backend/legacy adoption are deferred. |
| Native dialog discussion | The current source-owned dialog primitive and focus contract remain the Phase 1 implementation. Native `<dialog>` migration is deferred to separately authorized compatibility and browser work. |
| Preserved donor branch | Treat as selective evidence only; no wholesale transplant. |
| Static `/admin/v2.html` resolution | Verify local and Vercel preview direct navigation and reload of the exact static entry. Do not change API rewrites or claim an unverified extensionless alias. |
| Authentication compatibility | Reuse the unchanged session/game-selection contracts and relative redirects. V2 uses a local, dependency-injected read transport and does not load or change legacy `admin-auth.js`. Wrong-role, expiry, revocation/security-version invalidation, AAL2, missing-game, 401/403/429/5xx, and retryable outage behavior must fail closed. |
| Legacy/v2 CSS collision | Apart from the retained `admin/css/session-gate.css` bootstrap prerequisite, v2 UI styling comes only from `admin/v2/styles/**`; any unavoidable `!important` must be documented with selector and reason. |
| Overview response drift | Normalize and validate the existing dashboard response. Never fabricate missing values or render raw errors. |
| Scope expansion | Every route except Overview—including Market, Banking, Loans, Business, Crafting, Store, Marketplace, Inventory, World Management, News & Events, Messages, Progression, Players, Attendance, Contracts, Settings, and Logs—remains implementation-out-of-scope for Phase 1. Backend work also remains out of scope. |
| Existing dirty/shared work | Final diff must exclude unrelated roadmap, Backend, Player, auth, migration, and infrastructure changes. |

## Test and evidence matrix

Verification ran on 2026-08-06 against implementation commit `3baed2ae36b9cbdf19fadab9b696f5b504d89eeb`, based on fetched `origin/main` SHA `f2694e40bac39b4ceb20951d88dddd38c6a9270a`. The implementation is published in draft PR #502 with a Git-connected Vercel preview; it is not merged or production-deployed.

| Evidence | Required assertion | Result |
|---|---|---|
| Navigation registry unit/DOM tests | Exact groups/order; World Management present; active route uses `aria-current="page"`; collapsed controls retain accessible names | **LOCAL PASS** — `npm run test:admin-v2` (6/6 unit contracts) plus browser accessible-name assertions |
| Safe error normalization unit tests | Required envelope; allow-listed messages; no raw backend, SQL, Supabase, stack, function, environment, service-role, or UUID leakage | **LOCAL PASS** — `npm run test:admin-v2` |
| Keyboard navigation tests | Arrow/Home/End behavior, visible focus, route activation, short-height rail access | **LOCAL PASS** — `npm run test:admin-v2:browser` |
| Dialog focus tests | Focus enters the shared dialog primitive, Tab and Shift+Tab wrap, Escape closes, background is inert, cleanup and opener restoration occur | **LOCAL PASS** — exercised through `AdminDrawer`, which composes `AdminDialog`, in `npm run test:admin-v2:browser` |
| Data-state tests | Initial loading, ready, refreshing with retained content, stale, empty, failed, explicit retry, panel-local failure | **LOCAL PASS** — unit state/projection contracts and browser state scenarios |
| Permission tests | Denial preserves shell/navigation, performs no protected Overview read, and exposes no raw policy details | **LOCAL PASS** — browser fixture recorded zero protected Overview reads |
| Browser 1440×900 | Ready-state visual, authoritative content, no overflow/console errors | **LOCAL PASS** — `overview-ready-1440x900.png` |
| Browser 1280×720 | Ready-state visual, direct reload, interaction and state variants | **LOCAL PASS** — `overview-ready-1280x720.png` and state captures |
| Browser 1024×768 | Compact desktop/tablet layout | **LOCAL PASS** — `overview-ready-1024x768.png` |
| Browser 768×1024 | Portrait tablet and normal-flow transition | **LOCAL PASS** — `overview-ready-768x1024.png` |
| Browser 390×844 | Mobile ready-state layout and normal-flow transition | **LOCAL PASS** — `overview-ready-390x844.png` |
| Browser 320×568 | Narrow/short layout, reachable nav/game region, no clipped controls | **LOCAL PASS** — `overview-ready-320x568.png` |
| Short desktop | Independent rail scroll and persistent game selector at 1024×540 | **LOCAL PASS** — `overview-short-desktop-1024x540.png` |
| Long-name fixtures | Long administrator, game, and player names do not collide, clip, or expose private identifiers | **LOCAL PASS** — asserted at every ready viewport |
| Overview variants | Authoritative non-empty, empty, initial-loading, refreshing, stale, failed, and permission-denied presentations | **LOCAL PASS** — covered within the 42-pass source and built-dist runs, with 12 screenshots; see `admin-v2-browser-results.json` |
| Navigation rail scrolling | Every item and game selector/code region reachable at short heights; World Management visible | **LOCAL PASS** — 1024×540 desktop and 320×568 mobile assertions |
| Document integrity | No horizontal document overflow and no concealed content at all required viewports | **LOCAL PASS** — all browser scenarios |
| Browser safety and built MIME/CSP | Correct JS/CSS MIME; no missing/failed resources; no CSP or Trusted Types warnings; no unexpected console/page error; no raw backend message rendered | **LOCAL PASS** — final source records 1,387 and built dist records 1,384 JS/CSS responses with zero MIME errors, missing/failed static requests, CSP/Trusted Types warnings, or unexpected console/page errors. Each run's 24 deliberate session/API failures produce only their correlated browser HTTP-status messages. |
| Legacy boundary smoke | All seven exact legacy labels preserve opaque selection; focus, history, deliberate handoff, return, and no-loop behavior pass | **LOCAL PASS** — Players, Attendance, Market, Contracts, Store, Settings, and Logs each pass the exact legacy-boundary contract. |
| Planned boundary smoke | All ten planned labels render a neutral source-owned state, expose no unrelated legacy link, retain focus/history, and fail closed on permission denial | **LOCAL PASS** — includes independently reachable Marketplace and first-class World Management. |
| Deferred selected-game URL assertions | Preserve the eight previously documented UUID-free predicates without relabeling them as passes | **8 EXPECTED LEGACY-CONTRACT EXCEPTIONS, 0 NEW FAILURES** — the authoritative `?game=<UUID>` contract remains unchanged; public-handle cleanup is separately deferred. |
| Existing Admin checks | Relevant required Phase 1 release checks remain unchanged and no assertion is weakened | **LOCAL PASS WITH DOCUMENTED DEFERRED LEGACY DEBT** — the requested release matrix passes. The inherited viewport assertions in `admin-shell-smoke.mjs` and stale page-shell hash in `admin-v606-full-drift-audit.mjs` remain outside this tranche under separate ownership. |
| Security/API boundaries | Existing authentication and BFF request-auth contracts, secret scan, and v2 same-origin read boundary | **LOCAL PASS** — `npm run test:auth-boundaries` (16/16 plus 8/8), `npm run security:secrets`, and browser assertions for GET-only `/api/admin` requests without an `Authorization` header |
| Player Terminal regression | Player runtime source ownership and retired-path boundary remain green | **LOCAL PASS** — `npm run test:player-runtime-cutover` (38 retired paths) |
| Scope diff audit | No Backend, migration, Supabase config, Player Terminal, production config, or unrelated file change | **LOCAL PASS** — only `admin/v2*`, focused scripts/package registration, evidence, architecture/PR docs, and the roadmap ledger are changed |
| Vercel preview static contract | Direct exact-route load and reload; complete intended resource inventory; correct MIME; no CSP or Trusted Types regression | **PREVIEW PASS** — https://econovaria-git-refactor-admin-ui-v2-overview-a22902-econovaria.vercel.app returns initial HTML HTTP 200 for both direct load and reload of `/admin/v2.html`; all 48 intended files return HTTP 200 with correct MIME, and the browser direct-load records all 40 V2 JavaScript and CSS resources with no missing-resource, CSP, or Trusted Types failure. |
| Vercel preview session boundary | Distinguish Phase 1 behavior from inherited preview-environment behavior without changing authentication | **INHERITED ENVIRONMENT LIMITATION, NOT A PHASE 1 REGRESSION** — the session-dependent probe encounters staging-preview CORS behavior that reproduces on the unrelated PR #501 legacy Admin preview. Phase 1 changes no authentication, Backend, BFF, or environment behavior and does not claim authenticated preview-session parity from this probe. |
| Initial implementation-commit CI | Identify every terminal check without attributing current-main debt to V2 | **31 SUCCESS, 9 SKIPPED, 6 BASELINE-IDENTICAL FAILURES; 0 NEW PHASE 1 REGRESSIONS** — the six failed runs reduce to legacy runtime-style injection, stale v606 hash, two inherited scroll assertions reported twice, and the existing legacy MutationObserver ratchet reported twice. No V2 file owns a first failure. |
| Screenshots | Sanitized captures for all six required viewport sizes plus data-state and short-desktop evidence | **COMMIT-BOUND FIXTURE PASS** — 12 captures under `docs/operations/evidence/admin-ui-v2-phase1/` |
| Whitespace/source audit | `git diff --check`; no broad observer, additional global fetch wrapper, runtime style injection, undocumented `!important`, or generated v606 import | **LOCAL PASS** — `git diff --check`, syntax checks, and scoped V2 source search pass. |

`BETA-ADMIN-UI-V2-001` is `IMPLEMENTED_NOT_MERGED`: implementation commit `3baed2ae36b9cbdf19fadab9b696f5b504d89eeb` is published in draft PR #502 and its static Git-connected preview contract passes. Required workflows, review, authenticated environment parity, and merge remain outstanding. The selected-game UUID assertions and two baseline-identical legacy ratchets remain separately reported debt; none is weakened or relabeled as passing. The inherited staging-preview session CORS condition reproduces on unrelated PR #501 legacy Admin and is not a Phase 1 regression; no authentication behavior changed. The item may become `VERIFIED_COMPLETE` only after merge to `main` and all required preview/runtime evidence exists.
