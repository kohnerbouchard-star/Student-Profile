# REF-034 — Story notification write boundary

Status: IN_PROGRESS; source qualification only, no merge/runtime/completion credit.
Base: `f8ce47a3f57a429b75c7205d07018736bb8d70cb`. REF-032/033 are verified; package remains 39/50 complete. Parent accepted this narrow handoff on 2026-10-04. REF-034 permits twelve meaningful files; this tranche uses eleven total paths and at most 400 semantic diff lines. Task/backlog updates are reserved for separate closeout.

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
10. `docs/operations/contracts/player-cross-cutting/pr-849.json`: PR-bound authority; verifier/tests unchanged.

11. `docs/operations/evidence/refactor-execution-v1/REF-003/candidates.json`: parent-approved refresh of three supporting package blob hashes only; all review evidence/dispositions retained.

## Preserved authority and behavior

The public factory returns the same `SupabaseStoryNotificationRepository` with the same client. Both production constructors now call it; it is not an unused barrel. The two port imports in Story contracts are type-only. Read/acknowledgement APIs remain outside the write contract. The legacy class stays reachable for dashboard reads and existing tests; no retirement is claimed.

Story executes effects, awaits notification insertion and sequential per-player deliveries, then finalizes the event. Notification failure retains the existing lease-failure/retry path. These are separate awaited writes, not one SQL transaction or an outbox. A failure after the first delivery leaves that committed partial state; retry resolves existing rows. No rollback or concurrency guarantee is invented.

Notification uniqueness remains `(game_session_id, source_type, source_id, notification_type)` for non-null source IDs; delivery uniqueness remains `(notification_id, player_id)`. Conflict reads retain game/source/type or game/notification/player predicates. Ordered recipient deduplication, timestamps, payload defaults, private read filtering and existing delivery state remain unchanged. SQL composite game/notification foreign keys and all existing transaction/lease authorities are untouched.

Protected: notification repository/service/runner implementations; read/ack/privacy adapters; SQL/RPCs; routes/auth; Campaign; task/backlog; release workflows and all nine holds; verifier/security settings. No live database, dispatch, capture, deployment or credential action.

## Qualification

Run Notifications, focused Story repository/service/runner and Stock HTTP tests, World runtime, Player notifications-inbox/story-delivery, full backend typecheck/smoke, root tests, architecture/high-priority/legacy audits, secrets and diff checks. Preserve exact-head CI attribution; synthetic fixtures do not prove live delivery or database concurrency.

Initial focused Notifications run exposed two new test expectations using the raw database error code; the unchanged repository normalizes it to `story_notification_repository_query_failed`. Corrected the expectations only; all 35 Notifications tests then passed. The final registered suite has 34 tests after removing a redundant fixture case; a tuple-spread typing error was also corrected before qualification. Final qualification and debt measures follow below.

Source candidate `6b05aa67b2ca73ec45ea19759f62bd2093f398cc`: Notifications 34; focused Story repository/service/runner and Stock HTTP 69; World 50 + Admin 11; Player inbox/Story flows pass. Frozen-base `f8ce47a3` differential: three first-attempt/failure scenarios each followed by retry, replay and another game, with identical receipts, normalized errors, partial states, complete query traces and final rows. Driver and sanitized logs are retained in PR #849; this is synthetic parity, not database concurrency proof.

Inventory: 29 domains, 28 Edge roots and 100 oversized files unchanged; source/test files 1274→1276. Selected consumer infrastructure imports 2→0, with one same-writer bridge retained in Notifications. Scanner deep-import count 163→168 includes public/type/test imports; infrastructure count remains 9, compatibility markers 209. Existing ceilings unchanged. No runtime import cycle: Story references the port only via erased type imports.

Parent approved the eleventh path after required root tests detected stale supporting package hashes. The three values change from `629a4cb8f18cb6ac3bc14f23bd7520c6d880bf1f` to `8f8fe07cb0e446a121fcbc519cb692447c2e1b68`; all other REF-003 data is identical. Main `0ebc3d7dc3c03ec31f945dd546e3c726fb534bb1` merged normally; inventory regeneration is deterministic. Local TypeScript passes; full Edge typecheck/smoke encountered the existing esm.sh proxy tunnel failure. Exact-head CI logs/artifacts and final root results are retained in PR #849.
