# REF-034 — Story notification write boundary

Status: IN_PROGRESS; source qualification only, no merge/runtime/completion credit.
Base: `f8ce47a3f57a429b75c7205d07018736bb8d70cb`. REF-032/033 are verified; package remains 39/50 complete. Parent accepted this narrow handoff on 2026-10-04. REF-034 permits twelve meaningful files; this tranche uses ten total paths and at most 400 semantic diff lines. Task/backlog updates are reserved for separate closeout.

## Ownership and exact scope

No open REF-034 PR/branch was found at preflight. PR #668 retains global ledger/package ownership; parent authorizes only adding the focused test to `test:player-notifications`, with no other package hunk. REF-046 owns separate Campaign tests/evidence. Root serializes any shared metadata.

1. `backend/src/domains/notifications/public/storyNotifications.ts`: named write-only port and factory.
2. `backend/src/domains/notifications/public/storyNotifications.test.ts`: synthetic query/receipt/error parity and partial-write retry.
3. `backend/src/domains/storylines/contracts/storyNotificationContracts.ts`: narrow service input type only.
4. `backend/src/domains/storylines/contracts/storylineRunnerContracts.ts`: narrow optional publisher type only.
5. `backend/supabase/functions/stock-market-runner/storylineRunnerAfterTick.ts`: real Edge consumer factory import/call.
6. `backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts`: real default HTTP consumer factory import/call.
7. `backend/package.json`: one focused test registration.
8. `docs/operations/evidence/refactor-execution-v1/REF-034/preflight.md`: this scope and qualification record.
9. `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`: generated inventory only, no ceiling changes.
10. PR-bound manifest under `docs/operations/contracts/player-cross-cutting/`: exact number recorded when assigned; verifier/tests unchanged.

## Preserved authority and behavior

The public factory returns the same `SupabaseStoryNotificationRepository` with the same client. Both production constructors now call it; it is not an unused barrel. The two port imports in Story contracts are type-only. Read/acknowledgement APIs remain outside the write contract. The legacy class stays reachable for dashboard reads and existing tests; no retirement is claimed.

Story executes effects, awaits notification insertion and sequential per-player deliveries, then finalizes the event. Notification failure retains the existing lease-failure/retry path. These are separate awaited writes, not one SQL transaction or an outbox. A failure after the first delivery leaves that committed partial state; retry resolves existing rows. No rollback or concurrency guarantee is invented.

Notification uniqueness remains `(game_session_id, source_type, source_id, notification_type)` for non-null source IDs; delivery uniqueness remains `(notification_id, player_id)`. Conflict reads retain game/source/type or game/notification/player predicates. Ordered recipient deduplication, timestamps, payload defaults, private read filtering and existing delivery state remain unchanged. SQL composite game/notification foreign keys and all existing transaction/lease authorities are untouched.

Protected: notification repository/service/runner implementations; read/ack/privacy adapters; SQL/RPCs; routes/auth; Campaign; task/backlog; release workflows and all nine holds; verifier/security settings. No live database, dispatch, capture, deployment or credential action.

## Qualification

Run Notifications, focused Story repository/service/runner and Stock HTTP tests, World runtime, Player notifications-inbox/story-delivery, full backend typecheck/smoke, root tests, architecture/high-priority/legacy audits, secrets and diff checks. Preserve exact-head CI attribution; synthetic fixtures do not prove live delivery or database concurrency.

Initial focused Notifications run exposed two new test expectations using the raw database error code; the unchanged repository normalizes it to `story_notification_repository_query_failed`. Corrected the expectations only; all 35 Notifications tests then passed. Final qualification and debt measures are recorded below before review.
