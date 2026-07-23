# Messaging and Communication Workstream

**Roadmap section:** 26 — Messaging and communication  
**Roadmap items:** `EXP-MSG-001` through `EXP-MSG-007`  
**Authority branch:** `agent/messaging-communication-v1`  
**Pull request:** #248  
**Status:** `PARALLEL_PREPARATION_ACTIVE — BLOCKED_ON_MARKETPLACE`  
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

Attachments remain disabled. The branch does not introduce attachment storage, upload, malware scanning, content-type handling, attachment retention, attachment delivery, or attachment deletion.

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

The parallel preparation checkpoint additionally adds direct Player handler coverage for:

- search filtering over private, normalized Messaging results;
- unread-count recalculation after search filtering;
- unsafe and repeated search-query denial;
- explicit attachment-field denial on Player message sends.

Applicable exact-head workflows include Backend Typecheck and smoke, Player Terminal Verify, Admin API Check, Admin Shell Smoke, Admin Game Lifecycle Controls, Beta Security Contract, Repository Quality, Supply Chain Security, Database Replay, Exchange Calendar Runtime, Required Game Market Timezone, Seed preservation, release artifact checks, and the credential-free Messaging staging-plan validation.

No Messaging migration has been applied to production. No production function or frontend has been deployed or activated by this branch.

## Current dependency gate

Marketplace PR #249 is still unmerged. Until Marketplace merges:

- PR #248 remains draft;
- Messaging migrations retain temporary identities and must not be finalized;
- no final branch synchronization is permitted;
- no merge is permitted;
- the protected connected-staging job cannot execute from the pull request;
- final shared-file convergence against Marketplace is deferred.

## Prepared migration rekey map

The controller must assign four strictly increasing migration identities later than the final Marketplace migration and earlier than Progression. The authoritative timestamps remain intentionally blank until that assignment.

| Current provisional migration | Prepared final identity |
| --- | --- |
| `20260721150000_add_messaging_communication_v2.sql` | `<MSG_01>_add_messaging_communication_v2.sql` |
| `20260721151000_harden_messaging_retention_and_audit_v2.sql` | `<MSG_02>_harden_messaging_retention_and_audit_v2.sql` |
| `20260721152000_complete_messaging_lifecycle_v1.sql` | `<MSG_03>_complete_messaging_lifecycle_v1.sql` |
| `20260721153000_compat_messaging_player_status_v1.sql` | `<MSG_04>_compat_messaging_player_status_v1.sql` |

The rekey is filename-only unless post-Marketplace replay identifies a real semantic collision. The ordering above must remain unchanged.

After the controller assigns the range, update every exact filename reference in one rekey operation:

- `backend/package.json` Messaging `--allow-read` paths;
- `backend/src/domains/messaging/tests/messagingMigrationContract.test.ts`;
- `backend/src/domains/messaging/tests/messagingRetentionAuditMigrationContract.test.ts`;
- `backend/src/domains/messaging/tests/messagingCompletionMigrationContract.test.ts`;
- `backend/src/domains/messaging/tests/messagingCompatibilityMigrationContract.test.ts`;
- `.github/workflows/database-replay.yml` diagnostic artifact paths;
- `.github/workflows/player-terminal-verify.yml` migration-scope pattern if the assigned range no longer matches the provisional `2026072113` prefix;
- PR and workstream documentation.

The rekey gate requires a repository-wide search proving that all four provisional filenames have zero remaining references.

## Prepared shared-file convergence matrix

Read-only comparison against Marketplace PR #249 identifies these direct shared-file collisions:

- `.github/workflows/player-terminal-verify.yml`;
- `admin/index.html`;
- `backend/package.json`;
- `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts`;
- `backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts`;
- `backend/src/security/playerRateLimitDispatch.ts`;
- `backend/supabase/functions/admin-api/index.ts`;
- `backend/supabase/functions/classroom-api/index.ts`;
- `player-terminal/package.json`;
- `player-terminal/src/api/endpoints.js`;
- `player-terminal/src/api/resource-plan.js`;
- `player-terminal/src/integrations/student-profile-capability-manifest.js`.

These files must be reconstructed from post-Marketplace merged `main`; no whole-file selection from either feature branch is acceptable.

Required additive preservation rules:

1. Preserve every Marketplace endpoint and action, including activation and dispute capabilities, while adding Messaging endpoints and actions.
2. Preserve World, Business, Crafting, Marketplace, Store, Inventory, Story, login, logout, proxy, lifecycle, pre-auth, and central security dispatch.
3. Register Messaging directly in Classroom and Admin API dispatch; do not route through Notifications.
4. Preserve Notifications as a metadata-only separate authority.
5. Compose Marketplace and Messaging rate-limit operations in the existing central dispatcher without weakening per-IP, per-game, per-player, per-thread, per-staff, or per-action dimensions.
6. Keep Marketplace and Messaging Admin loaders independent so neither blocks authenticated shell mounting or scanner focus.
7. Merge Player endpoint, resource-plan, package, capability, and verification registrations by stable key rather than by line position.
8. Bump shared manifest/version identifiers only after the final combined endpoint set is known.

## Post-Marketplace integration

After Marketplace merges, this same branch and pull request must:

1. record the exact Marketplace merge SHA;
2. obtain the controller-assigned four-slot Messaging migration range;
3. rekey the four unmerged Messaging migrations once and update every reference;
4. synchronize once with final `main`;
5. reconstruct all shared publication points additively from merged `main`;
6. preserve Marketplace, Crafting, Business, World, Store, Inventory, Story, Notifications, login, proxy, security, and lifecycle behavior;
7. replay migrations from zero twice and lint;
8. run the complete exact-head repository, Backend, Player, Admin, browser, security, privacy, retention, moderation, replay, rate-limit, and accessibility matrix;
9. run protected isolated-staging acceptance with synthetic Player and staff identities;
10. clear review threads and return the immutable exact head to Chat 1.

PR #248 must remain draft and unmerged until Chat 1 authorizes final integration.

## Collision boundary

This branch does not own Seed definitions, World, Business and Banking, Crafting, Marketplace, Progression, Story delivery internals, generic Notifications, production deployment, connected release approval, or authoritative roadmap control.

## Completion rule

Messaging becomes complete only after Marketplace has merged, the migrations have been rekeyed into the assigned post-Marketplace range, protected isolated-staging acceptance has passed, PR #248 has merged, and the exact merge SHA, migration identities, public contracts, rollback notes, and Progression handoff have been delivered to Chat 1 and Chat 2.
