# Messaging and Communication Workstream

**Roadmap section:** 26 — Messaging and communication  
**Roadmap items:** `EXP-MSG-001` through `EXP-MSG-007`  
**Authority branch:** `agent/messaging-communication-v1`  
**Pull request:** #248  
**Status:** `MERGE_AUTHORIZED`  
**Started:** 2026-07-20  
**Final convergence:** 2026-07-23

## Authority and dependency state

PR #248 remains the sole Messaging authority. Marketplace PR #249 merged at `fcef04f9327efc24955ff17406aaa2d368da2e55`.

Messaging completed the authorized reconciliation with `main` at `f41af4be9853cbcc0bdb9f6d36639e1f0e399dba`. The final candidate is zero commits behind that base and preserves the repository's security, audit, Admin bootstrap, DOM-safety, CORS, World, Business, Crafting, Marketplace, Store, Inventory, Story, Notifications, login, proxy, lifecycle, observability, recovery, and release behavior.

Production remains unchanged.

## Final migration authority

The controller-assigned Messaging migration family is final:

1. `20260721150000_add_messaging_communication_v2.sql`
2. `20260721151000_harden_messaging_retention_and_audit_v2.sql`
3. `20260721152000_complete_messaging_lifecycle_v1.sql`
4. `20260721153000_compat_messaging_player_status_v1.sql`

Player read, search, privacy, cursor, and compatibility hardening are folded into slot four. No fifth Messaging migration exists. No Messaging migration has been applied to production.

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

## Connected isolated-staging acceptance

Connected acceptance was executed only against the isolated non-production staging project. Production was not contacted or modified.

The staging run established:

- the exact four-entry Messaging migration ledger and required schema objects;
- exact candidate `classroom-api` and `admin-api` publication with JWT verification retained;
- expired-session, paused-game, and ended-game HTTP denial without identifier or token leakage;
- transaction-scoped synthetic Player fixtures and temporary game activation;
- Player thread creation, exact idempotent replay, and conflicting replay denial;
- recipient unread visibility, private inbox search, sends, send replay, and read receipt transition;
- same-game participant addition and removal;
- immutable moderation action evidence;
- disabled and closed thread denial;
- Admin broadcast creation using active Player scope;
- rollback of all synthetic acceptance data;
- independent zero-residue verification;
- `productionTouched: false`.

The connected run exposed and slot four permanently corrects:

- transaction-stable initial message timestamps that suppressed the recipient's first unread message;
- stale `players.archived_at` references in legacy Player read, Player send, and Admin thread-creation functions;
- ambiguous read-receipt output/table references;
- ambiguous participant-addition conflict targeting.

Regression assertions require the stable active-Player interface, `clock_timestamp()` initial-message semantics, qualified read-receipt updates, and the named participant primary-key conflict target.

## Final exact-head verification

Final source SHA: `b73d463e12c5ae9523cf8b33e510615c607237af`  
Final artifact digest: `5ddad21f4a61de1db4d1c47cf69823da640515acfec13aedddc466ea0de830ee`

All 27 pull-request workflows are green on the final source SHA, including Database Replay, Seed transactional replay, Player desktop/mobile Chromium verification, the complete Admin browser/accessibility matrix, security, release, observability, predecessor regression, and Messaging isolated-staging validation.

Database Replay started a disposable PostgreSQL service, replayed the complete migration ledger from zero twice, and passed database lint.

The branch is 242 commits ahead and zero behind `main`. Zero unresolved review threads remain. Temporary repair carriers are absent from the final diff.

## Completion rule

The exact head is repository-green, connected isolated-staging acceptance passed with zero residue, review threads are clear, and merge is explicitly authorized. The merge SHA and four final migration identities must be handed to Progression PR #261 after PR #248 merges.
