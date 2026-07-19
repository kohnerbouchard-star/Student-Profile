# Econovaria Admin current-state audit

**Audit date:** 2026-07-18  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Branch:** `agent/admin-platform-next-v1`  
**Baseline:** `56ee041c10d440fdd2a792723636d08651e4ffd0`  
**Baseline event:** PR #157 merged into `main`

## Scope and ownership

This audit covers only the administrator frontend and its administrator-specific test surface:

- `admin/**`
- `scripts/admin-*.mjs`
- Admin-specific documentation

It does not authorize or modify:

- `backend/**`
- `backend/supabase/**`
- `player-terminal/**`
- database migrations
- production infrastructure
- legacy player frontend files
- shared workflows or root package files

No shared-file lease was used for this audit.

## Executive assessment

The accepted v606 Admin shell remains visually stable and has strong regression coverage for desktop, compact, and narrow layouts. Core teacher workflows—session handoff, player creation and identity, Contracts, Store, Attendance, Logs, and Settings—are substantially integrated and fail closed where backend capabilities are absent.

The highest-value Admin-only work is not a redesign. It is a focused stabilization program with three immediate objectives:

1. replace the generic full-page loading overlay with route-accurate structural skeletons;
2. establish complete modal keyboard, focus-trap, Escape, and focus-restoration behavior;
3. reduce the compatibility architecture by removing global request interception and broad DOM observation one bounded layer at a time.

Backend-dependent capability work, including inventory redemption, must remain blocked until the reconciled backend contract is merged into `main` and formally handed off.

## Current strengths

### Accepted visual system remains protected

The generated v606 terminal bundle and its primary styles remain locked. Runtime modules extend authentication, API compatibility, credentials, validation, and responsive behavior without replacing the accepted shell.

### Responsive layout coverage is broad

The browser suite opens every primary navigation page at:

- 1440 × 1000
- 1024 × 768
- 768 × 900

It verifies page activation, headings, horizontal overflow, unexpected modals, generic asset leakage, and runtime errors.

### Identity boundaries are materially correct

- Internal player UUID is retained as a backend route target.
- Player ID / RFID remains mutable and player-facing.
- Access Code remains separate and hash-only after issuance.
- Existing-player credentials are edited through the player profile popup.
- Removed standalone identity managers are guarded by browser tests.

### Mutation state coverage exists

The interaction-quality layer currently provides validation, processing, success, and error presentation for major Admin writes. Scanner processing, completion, error, rapid rearm, and name-first identity presentation are tested.

### Unsupported capabilities fail closed

Unavailable notifications, direct messaging, roster CSV import, Google Classroom, Store pause, marketplace writes, and other incomplete operations return truthful disabled states instead of claiming success.

## Prioritized defect and debt register

### ADM-P0-01 — Generic page skeleton is structurally inaccurate

**Category:** loading UX / layout stability  
**Severity:** P0 for the next Admin tranche  
**Backend dependency:** none

The current `interaction-quality.js` creates one absolute page overlay containing a two-block heading and six generic cards. The same structure is used for Overview, Players, Contracts, Store, Attendance, Marketplace, Settings, and Logs.

This cannot preserve the geometry of:

- metric-card rows;
- tables and table columns;
- Contracts review panes;
- Store item grids;
- Settings disclosure rows and controls;
- Attendance records;
- modal and drawer content.

The current smoke test verifies only that the skeleton appears and later becomes hidden. It does not compare loading and loaded bounding boxes.

**Required correction**

- Define a route-aware loading shell registry.
- Use the same structural shell as the loaded page wherever practical.
- Preserve page headings and landmarks.
- Mark the loading region `aria-busy="true"`.
- Mark decorative shapes `aria-hidden="true"`.
- Keep stale data visible during background refresh.
- Add loading-to-loaded geometry assertions with documented tolerance.

**Initial target tolerance**

- outer shell width and height delta: no more than 4 px;
- primary card/table column left-edge delta: no more than 4 px;
- toolbar height delta: no more than 2 px;
- modal outer dimensions: no more than 4 px;
- zero page-level horizontal overflow.

### ADM-P0-02 — Player-created modal lacks complete accessibility lifecycle

**Category:** accessibility / modal behavior  
**Severity:** P0  
**Backend dependency:** none

The Player-created confirmation correctly declares `role="dialog"` and `aria-modal="true"`, and it focuses its Copy action. It does not currently implement:

- focus trapping;
- Escape dismissal;
- restoration to the control that opened the create workflow;
- explicit cleanup of modal keyboard handlers;
- a tested keyboard-only completion path.

