# REF-034 — Story notification write boundary

Status: VERIFIED_COMPLETE — scoped merged-source qualification; documentation closeout proposal.
The candidate statements below are retained history; the closeout section records current evidence.
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

2026-10-05 integration: parent authorized merging current main `d7669d39f60cbfbf80b79ce05856e315cf60d9aa` into the existing PR #849 branch. The only conflict was the generated inventory, resolved by its unchanged generator. No REF-034 runtime, package or supporting-hash conflict; protected source remains unchanged. Open #863 overlaps only inventory, #862 has no overlap, #861 shares other REF-003 evidence and #668 retains the package handoff; parent serializes shared metadata and main merges. No new editable path or ceiling change.

Prior head `b5f89b30914776c3bd93476cc2fad283fbc1e507` had actual full backend/database/Business evidence retained in PR #849, but hosted PR promotion-contract run `37201019049` cancelled before jobs due to global concurrency; supported retry returned 403. Its acceptance remains missing, not replaced by local tests. This merge resolves a real main conflict, not an empty CI-trigger commit. The new head requires fresh hosted qualification, including Promotion contract tests with authorize-promotion skipped; no workflow_dispatch, release or deployment is authorized.

## Scoped source closeout — 2026-10-05

Implementation [#849](https://github.com/kohnerbouchard-star/Student-Profile/pull/849)
head `ed50321de47c5088932fb0b08b122ceb0db4ee71`, independently approved by the parent,
merged as `f984f73fa7f1307fbe3fd5019836876a24f82ca4` after explicit owner authorization.
Pre-merge main was `d7669d39f60cbfbf80b79ce05856e315cf60d9aa`.
Head, CI merge `b6bd007392bb595dbba87c2a2f67995cb356153b` and actual merged main
share complete tree `7ed9aaae1240d8ea4ae42380fbb515ec251b3b9d`.
Source scope was eleven paths, +403/-18 raw lines, 392 nonblank changed lines,
including all tests, evidence, generated inventory and authority metadata.
The qualified branch history is preserved by a normal merge, not rewritten.

Closeout scope is exactly this evidence, task REF-034 and its backlog entry.
All other 49 entries, 50 IDs and dependency edges stay unchanged; no global beta,
ARCH, runtime or release status changes. Main retains 39 completed entries until
the separate documentation proposal passes checks/review and merges.

### Acceptance and preserved behavior

Both real stock consumers use the Notifications public factory/write-only port.
It constructs the same repository/client; effects, notification, ordered recipient
deliveries and Story finalization remain separately awaited. Existing partial-write
failure/retry semantics, lease failures, game-scoped uniqueness/conflict predicates,
read/ack state and timestamps remain unchanged. No transaction/outbox is invented.
The legacy repository remains reachable for reads; this is not retirement evidence.
No SQL, route, auth, privacy adapter, scheduler, economic formula or UI change.

Local pinned Node 22.23.1/npm 10.9.8/Deno 2.9.3 qualification passed root tests,
architecture/high-priority/legacy audits, secret scan, Notifications 34, focused
Story/Stock 69, World 50 + Admin 11 and Player inbox/Story flows. Full local Edge
typecheck/smoke remain blocked by the esm.sh proxy tunnel; actual hosted evidence
below supplies that acceptance without relabeling the local failure.

Frozen-main differential against `d7669d39` passes three first-attempt/notification
failure/second-recipient-failure scenarios, each with retry, replay and another game.
Receipts, normalized errors, full query traces and partial/final rows match exactly;
missing optional poster content and existing read state are retained. Driver and
logs are reproducible from #849; driver SHA256
`9f48abb59c9e4e4ce0fa9895efb13951a34398ea6d79f5ec44505ca1a1f741e2`.
These synthetic fixtures do not prove hosted delivery or database concurrency.

Inventory at integrated main: source/test files 1275→1277, 29 domains, 28 Edge roots,
100 oversized files unchanged. Selected consumer infrastructure imports 2→0; one
same-writer bridge remains under Notifications. Scanner deep imports 163→168 count
public/type/test imports; infrastructure imports 9 and compatibility count 210
remain unchanged. No ceiling is raised and broader debt is not declared removed.

### Qualified implementation evidence

At exact head `ed50321d`, all 45 workflows succeeded; 97 latest checks comprise
87 success and ten expected skips, with Vercel success. All required database,
Business, browser and backend gates executed. Skips retain release/staging/parity,
historical inventory and Supabase Preview boundaries; none replaces a required test.

| Proof | Run / artifact or job | Inspected result |
| --- | --- | --- |
| Backend | 37379093597 / 11372992963, 11373173118 | Stored statuses 0; all 28 Edge roots; 1360 passed / 0 failed across 27 smoke summaries, including three new publisher cases |
| Staff/Story database | 37379094612 / 11373172959 | REF-030 exact source, both definitions/retry/edit-conflict/renderer failure, rejected no-effects, trigger rollback/retry, same/conflicting races with two waiters each; productionTouched false |
| REF-009 rewards | 37379094688 / 11372704312 | Exact source, 198-table parity, identical/conflicting replay, rollback/retry, denied/wrong-association no effects, duplicate Story flag rejection, two concurrent waiters |
| Business FX | 37379094421 / 11373416676, 11373313134 | Source/database/browser/connected pass; 12 browser cases; precision 0/3/18, settlement/replay/withdrawal-order races, two-game isolation; advisors results empty |
| Full Chromium | 37379093615 / 111996031397 | 155 passed / 11 skipped; focused accessibility/responsive 12 passed / 2 skipped |
| Promotion contract | 37379094765 / 111996401456 | 13 passed, secrets passed; authorization job 111996403406 skipped |
| Player load retry | 37379093724 / 112001536664 / 11375356134 | 30 logins + 210 reads and ten additional logins + 280 burst reads all HTTP 200; peak 30/40; readRetries empty |

All listed artifact archives were downloaded, inspected and SHA256-verified:
- Typecheck `11372992963`: `cda67280be096f053abf214e6abddca1692e6d457fd7b45fc900ed70e4cc2ced`.
- Smoke `11373173118`: `9bcbdee0958f163aa3e5bc81eca015d015403472b1a7c65b225a0245c48a59ac`.
- Staff/Story `11373172959`: `cd48c1d810d074e17cb3aa07101d9f2f1035ad2040b4cacef49a83afb4e88e75`.
- REF-009 `11372704312`: `9a635a33857e4fe8e6987262a81e05419f151aff7d77f0648b3245c182b53983`.
- Business connected `11373416676`: `0caf56e0e912214901d90271aa3bf8b46ae7b9a44fab6ee376f24209df4d15db`.
- Business advisors `11373313134`: `57600e0a184e1e512848da2955212f9737ee2a4c5ae99c47106145cd1e2bea93`.
- Successful load retry `11375356134`: `cc6b5b3fb14051d059425cd26b3d8e6cb2b9b043defee143802d3bedb4830536`.

Connected retry evidence also passes notification read/replay and required/optional
Story seen/ack/dismiss/replay/reload, no console/page errors and no UUID leakage.
Real database checks preserve existing authorities; they do not make the separate
notification/delivery writes one transaction. Lint retains 142 findings/17 errors
with no added/removed findings, not clean-database certification.

### Historical failures and protection boundary

First load attempt job `111996029960` failed one 40-player `/players/me` read with
503 after all baseline reads passed. Failure artifact `11373706588`, SHA256
`0abe82e7abe86281c5da60dc3123170332067d4d43fcc49e15a33ab450351d6a`, is retained.
Five CPU soft-limit warnings do not prove the cause. The single authorized retry
above passed unchanged source, budgets and assertions; no further retry occurred.
Earlier-head promotion run `37201019049` cancelled before jobs due to shared
concurrency; retry returned 403. It remains failed qualification history, not a
pass. Fresh exact-head promotion acceptance above resolves that missing gate.
Earlier Business port-54322 startup failure and inherited optional Story failures
remain disclosed in #849 and REF-033 evidence; no assertion or gate was weakened.

All workflows/vercel.json match pre-merge main. Vercel Git main deployment remains
disabled; Edge convergence and production publication require explicit authorized
dispatch. Web Session release push requires its untouched release-request JSON.
All nine Phase15 holds remain false. Actual merged-main Production Git Release
`37383154853` passes the tokenless contract and skips both parity captures,
enforcement and release-branch publication; Edge convergence `37383155038` skips.
No hosted capture, live SQL, deployment, credential or security-setting action.

### Fresh merged-main and documentation qualification

At exact merged main `f984f73f`, Story Replay Safety `37383154926` / `112009888406`
passes 67 cases. Backend `37383154818` / `112009887606` passes full typecheck and
smoke. Downloaded typecheck artifact `11375063294` stores exit 0, all 28 Edge roots,
SHA256 `192d1a00522321ba6deea685ba41bcb367c37fcbb1b5f5c7702630129bc62f1a`.
Smoke artifact `11376032737` stores exit 0, 1360 passed / 0 failed in 27 summaries,
SHA256 `b0ea781a5b694d2e87bde2af26a372ce900c33fbccef4e651ecb1a5e720778f4`.
These are fresh-main results, separate from identical-tree PR qualification.
Remaining automatic main checks, documentation checks and independent review must
be terminal/accepted before ledger acceptance; final outcomes are retained in the
closeout PR. No application suite is repeated solely for these three documents.
Docs-only local validation passes root `npm test`, secret scan, JSON and relative
links, stable 50 IDs/dependencies, unchanged other 49 entries/global metadata,
three-path scope and `git diff --check`. Parent review remains outstanding.
Next original scope is REF-046, subject to its existing owner and separate scope
review. No successor source work is included. Rollback reverts only these three
closeout paths; source rollback separately reverts #849 wiring without deleting
delivered rows/read state or undoing later security fixes.
