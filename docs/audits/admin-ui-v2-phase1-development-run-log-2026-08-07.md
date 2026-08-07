# Admin UI V2 Phase 1 development run log

Date archived: 2026-08-07
Source: product-owner/Codex development transcript retained outside release evidence.

## Purpose

This record preserves the major implementation, audit, release, and scope decisions made during Admin UI V2 Phase 1. It is an audit/history artifact, not production or staging deployment evidence.

## Initial Phase 1 implementation

Phase 1 established a source-owned Admin V2 entry at `/admin/v2.html` with Overview as the only migrated route. The implementation introduced the V2 shell, canonical left navigation, first-class World Management navigation, shared component primitives, layered CSS, explicit route boundaries, safe error envelopes, permission boundaries, route-local data states, keyboard behavior, scrolling contracts, and dialog-focus behavior.

The migration deliberately avoided Backend, database, Supabase, authentication, Player Terminal, and legacy Admin behavior changes.

The initial implementation was developed on:

`refactor/admin-ui-v2-overview-foundation-v1`

The original worktree was:

`/private/tmp/econovaria-admin-ui-v2`

## Inventory correction

The first handoff understated the implementation as only 14 changed files. A complete audit showed that standard `git diff` omitted the untracked V2 source tree.

The intended Phase 1 inventory was 61 paths:

- 41 V2 runtime files;
- 34 JavaScript modules;
- six V2 CSS layers;
- the `/admin/v2.html` entry;
- three test/browser harness files;
- architecture and PR documentation;
- the roadmap update;
- one browser result manifest;
- 12 committed screenshots;
- two previously tracked file modifications.

The reviewed Phase 1 patch contained 16,696 insertions and eight deletions before later release/evidence reconciliation.

## Architecture ownership decisions

The audit separated ownership where responsibilities had become mixed:

- `admin/v2/src/app.js` owns application composition, selected-game lifecycle, routing, shell synchronization, and teardown.
- `OverviewController.js` owns Overview loading, state transitions, normalization, and cancellation.
- `OverviewNotifications.js` owns Overview notification presentation.
- `OverviewRoute.js` owns route-specific Overview rendering while delegating generic tables, errors, stale states, fields, framing, and other primitives to shared components.
- Shared data-table behavior no longer reflects internal row IDs into user-visible data attributes by default.

The V2 dependency closure was audited to avoid document-wide `MutationObserver`s, raw HTML rendering sinks, global `fetch` replacement, prototype mutation, and global DOM API patching.

## Build and browser verification

The configured Vercel build was run with safe non-production values. The generated build contained `dist/admin/v2.html`, all V2 modules, all CSS layers, session-gate CSS, required icons/assets, and the full static resource graph.

Source and built-dist browser suites verified:

- JavaScript/CSS MIME correctness;
- no missing modules or static assets;
- no unexpected console errors;
- no CSP or Trusted Types failures;
- session-boundary behavior;
- keyboard and modal focus;
- required responsive viewport behavior;
- no document horizontal overflow.

Session cases covered direct unauthenticated navigation, missing selected game, expired/revoked sessions, invalid security version, AAL2-required responses, 401, permission-denied 403, 429 retry information, retryable 5xx responses, reload after validation, prevention of pre-validation Admin-data flash, and safe backend-error redaction.

## Deferred selected-game URL issue

The existing legacy Admin contract preserves the selected game in `?game=` and therefore exposes the selected-game UUID in visible URLs. The audit confirmed this behavior pre-existed V2 and was not introduced by the migration.

The product-owner decision was to classify this as documented, non-blocking legacy privacy/hygiene debt because it does not break navigation, selected-game preservation, focus, history, or route functionality, and it is unrelated to the clipping, scrolling, modal, image, glyph, spacing, skeleton, and error-state problems that motivated V2.

UUID-free URL assertions were retained and reported separately rather than deleted or weakened.

## Deferred legacy ratchets

Legacy shell/scroll and accepted-hash failures were compared against clean main and the V2 branch. The relevant failures reproduced identically on the baseline and V2 branch, so they were classified as inherited legacy debt rather than Phase 1 regressions.

The V2 tranche did not alter the failing legacy runtime, selectors, accepted hashes, or tests merely to make CI green.

## Release reconciliation

After the initial audit, the complete Phase 1 implementation was reconciled onto the then-current `origin/main` rather than being committed from a stale base.

The release process preserved the approved scope:

- source-owned Admin V2 shell;
- Overview as the only migrated route;
- first-class World Management navigation;
- explicit legacy/planned boundaries for unmigrated destinations;
- existing selected-game URL behavior;
- no Backend, database, Supabase, authentication, Player Terminal, or legacy Admin behavior changes.

The branch was committed, pushed, opened as draft PR #502, and verified through the Git-connected Vercel preview. No manual production deployment was performed as part of that release step.

## Phase 1 validation summary

The final Phase 1 release reported successful local coverage for:

- Admin V2 unit contracts;
- source browser suite;
- built-dist browser suite;
- authentication boundaries;
- Admin BFF request-authentication boundaries;
- configured Vercel build;
- Vercel deployment contract;
- session-state scenarios;
- keyboard/dialog focus;
- document overflow;
- MIME/resource/CSP/Trusted Types checks;
- JavaScript syntax;
- `git diff --check`;
- changed-file secret scan.

Remaining red checks were documented as base-identical legacy debt, including stale v606 shell/hash and MutationObserver ratchets.

## Product-owner priority

The governing decision from this run was to keep the work focused on repairing and migrating the Admin UI rather than allowing unrelated legacy debt to block the migration.

The planned continuation sequence from Phase 1 was to migrate functional Admin domains incrementally while maintaining source ownership, responsive behavior, safe async states, shared primitives, and parity with the actual Player-side game domains.

## Provenance note

This document is a condensed archival record derived from the original development transcript. The original transcript contained local temporary paths, iterative tool output, repeated prompts, and transient audit details that are not treated as release evidence. Release-specific assertions remain authoritative only where independently represented by committed tests, manifests, screenshots, PR records, or deployment evidence.