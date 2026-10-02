# UX — Player Identity, Information and UX Closure

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Make the player’s situation understandable, their identity persistent and every visible action truthful, accessible and recoverable.

## Verified starting point and limits

The current profile page presents identity, country, game/session details and refresh/sign-out. However, the prior audit’s blanket dead-control claim was incorrect: local-controls-flow.js is installed from main.js and implements export, Market search and range changes. Its range mapping uses fixed sample counts, and export converts amounts through Number; those deserve precision/semantics review rather than a claim that no implementation exists.

## Ownership and integration boundaries

Player Terminal owns presentation and local interaction state, not economic truth. Backend domains own queries and mutations. Profile displays public approved achievements/identity; Messaging/Notifications own delivery/read state; Banking owns transaction records. Preserve Admin V2, authentication boundaries, the World map and existing design tokens.

## Candidate records and interfaces

Candidate additive state: player display preferences, selected earned cosmetics, notification preferences, accessible read-model metadata and public accomplishment projection. Never introduce a parallel wallet, action result cache treated as authority or a public private-finance profile.

Candidate interfaces: readPlayerLifeOverview, updateDisplayPreferences, selectEarnedCosmetic, readNotificationHistory and exportOwnLedgerRange. Actual endpoints require contract audit; existing local search/export should be reused where accurate.

## Content and fixture scope

Test real routes at narrow mobile, desktop, zoom, keyboard-only, screen reader, reduced motion, long text and supported languages. Use a small set of synthetic beginner, established, distressed and returning-player personas, not real students’ profiles.

## Explicit exclusions

No another full shell rewrite, hidden money controls, decorative social feed, unrestricted attachment uploader, exposure of private balances/messages/reputation, or placeholder buttons presented as working capabilities.

## Milestones

### UX-01 — Audit actual interaction wiring and write a closure ledger

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Trace each visible control from render to capture-phase handler, API descriptor, public route, authorization, result mapping and refresh. Classify working, incorrect, incomplete, intentionally disabled or obsolete. Include feature-installed handlers before reading app.js fallbacks. Inventory loading, empty, disabled, error, stale, processing and replay states. Review messaging search separately; attachments remain a policy decision, not an automatic implementation task.

**Player and Admin experience.** Produce a screen-by-screen action ledger with a real reproduction and outcome. Remove only demonstrably obsolete controls or give an accurate disabled reason. Preserve existing good flows and the interactive map rather than replacing the shell.

**Acceptance and adversarial tests.** Exercise actual browser clicks and keyboard submissions in the production entrypoint under synthetic authentication. Test route changes, reinstalls and duplicate event handlers. A fallback string alone cannot substantiate a dead-button finding.

**Exit gate.** Every visible interactive control has a truthful disposition and an acceptance case.

### UX-02 — Fix chart semantics, search coverage and export fidelity

**Dependencies:** `UX-01`, `FND-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Change chart windows to use timestamped authoritative series and actual time ranges, with explicit downsampling/coverage, rather than equating 24 samples to one day or 365 samples to a year. Preserve gaps and unknown history instead of inventing zero prices. Distinguish searching loaded rows from server-wide search. Export exact decimal text, correct currency, stable ordering, coverage range and pagination. Review untrusted text for formula injection; choose and test a target-aware safe export strategy rather than rely only on comma/quote escaping.

**Player and Admin experience.** Show as-of time, available history and whether search/export covers the current page or a complete selected range. Offer clear empty results and partial/unavailable data. Keep current functional local handlers while improving their semantics.

**Acceptance and adversarial tests.** Test irregularly spaced ticks, missing days, exchange closures, sparse series, huge exact decimals, multi-currency amounts, long Unicode descriptions, leading formula characters, repeated pagination and concurrent data updates. Do not claim a confirmed exploit without establishing an input path.

**Exit gate.** Range labels mean actual time windows; search scope is honest; downloaded records preserve authorized data and monetary precision.

### UX-03 — Build an integrated Life overview and useful profile

**Dependencies:** `UX-01`, `LIFE-04`, `PROG-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Create a read model combining Signals, Opportunities, Obligations, Consequences and Position from canonical sources. Profile adds earned credentials, selected badges/titles, career summary, residency summary and major accomplishments. Show private finances and commitments only to the player and authorized staff. Separate display-name preferences from immutable identity and mutable public Player ID. Use earned catalog cosmetics with moderation/availability rules, not arbitrary uploaded assets in the first release.

**Player and Admin experience.** Players should answer: What changed? What requires attention? What can I do next? What have I achieved? Keep current account/session controls. Add privacy-preview controls for any public profile; financial distress, private reputation, grades and messages are not public by default.

**Acceptance and adversarial tests.** Test missing one upstream service, stale data, revoked cosmetic, renamed Player ID, cross-game profile, very long names and a new player with no achievements. A zero value must not stand in for unavailable money.

**Exit gate.** The profile reflects a persistent game identity and the overview provides a usable next decision without becoming a second economic system.

### UX-04 — Upgrade notifications into an actionable attention system

