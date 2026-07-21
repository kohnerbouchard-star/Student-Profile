# Messaging and Communication Workstream

**Roadmap section:** 26 — Messaging and communication  
**Roadmap items:** `EXP-MSG-001` through `EXP-MSG-007`  
**Authority branch:** `agent/messaging-communication-v1`  
**Pull request:** #248  
**Status:** `IMPLEMENTED_NOT_MERGED — BLOCKED_ON_MARKETPLACE`  
**Started:** 2026-07-20  
**Reactivated:** 2026-07-21

## Scope

This branch owns the complete repository-integrated Messaging tranche:

- teacher announcements and system messages;
- Player-to-Player and Contract-linked threads;
- participant-scoped inbox, search, thread reads, unread counts, and read receipts;
- safe, idempotent Player thread creation and message sends;
- Admin policy, creation, moderation, hiding, closing, disabling, retention deletion, and immutable audit;
- metadata-only notification delivery with no message body in notification payloads;
- public browser identifiers with no internal UUID exposure;
- explicit Player publication through `classroom-api` and Admin publication through `admin-api`;
- additive capability-manifest, rate-limit, endpoint, resource, loader, and package registrations;
- accepted Player and Admin surfaces with desktop/mobile, keyboard, overflow, and accessibility verification.

Attachments remain disabled. The branch does not introduce attachment storage, upload, malware scanning, content-type handling, or attachment deletion.

## Purified branch boundary

The current pull-request diff contains Messaging implementation and narrowly necessary shared publication points only. It does not carry inherited backup, restore, observability, release, pilot, incident, environment-neutrality, or production-deployment implementations.

The only workflow changes are:

- Messaging migration paths in database-replay diagnostics;
- a Messaging-specific, fail-closed isolated-staging harness;
- narrow Player verification scope registration for Messaging-owned files.

Notifications remain Notifications-only. Messaging is dispatched explicitly through `classroom-api`; it does not route through the Notifications domain or a URL-derived fallback. The accepted global Player route registry remains authoritative and composes Messaging additively.

## Implemented evidence

Repository verification covers:

- teacher, system, Player, and Contract thread types;
- game and participant authorization;
- public-ID-only browser payloads and cross-game denial;
- applied and replayed thread creation, sends, moderation, and retention commands;
- unread-count consistency and participant-scoped read receipts;
- closed, disabled, expired, and replies-disabled thread behavior;
- Player-session expiry, paused-game, ended-game, and race-to-inactive write denial;
- unsafe ownership fields, UUID recipients, attachments, unsafe URI schemes, excessive lines, excessive links, and participant overflow;
- per-player, per-game, per-thread, per-staff, per-action, and per-IP rate-limit policies;
- immutable message content and immutable moderation audit;
- metadata-only notifications;
- desktop and mobile Chromium behavior, keyboard focus, inert hostile markup, and horizontal-overflow limits;
- migration replay from zero twice and database lint.

Applicable exact-head workflows include Backend Typecheck and smoke, Player Terminal Verify, Admin API Check, Admin Shell Smoke, Admin Game Lifecycle Controls, Beta Security Contract, Repository Quality, Supply Chain Security, Database Replay, Exchange Calendar Runtime, Required Game Market Timezone, Seed preservation, release artifact checks, and the credential-free Messaging staging-plan validation.

No Messaging migration has been applied to production. No production function or frontend has been deployed or activated by this branch.

## Current dependency gate

Marketplace PR #249 is still unmerged. Until Marketplace merges:

- PR #248 remains draft;
- Messaging migrations retain temporary identities and must not be finalized;
- no merge is permitted;
- the protected connected-staging job cannot execute from the pull request;
- final shared-file convergence against Marketplace is deferred.

## Post-Marketplace integration

After Marketplace merges, this same branch and pull request must:

1. record the exact Marketplace merge SHA;
2. synchronize with final `main` without dropping Marketplace, Crafting, Business, World, Story, Notifications, login, or security behavior;
3. obtain one controller-assigned migration range later than Marketplace and earlier than Progression;
4. rekey the four unmerged Messaging migrations once;
5. reconcile shared publication points additively;
6. replay migrations from zero twice and lint;
7. run the complete exact-head repository, browser, security, privacy, retention, moderation, replay, rate-limit, and accessibility matrix;
8. run protected isolated-staging acceptance with synthetic Player and staff identities;
9. clear review threads, move the pull request out of draft, merge through the controller, and publish the final public contract and rollback handoff.

## Collision boundary

This branch does not own Seed definitions, World, Business and Banking, Crafting, Marketplace, Progression, Story delivery internals, generic Notifications, production deployment, connected release approval, or authoritative roadmap control.

## Completion rule

Messaging becomes complete only after Marketplace has merged, the migrations have been rekeyed into the assigned post-Marketplace range, protected isolated-staging acceptance has passed, PR #248 has merged, and the exact merge SHA, migration identities, public contracts, rollback notes, and Progression handoff have been delivered to Chat 1 and Chat 2.