Backdrop-click dismissal also removes the dialog without restoring focus.

**Required correction**

- Capture the opener before the workflow begins.
- Trap Tab and Shift+Tab inside the active modal.
- Support Escape unless an operation is committed and requires acknowledgement.
- Restore focus to the opener or a stable page fallback.
- Add browser coverage for keyboard-only operation.

### ADM-P0-03 — Legacy credential dialog remains as suppressed runtime code

**Category:** duplicate UI / architectural debt  
**Severity:** P0  
**Backend dependency:** none

`player-access-code-bridge.js` still contains an inline-styled credential dialog. `player-create-ux.js` removes that dialog through DOM observation and substitutes the accepted Player-created confirmation.

This creates a race in which one module creates UI that another module immediately removes. It also retains inline styles that conflict with future CSP enforcement and the accepted external-style boundary.

**Required correction**

- Separate credential event emission from presentation.
- Remove the obsolete dialog renderer after confirming all consumers use the accepted confirmation or profile status surface.
- Preserve one-time credential display behavior.
- Add a source test preventing the legacy dialog from returning.

**Resolution (2026-07-19):** `VERIFIED_COMPLETE` through PR #226. `player-access-code-bridge.js` is event-only and contains no dialog renderer or inline presentation. The remaining selector, removal helper, and observer-driven suppression calls were removed from `player-create-ux.js`, while the accepted one-time Player-created confirmation remains authoritative. The Player create smoke now fails closed if the legacy marker or suppression path returns.

### ADM-P1-01 — Interaction state depends on a global `window.fetch` wrapper

**Category:** request architecture  
**Severity:** P1  
**Backend dependency:** none

`interaction-quality.js` wraps `window.fetch`, reads request bodies, infers the active action from route/body/DOM state, and paints processing or success based on the HTTP response.

Risks:

- action attribution can be wrong when multiple writes overlap;
- a request can be associated with stale `activeAction` DOM state;
- request-body cloning and normalization are duplicated across wrappers;
- success presentation is coupled to transport interception rather than the owning controller;
- adding future Admin actions expands a central route-inference table.

**Required correction**

- Move action lifecycle ownership to bounded feature controllers.
- Use explicit start/commit/fail events where compatibility bridging is still required.
- Remove the interaction-quality fetch assignment.
- Keep committed-success independent from follow-up refresh failure.
- Lower the architecture ratchet after removal.

### ADM-P1-02 — Admin remains at the compatibility ceiling

**Category:** architectural debt  
**Severity:** P1  
**Backend dependency:** none

The current ratchet permits eight `window.fetch` assignments and thirteen `MutationObserver` instances. The production execution plan identifies these as the current starting point, not a target state.

The largest broad observers include:

- session mount detection over the document subtree;
- Admin stabilization reconciliation over the body subtree and selected attributes;
- interaction-quality form and loading reconciliation over the body subtree;
- Player creation and credential UI reconciliation;
- player profile identity reconciliation.

**Required correction**

Reduce in bounded increments:

1. remove the interaction-quality fetch wrapper;
2. replace session mount observation with an explicit mounted event;
3. consolidate player form/profile reconciliation into one scoped lifecycle;
4. replace broad stabilization observation with explicit route/modal lifecycle hooks where available;
5. lower the ratchet after every verified removal.

### ADM-P1-03 — Script bootstrap is highly ordered and brittle

**Category:** runtime initialization  
**Severity:** P1  
**Backend dependency:** none

`admin/index.html` loads a long sequence of compatibility scripts. One script uses an inline `onload` attribute to dynamically import seven additional modules in sequence.

Risks:

- ordering is difficult to reason about;
- one failed dynamic import can prevent later modules from loading;
- inline event-handler code conflicts with future CSP enforcement;
- module ownership and failure reporting are unclear.

**Required correction**

- Replace the inline import chain with one external Admin bootstrap module.
- Keep load order explicit in source.
- Report module initialization failure through the session/runtime error surface.
- Do not convert the entire Admin application to a new framework or bundler.

### ADM-P1-04 — Modal focus behavior is not covered across Admin workflows

**Category:** accessibility testing  
**Severity:** P1  
**Backend dependency:** none

The current workflow opens create modals, Contract review, account surfaces, player profile, player drawer, and the scanner, but the test suite primarily drives them through pointer clicks.

Missing cross-cutting assertions:

- initial focus placement;
- Tab/Shift+Tab containment;
- Escape behavior;
- focus restoration;
- nested popup behavior;
- keyboard-only completion.