**Dependencies:** `UX-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Extend existing notification delivery/read history with categories, severity, source links, grouping, expiry and user preferences where justified. Count unread state from the authoritative summary, not the length of a paginated list. Avoid marking a notification read merely because it rendered; define an explicit viewed/acknowledged rule. Group repeated low-priority updates while preserving critical obligations and an accessible audit trail.

**Player and Admin experience.** Add a searchable/filterable history and action links for bills, offers, completed orders, Contract review and relevant World changes. Let players mute optional categories or choose digests without concealing unavoidable commitments. Admin can diagnose delivery without reading unrelated private messages.

**Acceptance and adversarial tests.** Test pagination, mark-read races, multiple tabs, duplicate events, expired deep links, changed permissions, missed weeks and empty state. One user preference change cannot affect another game or player.

**Exit gate.** Notifications help players act rather than merely increase unread counts; critical items remain visible without modal overload.

### UX-05 — Unify review-confirm-receipt and recovery patterns

**Dependencies:** `UX-02`, `UX-03`, `UX-04`, `LIFE-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Apply a shared interaction pattern to new jobs, leases, bill payments, character offers, credentials and existing commerce: glance, inspect, act, review, confirm and inspect consequence. Preserve exact costs, funding source, expiry and irreversible terms before confirmation. Keep browser form drafts separate from committed server state. After ambiguous failure, reconcile the existing operation ID rather than generating a new payment automatically.

**Player and Admin experience.** Use dropdowns, constrained numeric fields and clear buttons for actions; reserve free text for reasoning, messages and approved notes. Provide back/cancel controls, stable focus and pending-but-committed messaging. Hide secondary detail only when decision-critical information stays visible.

**Acceptance and adversarial tests.** Test double-click, Enter submission, browser back/refresh, second-tab completion, failed refresh after successful mutation, a stale quote and network loss. Ensure no blanket retry changes a non-idempotent action into a duplicate.

**Exit gate.** Material actions follow a consistent truthful flow and recover safely without the player needing technical knowledge.

### UX-06 — Complete accessibility and responsive acceptance

**Dependencies:** `UX-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Apply a WCAG 2.2 AA-oriented test plan across changed screens, combining automated checks with manual keyboard and assistive-technology review. Verify focus visibility/order, error association, status announcements, labels, touch target spacing, contrast, text scaling, reduced motion and responsive reflow. Retain the existing map’s keyboard/hit areas; a decorative redesign is out of scope. Avoid relying on color alone for profit/loss or severity.

**Player and Admin experience.** Test the actual review forms, timed quotes, tables, drawers, dialogs and navigation. Players must be able to inspect terms and cancel with a keyboard. Admin tables must remain usable at zoom and on supported smaller screens.

**Acceptance and adversarial tests.** Exercise narrow mobile, portrait/landscape, 200%/400% zoom where applicable, screen-reader live regions, long translated text and loading/error states. Record manual exceptions; passing an automated scanner alone is not a compliance certificate.

**Exit gate.** Changed workflows satisfy the adopted accessibility criteria with documented manual evidence and no regression to protected map/navigation behavior.

### UX-07 — Observe multiplayer usability and information freshness

**Dependencies:** `UX-05`, `REL-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Test beginners, experienced players, distressed players and returning players on realistic multi-user sessions. Check that updates to vacancies, housing capacity, market prices, messages and bills reach the right surfaces without full-page refresh dependence. Prefer targeted reconciliation and preserve manual refresh fallback. Measure actual request/query counts and protect existing performance budgets rather than inventing new thresholds after failures.

**Player and Admin experience.** Observe whether participants can find income, understand a due bill, compare a job/housing choice, ask a character a useful question and locate a completed receipt. Admin should identify stuck players and operational failures without a separate spreadsheet.

**Acceptance and adversarial tests.** Run concurrent supported classroom-load profiles, tab switching, reconnect, expired session, stale market data and simultaneous claims. Capture task completion, misunderstanding, unnecessary clicks, focus loss, p95 latency and console errors.

**Exit gate.** Prioritized usability defects have reproducible cases and owners; no critical decision depends on a misleading stale view.

### UX-08 — Close UX debt and certify the complete player experience

**Dependencies:** `UX-06`, `UX-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Re-run the action closure ledger against the accepted build and production entrypoints. Remove truly unreachable obsolete fallback code only after proving all supported callers use the canonical path. Update current documentation and keep historical docs labelled as historical. Complete per-feature screenshots, manual accessibility notes and recovery recordings using synthetic data. Preserve architectural ceilings and reduce local debt where the changed feature makes that possible.

**Player and Admin experience.** Walk through onboarding, earning, spending, communicating, learning and returning after absence. Each route is either useful and functional, clearly unavailable for a valid policy reason, or absent. The player should not see developer diagnostics outside the approved environment.

**Acceptance and adversarial tests.** Require zero known false-success flows, zero actionable controls with no legitimate implementation, exact money/history semantics, complete session-expiry behavior and no exposed internal IDs. Confirm no hidden duplicate handlers remain.

**Exit gate.** The Player experience is accepted as a coherent product, with remaining optional enhancements explicitly separated from defects.

## Source basis

**R3 — Installed local-controls implementation.** Export, local Market search and range handler; range limits currently expressed as sample counts; CSV amount conversion uses Number. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/features/local-controls/local-controls-flow.js`.

**R4 — Player entrypoint wiring.** Imports and installs installLocalControlsFlow; verified by current-main search excerpts. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/main.js`.

**R10 — Current Player navigation registry.** Inspected lines 1–37 show Work/Finance/World/Profile destinations; supports navigation-gap assessment only. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/components/layout.js`.

**R11 — Current Player Profile page.** Identity/country/game/session display and refresh/sign-out controls; development-only diagnostics. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/pages/profile-page.js`.

**E2 — OWASP — CSV Injection.** Primary security guidance for formula-injection threat modelling and target-aware export testing. No blanket claim of a proven Econovaria exploit. Source: `https://community.owasp.org/attacks/CSV_Injection`.

**E3 — W3C WAI — Understanding WCAG 2.2.** Informative guidance supporting the proposed accessibility acceptance plan, not a certification of conformance. Source: `https://www.w3.org/WAI/WCAG22/Understanding/`.



---
