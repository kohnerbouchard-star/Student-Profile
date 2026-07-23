# Messaging and Communication Workstream

**Roadmap section:** 26 — Messaging and communication  
**Roadmap items:** `EXP-MSG-001` through `EXP-MSG-007`  
**Authority branch:** `agent/messaging-communication-v1`  
**Pull request:** #248  
**Status:** `FINAL_EXACT_HEAD_VERIFICATION`  
**Started:** 2026-07-20  
**Final convergence:** 2026-07-23

## Authority and dependency state

PR #248 remains the sole Messaging authority. Marketplace PR #249 merged at `fcef04f9327efc24955ff17406aaa2d368da2e55`.

Messaging has completed the explicitly authorized exceptional reconciliation with current `main` at `f41af4be9853cbcc0bdb9f6d36639e1f0e399dba`. The branch is zero commits behind that base. The reconciliation preserves the audit, Admin bootstrap, DOM-safety, CORS, security, World, Business, Crafting, Marketplace, Store, Inventory, Story, Notifications, login, proxy, lifecycle, observability, recovery, and release behavior already present on `main`.

Production remains unchanged and unauthorized.

## Final migration authority

The controller-assigned Messaging migration family is final:

1. `20260721150000_add_messaging_communication_v2.sql`
2. `20260721151000_harden_messaging_retention_and_audit_v2.sql`
3. `20260721152000_complete_messaging_lifecycle_v1.sql`
4. `20260721153000_compat_messaging_player_status_v1.sql`

Player read, search, privacy, cursor, and compatibility hardening are folded into slot four. No fifth Messaging migration is permitted. No Messaging migration has been applied to production.

## Permanent implementation

Messaging owns and implements:

- teacher announcements, system messages, Player-to-Player threads, and Contract-linked threads;
- participant-only inbox, search, thread reads, sends, unread counts, and read receipts;
- same-game participant addition and removal using public Player identifiers;
- thread creation, participant changes, sends, moderation, and retention deletion with exact idempotency and replay-conflict handling;
- closing, disabling, hiding, reversible moderation, retention, deletion policy, and immutable moderation audit;
- metadata-only Notifications publication containing public message and thread references without message bodies;
- public/private search filtering and UUID-private Player and Admin payloads;
- direct Classroom API and Admin API registration;
- per-action, per-player, per-staff, per-game, per-thread, and per-IP abuse controls;
- harassment, flooding, repeated unsafe query, participant-enumeration, announcement-spam, and replay resistance;
- wrong-game, hidden-participant, removed-participant, paused-game, ended-game, expired-session, and expired-retention denial;
- Player desktop/mobile and Admin moderation surfaces.

Attachments remain disabled and fail closed. This workstream adds no attachment storage, upload, scanning, delivery, or retention capability.

## Privacy and authorization contract

The implementation requires:

- participant membership for Player thread access;
- active same-game Player scope for participant changes;
- owner-scoped staff authorization for policy, moderation, participant, retention, and audit operations;
- explicit Contract linkage validation;
- announcement visibility through explicit delivery membership;
- generic non-enumerating failures for wrong-game, hidden, removed, and unavailable participants;
- public identifiers at browser boundaries and no durable ownership UUID exposure;
- immutable message content and immutable moderation evidence.

## Connected isolated-staging acceptance

Connected acceptance was executed only against the isolated non-production staging project. Production was not contacted or modified.

The staging run established:

- the exact four-entry Messaging migration ledger and required schema objects;
- exact candidate `classroom-api` and `admin-api` publication with JWT verification retained;
- expired-session, paused-game, and ended-game HTTP denial without identifier or token leakage;
- transaction-scoped synthetic Player fixtures and temporary game activation;
- Player thread creation and exact idempotent replay;
- conflicting replay denial;
- recipient unread visibility and private inbox search;
- Player sends and send replay;
- read receipt transition;
- same-game participant addition and removal;
- immutable moderation action evidence;
- disabled and closed thread denial;
- Admin broadcast creation using active Player scope;
- rollback of all synthetic acceptance data;
- independent zero-residue verification;
- `productionTouched: false`.

The connected run exposed and the final slot-four migration now permanently corrects:

- transaction-stable initial message timestamps that incorrectly suppressed the recipient's first unread message;
- stale `players.archived_at` references in legacy Player read, Player send, and Admin thread-creation functions;
- ambiguous read-receipt `thread_id` output/table references;
- ambiguous participant-addition conflict targeting.

Regression assertions require the stable active-Player interface, `clock_timestamp()` initial-message semantics, qualified read-receipt updates, and the named participant primary-key conflict target.

## Validation contract

The exact candidate must pass:

- Backend Typecheck and Edge checks;
- Admin API Check, Admin Bundle Contract Audit, Admin Shell Smoke, and Admin lifecycle checks;
- Player Terminal Verify and desktop/mobile browser Messaging lifecycle coverage;
- Repository Quality, Supply Chain Security, Beta Security Contract, and Environment Neutral Browser;
- World, Business, Crafting, Marketplace, exchange-calendar, timezone, Seed, release-artifact, and staging-readiness regression gates;
- database replay from zero twice and database lint;
- Messaging lifecycle, privacy, moderation, retention, replay, rate-limit, accessibility, and abuse simulations;
- protected isolated-staging acceptance with exact source and artifact binding;
- transactional cleanup and independent zero-residue verification;
- zero unresolved review threads.

The pull request remains draft and unmerged until the normal authenticated exact-head workflow matrix completes. Production modification is prohibited.

## Completion rule

Messaging is complete when the final zero-behind exact head is green, protected isolated-staging acceptance has passed with zero residue, review threads are clear, PR #248 is authorized and merged, and the exact merge SHA plus the four final migration identities are handed to Progression PR #261.