**Required correction**

Create a shared Admin modal accessibility smoke that covers at minimum:

- Add Player;
- Player-created confirmation;
- Edit Player Profile;
- Add Contract;
- Contract review;
- Add Store Item;
- Attendance scanner;
- one account surface.

### ADM-P1-05 — Background refresh has no explicit stale-data presentation contract

**Category:** data freshness UX  
**Severity:** P1  
**Backend dependency:** none for presentation contract

The generic skeleton is limited mostly to initial or navigation reads, which avoids some refresh collapse. However, there is no shared explicit contract for:

- keeping valid data visible;
- showing subtle refresh progress;
- differentiating stale, refreshing, degraded, and failed states;
- preserving committed success when a refresh fails.

**Required correction**

- Define page-region states: loading, loaded, refreshing, stale, empty, error.
- Never replace valid content with skeletons during refresh.
- Add a non-blocking refresh indicator.
- Keep mutation receipt/success visible if the subsequent read fails.
- Test this behavior with delayed and failed mocked reads.

### ADM-P1-06 — Session gate depends on broad DOM observation

**Category:** authentication shell lifecycle  
**Severity:** P1  
**Backend dependency:** none

The session gate watches the document subtree and `hidden` attribute until the v606 mount becomes visible and non-empty.

**Required correction**

- Dispatch an explicit Admin-mounted event from the boot lifecycle.
- Release the gate from that event.
- Retain a bounded timeout and actionable failure state.
- Remove the document-wide observer and lower the observer ratchet.

### ADM-P2-01 — Overview metrics contain incomplete product semantics

**Category:** feature completeness  
**Severity:** P2  
**Backend dependency:** possible

The Admin runtime explicitly advertises `overallScore: false`. Net worth and scoring must not be synthesized in the browser. Any expansion requires a formal backend read-model contract.

**Required correction**

- Keep truthful unavailable/partial presentation.
- Document the required backend fields and calculation ownership.
- Do not implement browser-side score or net-worth formulas.

### ADM-P2-02 — Marketplace remains read-only without a capability-aware operating model

**Category:** feature completeness  
**Severity:** P2  
**Backend dependency:** yes

The Marketplace page is intentionally read-only. This is safe, but its future write controls must not be enabled from inferred routes or donor PRs.

**Required correction**

- Retain read-only state.
- Add capability-aware status only after the reconciled backend manifest is on `main`.
- Wait for a formal contract covering listing, reservation, purchase, cancellation, settlement, fees, moderation, and disputes.

### ADM-P2-03 — Inventory redemption Admin surface is blocked

**Category:** backend dependency  
**Severity:** P2 until backend handoff

Do not wire PR #143 donor routes. The Admin queue must wait for the reconciled backend implementation on `main`.

Required backend handoff:

- method and route;
- authorization and game ownership;
- request and response schema;
- state enum;
- transition rules;
- error codes;
- idempotency behavior;
- pagination and filters;
- audit history;
- capability flag;
- migration dependency;
- example responses.

### ADM-P2-04 — Production-backed verification remains separate from frontend CI

**Category:** release verification  
**Severity:** P2  
**Backend dependency:** operational

Mocked browser tests provide strong deterministic regression coverage but do not prove live persistence, deployed function parity, real latency behavior, or production device behavior.

**Required correction**

- Maintain deterministic mocked CI.
- Add staging-backed smoke only after an isolated staging environment exists.
- Do not run destructive production smoke from the Admin branch.

## Page-by-page status

### Overview

**Current state:** visually stable and responsive; authoritative reads present.  
**Primary gaps:** shape-accurate metrics/activity skeletons, explicit refreshing/degraded state, backend-owned overall-score semantics.

### Players

**Current state:** Add Player, generated/custom credentials, profile identity editing, drawer tabs, and UUID hiding are covered.  
**Primary gaps:** modal keyboard/focus lifecycle, duplicate credential-dialog cleanup, shape-accurate table/profile skeletons, consolidation of form/profile observers.

### Contracts

**Current state:** create payload, validation, review, revision/rejection/approval flows, reward issuance, and browser behavior are covered.  
**Primary gaps:** Contracts list and review-workspace skeleton geometry, keyboard review workflow, explicit refresh failure behavior. Direct file upload remains correctly disabled.

### Store

**Current state:** create and supported management actions are integrated; unsupported global pause fails closed.  
**Primary gaps:** Store-grid skeleton geometry, keyboard modal behavior, explicit stale catalog state, live staging verification.

### Marketplace

