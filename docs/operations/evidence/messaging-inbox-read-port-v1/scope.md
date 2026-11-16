# Messaging inbox/search read-port successor

Supplemental `PERSISTENCE-MESSAGING-INBOX-001`, under `ARCH-401`.
Local base: preserved, unmerged policy-read candidate
`733297a7615f7c55b9989594db6cf11ba7f6ffab` on main
`39685d2c29394caa425d928649804a433806e521`.
Status: `IMPLEMENTED_NOT_MERGED`, local only. This is not current-main or hosted
qualification. No push, merge, deployment, database mutation or production action.

## Scope and ownership

The owner directed continued local development while publication is blocked.
This is a separate bounded successor; prior policy-read and census branches and
commits remain intact. The coordinator retains global roadmap intake and #668
ownership. Do not rewrite earlier REF-035 scope or completion records, merge
source autonomously, or combine this with #985 controls or the census repair.
No open Messaging PR or matching branch was returned by the connector search;
remote Git fetching cannot authenticate in this executor. Repeat current-main
and active-owner reconciliation before publication.

Move only the `read_player_messages_v2` inbox/search call from the HTTP adapter
into a neutral Messaging application read port and Supabase adapter. The exact
server-resolved `PlayerRequestScope` and parsed read query cross that seam without
cloning, scalarizing or normalization; only the persistence adapter projects the
seven existing RPC arguments. Preserve the RPC receiver and original thenable,
data/error identity, call count and error precedence.

The `RawInbox` interface moves verbatim into a neutral Messaging contract;
`playerMessagingResponseProjection.ts` retains its existing type export. Every
other byte in that projection module is retained, including every executable
normalizer, privacy/error mapper and header rule. No domain application or
infrastructure module imports API-owned projection types.

## Preserved behavior

- Method, malformed-route and forbidden-runner-secret checks retain precedence.
- Environment/client/session work remains before the existing read parser;
  parser rejection still occurs before the RPC.
- Defaults, numeric coercion, pagination bounds, safe search trimming, repeated
  parameter rejection and UTC cursor normalization remain in the existing parser.
- Session/game/player ownership is server-derived, with wrong scope, expiry and
  revocation denial before persistence. No caller selects a database UUID.
- One inbox/search request issues the same read RPC once, with unchanged limits,
  query-null behavior and nullable cursor fields. No retry or additional read.
- Exact-thread reads remain in their existing path, with the same scoped values.
- The entire send/read-receipt/method suffix is byte-identical to the base.
  No send, receipt, thread-creation, retention, moderation or economic write changes.
- The existing `read_player_messages_v2` SQL/grants are unchanged
  (`20260721153000_compat_messaging_player_status_v1.sql:525–779`). No migration,
  new route/RPC, credential, permission, feature, UI or dependency change.

## Characterization and local verification

Forty HTTP characterizations pass both the exact untouched local base and the
candidate. They assert exact arguments and order, private projection/headers,
list/search limits and cursors, current numeric coercion, parser rejection after
session resolution, malformed results, safe RPC errors, thrown errors with one
attempt, denial before persistence and unchanged exact-thread reads.
Three additional application/adapter tests assert scope/query/thenable identity,
RPC receiver and response/error identity. Existing HTTP tests remain unchanged
apart from importing the new registered suites, avoiding package/workflow edits.
The independent reviewer found no actionable correctness issue and independently
passed the focused 49-case suite; its nonblocking duplicate-title observation was
resolved without changing any assertion or behavior.

Observed local checks include Messaging 121/121, scope/privacy 85/85, security and
both-root dispatch 67/67, Player messaging-connected, core TypeScript, focused
Deno checks, architecture and new-source format/lint. Final root qualification,
source identity, smoke outcome and backup verification are recorded in the local
handoff/recovery manifest. Full Edge checks encounter the unchanged frozen
Supabase SDK connection refusal from `admin-api/common.ts`; this is not a pass or
permission to change the lock, dependencies, permissions or runtime. Any incomplete
aggregate or connected stage remains required before integration/merge.

No live browser, database, staging or production proof is claimed. The Player
connected command is a source/fixture-based test, not a deployed-runtime probe.

## Inventory, backups and sequencing

Existing five-root sources change from 1,631 to 1,636: one neutral type contract,
one application port, one infrastructure adapter and two test files. All measured
debt counts and thresholds are unchanged; no oversized source is introduced.
The separately corrected detector still reports 88 candidate files because this
HTTP module retains other typed RPCs. This is explicit read ownership, not a
claim that the file metric proves elimination of violations.

The prior policy/main complete-history Git bundle and incremental census bundle
are verified locally. This successor receives its own incremental bundle, with
restoration tested against the complete-history bundle. Backups are local, not
an assertion that blocked external publication has succeeded.

Hold for coordinator-owned current-main integration, census/#985 reconciliation,
independent final-head review and every applicable exact-head gate. Regenerate
inventory rather than choosing one stale generated copy. Do not raise or disable
controls to hide a failure. A subsequent exact-thread or command persistence
extraction requires its own bounded scope and characterization.

## Current-main reconciliation (2026-11-16)

The earlier local-base and publication-hold entries above are historical.
Integrated both preserved read-port commits onto fetched current main
`e71a92a2df85bc359a480570b20882603c9df1b9`. Runtime and test files apply unchanged;
only generated inventory was recomputed. No open Messaging PR or remote branch
was returned by current connector searches. The isolated branch is
`refactor/messaging-scoped-read-ports-20261116`.

Fresh pinned-Node/Deno verification passes Messaging 121/121 and request-scope/
privacy 85/85; core TypeScript passes. Independent source review independently
passed all 121 Messaging tests and found no actionable source defect. Existing
root dependencies were reused only after identical lockfiles were verified.
Full Edge qualification still encounters the frozen SDK connection refusal;
that limitation is not waived. Exact-head hosted checks and PR-specific
scope registration remain pending. No merge, deployment or live acceptance is
claimed. #668 context work and the corrected persistence scanner are independent
and must be reconciled before serial integration.

Final local qualification: complete root suite, architecture/inventory/size/write-policy
ratchets, secret scan and Player Messaging fixture lifecycle passed. Full backend
smoke stops at the same frozen Supabase SDK download in the game-sessions stage;
full Edge fails at that dependency too. These remain blocked, not passed.
Plain Git publication failed for absent credentials; the authenticated connector
publication was denied by the safety reviewer because the approval did not name
`kohnerbouchard-star/Student-Profile` explicitly. No branch or PR was created;
publication awaits exact-destination approval, without bypass or alternate upload.
