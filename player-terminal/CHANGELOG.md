# v7.5.0 — API-readiness hardening

- Replaced the eighteen-read all-or-nothing bootstrap with session/dashboard bootstrap and route-local lazy loading.
- Added fail-closed route and action capabilities for connected environments.
- Disabled preview records in production and staging, including query-string attempts.
- Added adapter timeouts, cancellation signals, request IDs, read deduplication, and normalized safe errors.
- Added player-session, request-ID, and idempotency headers to direct HTTP mode.
- Added session-generation isolation so host session replacement aborts outstanding work and cannot admit stale reads, invalidations, or cooldowns into the new player session.
- Added per-action/resource write serialization, short cooldowns, and critical-write idempotency keys.
- Added targeted post-write invalidation and authoritative refetches.
- Added bounded response normalization, remote-image allowlisting, finite-number handling, and write-payload validation.
- Removed the provisional logout endpoint and retained host-owned sign-out.
- Removed player-facing API placeholder language and gated unavailable controls.
- Preserved all approved v7 CSS, icon, map, responsive, and visual evidence locks.

# v7.4.0 — Surgical visual normalization

- Preserved the approved v7 CSS layers, icon component, map geometry, and session/API adapter.
- Added one isolated normalization stylesheet rather than rewriting the visual system.
- Standardized typography roles and a 4/8/12/16/24/32 spacing rhythm.
- Repaired product, supplier, recipe, production-job, and loan-name inline-flow collisions.
- Improved long-name wrapping across contracts, Store, Inventory, Market, Messages, Business, and Profile.
- Corrected the mobile Store search field's 240px vertical flex collision.
- Stress-tested long English and Korean content at 320px, 768px, and 1440px widths.
- Preserved all ten clickable country borders and the unobstructed map.

# v7.3.0 — Map overlay correction

- Removed the persistent bottom Home Market card that obscured southern countries.
- Replaced it with a compact upper-left instruction chip.
- Preserved clickable country borders and country intelligence modal behavior.
- Added a regression test preventing the obsolete summary overlay from returning.

# v7.2 — UI Fit and Interactive Country Map

- Preserved the locked v7 CSS files and icon component unchanged.
- Added a scoped final polish stylesheet for clipping, wrapping, and responsive containment corrections.
- Corrected dashboard action copy, sidebar game-session copy, contract tabs, and contract-list readability.
- Added ten country-border SVG regions aligned to the existing 1672 × 941 world map.
- Added hover, focus, home-country, mouse, and keyboard interaction states.
- Connected country-region selection to the existing country-intelligence modal.
- Browser-audited all fifteen routes at desktop, tablet, and mobile widths with zero detected clipping or horizontal overflow.

# v7.1 — Session Adapter

- Preserved all v7 CSS files byte-for-byte.
- Removed terminal ownership of authentication.
- Added host session handoff through provider, method, or event.
- Added one generic API-call adapter boundary for later backend synchronization.
- Sign out now delegates to the host application.

# Changelog

## v7.0.0 — Stabilization and interaction hardening

- Added route-level render protection for malformed or incomplete read models.
- Added dedicated empty states across News, Market, Portfolio, Store, Inventory, Banking, Business, Marketplace, Messages, Loans, and Crafting.
- Added form-level error summaries and disabled native automatic submission validation so all errors use the terminal UI.
- Added validation for account selection, available balances, market-order totals, owned shares, listing stock, inventory quantities, loan payments, message content, and repayment-source content.
- Added live market-order values and fees plus live marketplace purchase totals.
- Added modal, notification drawer, and mobile More-sheet focus management, focus trapping, Escape handling, outside-click behavior, background inertness, and opener restoration.
- Added route title updates and main-content focus after navigation.
- Persisted desktop sidebar state with storage-safe fallback behavior.
- Added online/offline status notices and safe clipboard feedback.
- Increased critical interaction targets and improved compact-screen boundary containment.
- Converted mobile holdings to readable cards and mobile message threads to a vertical list.
- Corrected compact banking card height, notification drawer bounds, and safe space beneath fixed mobile navigation.
- Browser-audited all fifteen routes at desktop and mobile widths and executed twenty-three interaction checks.

## v6.0.0 — UX flow redesign

- Reorganized fifteen routes into seven primary navigation groups.
- Added active-section submenus on desktop.
- Added compact context navigation for Finance, Work, Trade, and Profile.
- Added a five-item mobile bottom navigation and More bottom sheet.
- Replaced the large top bar with a compact breadcrumb, balance, status, clock, alerts, and profile bar.
- Rebuilt Dashboard as a task-oriented command center.
- Added ordered next actions, simplified country map, world signals, and financial snapshot.
- Added progressive disclosure to business hiring, player transfers, marketplace listings, loan applications, and repayments.
- Added skip navigation, high-contrast focus indicators, larger target sizes, and reduced-motion handling.

## v5.0.0 — Controlled system expansion

- Added Business, Marketplace, Messages, Loans, Crafting, and Progression MVP modules.