**Current state:** safe read-only surface.  
**Primary gaps:** capability-aware status after backend handoff; no write work should begin yet.

### Attendance

**Current state:** scanner state machine, name-first identity, localized reward response, compact timestamp, rapid rearm, records, and Settings behavior are strongly tested.  
**Primary gaps:** camera/result geometry skeleton, scanner-modal focus containment and restoration, explicit background refresh indicator.

### Logs

**Current state:** read and export compatibility are present.  
**Primary gaps:** table-shaped skeleton, refresh/degraded state, keyboard access to row actions and export history.

### Settings

**Current state:** explicit Save behavior, disclosure persistence, focused input stability, attendance policy ownership, and game isolation are tested.  
**Primary gaps:** shape-accurate disclosure/control skeletons, reduction of overlapping route bridge/save/settings modules, keyboard and degraded-read coverage.

### Authentication and session gate

**Current state:** transferred session, refresh rotation, expiry, and redirect behavior are established.  
**Primary gaps:** explicit mounted event instead of broad observer, shape-accurate verification shell, module-load error reporting.

### Responsive navigation

**Current state:** all primary pages pass horizontal-overflow checks at three viewports.  
**Primary gaps:** keyboard-only navigation, focus visibility, and selected-page announcement coverage.

## Execution plan

### Tranche A — test the missing contracts before implementation

Admin-owned files only.

1. Add loading-versus-loaded geometry smoke coverage.
2. Add shared modal keyboard/focus smoke coverage.
3. Add stale-data/background-refresh smoke coverage.
4. Add a source audit preventing new global fetch assignments and new broad observers.
5. Record the baseline geometry and architecture counts.

**Exit gate**

Tests fail for the currently identified defects and pass only after bounded corrections.

### Tranche B — shape-accurate loading foundation

1. Replace the generic six-card overlay with route-aware shells.
2. Implement Overview, Players, Contracts, Store, Attendance, Logs, and Settings skeletons.
3. Keep headings and current data visible where appropriate.
4. Respect reduced motion.
5. Add modal/drawer loading shells without resizing.

**Exit gate**

Geometry tests pass at desktop, compact, and narrow viewports with the documented tolerance.

### Tranche C — modal accessibility foundation

1. Implement bounded focus trapping.
2. Add Escape behavior.
3. Restore focus to the opener.
4. Remove the obsolete inline credential dialog.
5. Cover all major modals and the player drawer.

**Exit gate**

Keyboard-only browser tests pass and no modal leaks focus to the page background.

### Tranche D — first architecture reduction

1. Remove the `interaction-quality.js` global fetch assignment.
2. Replace inferred lifecycle state with explicit feature/controller events.
3. Replace the session-gate document observer with an explicit mounted event.
4. Consolidate player form/profile reconciliation where safe.
5. Lower the architecture ratchet after each removal.

**Exit gate**

At least one fetch assignment and one MutationObserver are removed without weakening existing Admin gates.

### Tranche E — backend-contract preparation only

1. Define adapter interfaces for capability state and redemption queue data.
2. Render integration-pending states using fixtures only.
3. Do not add production routes, payloads, or mutations.
4. Wait for formal backend handoff.

**Exit gate**

No backend assumption is embedded in production Admin code.

### Tranche F — inventory redemption after backend merge

Implement only after the reconciled backend and migration are on `main`.

1. Pending and historical queue.
2. State and game filters.
3. Player-facing identity only.
4. Approve, reject with reason, and fulfill.
5. Invalid-transition prevention.
6. Idempotent repeated action handling.
7. Committed-success preservation.
8. Transition and audit history.
9. Explicit error rendering.

## Required gates for every Admin implementation tranche

- Admin Shell Smoke
- Admin API Check
- Admin Bundle Contract Audit
- Repository Quality
- relevant Admin feature smoke tests
- desktop viewport
- compact desktop viewport
- narrow viewport
- keyboard-only workflow
- modal focus trap
- Escape behavior
- focus restoration
- loading-to-loaded geometry stability
- no internal UUID leakage

Backend Typecheck and Player Terminal Verify are required only when an approved shared contract or shared behavior is affected.

## Recommended first code batch

Start with Tranche A and a narrowly scoped portion of Tranche C:

1. create the geometry and modal-accessibility browser tests;
2. correct Player-created confirmation focus trap, Escape, and restoration;
3. remove the obsolete credential dialog renderer;
4. do not yet replace all page skeletons until the geometry baseline is captured.

This batch is Admin-only, backend-independent, and does not require a shared-file lease.
