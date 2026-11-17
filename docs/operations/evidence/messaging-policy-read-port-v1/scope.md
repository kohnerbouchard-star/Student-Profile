# Messaging policy-read persistence seam

## Scope and ownership

Supplemental `PERSISTENCE-MESSAGING-POLICY-001`, under `ARCH-401`.
Base: immutable main `39685d2c29394caa425d928649804a433806e521`.
Status: local implementation, not merged or runtime-certified. No push, merge,
deployment, production action, migration or database mutation is performed.

The owner separately directed this bounded policy-read extraction after reviewing
the persistence census. Earlier `REF-035` intentionally extracted only thread
creation and left policy GET unchanged. This new item does not rewrite its
historical scope/completion evidence, extend it retrospectively, or authorize
Messaging features. The global roadmap remains owned by PR #668; its retained
entries must be reconciled by the coordinator rather than overwritten here.

A current connector search returned no open Messaging PR or matching branch.
Remote Git fetch could not authenticate in this executor; the supplied immutable
main is the base, not a new remote-main certification. Current-main and active
ownership checks must be repeated before publication/integration.

## Bounded implementation

- New `messaging/application/readPlayerMessagePolicy.ts`: domain-owned read port
  and use case. Forward the exact authenticated `PlayerRequestScope`, without
  copying, scalarizing, enriching, authorizing again or normalizing it.
- Existing `messaging/infrastructure/supabasePlayerMessageThreadRepository.ts`:
  add `readPolicy(scope)`, project `scope.gameId`/`scope.playerUuid` only here, and
  call existing `read_player_message_policy_v1` once. Return the original
  thenable/data/error unchanged. Existing create-thread method body is retained.
- Existing lifecycle HTTP handler: compose the same repository and use case only
  in policy GET. All transport guards, session resolution, policy normalization,
  safe error mapping, private cache headers, response shape and create branch
  remain unchanged.
- Add HTTP characterization and application/adapter invariant suites; import
  them from the existing lifecycle test so the existing backend Messaging/smoke
  registrations execute them. No package or workflow edit is needed.
- Regenerate the existing architecture inventory. No ceiling is changed.

## Security and transaction boundaries

The existing early malformed-route/method/runner-secret/query checks still
precede environment/client/session work. Session/ownership/expiry/revocation
checks still precede the policy RPC. Caller-supplied game/player identity does
not replace session-derived scope. Policy defaults/coercion/bounds and strict
`attachmentsEnabled === false` validation remain at the HTTP projection boundary;
extra database fields cannot leak into the response.

The existing policy RPC is a service-role-only, stable scoped read in
`20260721153000_compat_messaging_player_status_v1.sql:3–35` (execute grants at
418–421). This tranche changes neither its SQL nor caller privileges. Thread
creation still invokes `create_player_message_thread_atomic_v1` once for the
thread, initial message and replay outcome. No client-side insert/update or
separate economic, Inventory, reward or message write is introduced. Existing
root rate-limit guards and both Player/Classroom composition roots are unchanged.

## Characterization and qualification

The exact HTTP characterization suite runs on the untouched immutable baseline
and on the candidate, covering scoped arguments and guard order, private response
and UUID-free projection, valid/default/coerced/bounded policy values, malformed
results, safe database errors, failed transport/session/ownership paths, thrown
RPC errors and no retry. Added application/adapter tests verify exact scope and
thenable identity, null/error preservation, one read and unchanged atomic create
arguments. All retained lifecycle tests remain present.

Qualification results, exact source commit and independent review are reported
in the local handoff. Required checks include backend Messaging, Player scope and
security suites, Player `messaging-connected`, full root tests, core/full Edge
typecheck, backend smoke, deterministic inventory/architecture, privacy/secrets,
new-source format/lint and whitespace. A source/fixture-based connected test is
not a live browser/database proof. Any frozen-SDK or runtime blocker must remain
explicit rather than being waived.

## Census and #985 coordination

This branch does not include the separate typed-census repair or PR #985's
controls. Existing five-root sources rise from 1,628 to 1,631 (one runtime use
case plus two tests). The old incomplete matcher remains at 62; every other debt
count and threshold stays unchanged, including zero oversized sources.

An independent read-only run of the separately reviewed corrected detector gives
89 to 88 candidate files, with the lifecycle handler absent after the move. This
is one relocated read seam, not proof that all other candidates are violations
or that architecture debt is closed. The coordinator must preserve both complete
branches, explicitly reconcile generated inventory after their serial integration,
and rerun exact-head gates. Never raise/disable #985 controls to conceal a failure.

## Remaining gates and next exact step

Hold locally for independent review and coordinator-owned current-main/census/
#985 reconciliation. Obtain exact-head hosted and any required connected runtime
qualification before a merge decision. No production merge is autonomous. The
next persistence extraction must be separately selected and reviewed; this item
does not authorize send/retention/moderation, Auth/Attendance holds, Business
settlement, API routing or feature changes.

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
