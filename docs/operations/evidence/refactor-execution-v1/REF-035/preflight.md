# REF-035 Messaging create-thread application boundary

Status: IN_PROGRESS. Exact base main `709c33778c28f7731048242e2e8393b04afd773b`.
REF-006/016 are VERIFIED_COMPLETE. Open REF-030 PR792 owns separate Contracts
qualification; no current PR owns this Messaging seam. REF-015/025/032 remain
blocked, REF-019/020 paused, and their dependent gates are preserved.

## Locked scope and existing authority

Extract only the POST create-thread branch from
`backend/src/domains/messaging/api/playerMessageThreadLifecycleHttpHandler.ts`
into proposed `messaging/application/createPlayerMessageThread.ts` and
`messaging/infrastructure/supabasePlayerMessageThreadRepository.ts`.
Extend the existing lifecycle handler test; retain its owning suite registration.
Additional paths: this evidence, REF-035 task, only REF-035 backlog entry, exact-PR
Player authority manifest, and generated architecture inventory. Eight meaningful
files plus inventory; ten-file ceiling and 400-semantic-line review threshold.

The handler remains owner of route/method/header/query checks, session resolution,
pure command parsing, result normalization and safe HTTP errors. Policy GET
retains its existing direct read path. The application accepts the already
server-derived scope and parsed command; its repository invokes exactly one
`create_player_message_thread_atomic_v1` RPC with the unchanged six arguments.
No extra thread/message write, NPC reply, notification, moderation, retention,
policy, SQL, UI, package script, workflow, credential or deployment change.

The atomic RPC remains the authority for recipient/game validation, idempotent
thread plus initial-message creation and receipt. Applied/replayed responses
remain 201/200, private/no-store. Existing error ordering, raw UUID rejection,
body/header key agreement and public identifier projection are preserved.

## Characterization and qualification

Baseline owning Messaging suite passes 34 tests at the exact base. Add bounded
HTTP-through-repository assertions for the single call and all six arguments,
replay, rejection/no-call ordering and unchanged error/status projection before
extraction; run them unchanged afterward. This R2 extraction does not replace
SQL or claim new database/race certification. Existing RPC migration contracts
and required Messaging workflow remain part of qualification; protected
connected staging is manual and is not represented as a local test.

Required checks: backend Messaging, Player security/request scope, Player
messaging-connected, full backend typecheck/smoke, shared architecture/privacy
and repository gates. Root/backend/Player lockfiles and existing test registration
are unchanged. Both credential-release workflows naming this handler are
manual-only; no dispatch or release workflow edit is included. Exact-head CI and
merged-main verification are required before completion.

Characterization passes 37 Messaging tests before and after extraction (baseline
34): exact six-argument single-call behavior, applied/replayed responses, eight
error mappings and six no-call denial paths. Existing parser/policy tests remain
unchanged. Player security 59, request scope 81, Player Messaging lifecycle,
backend TypeScript, shared architecture/boundary/legacy guards, root tests and
secret scan pass. Handler create RPC sites move 1→0; repository 0→1. Policy GET
remains direct. Inventory source/test count rises 1261→1263 (Messaging 16→18),
with all debt counts/ceilings unchanged. No registration/package change.

Draft [PR794](https://github.com/kohnerbouchard-star/Student-Profile/pull/794)
binds nine changed paths (eight meaningful plus inventory) through
`docs/operations/contracts/player-cross-cutting/pr-794.json`. Two unchanged
authority verifier/test paths are locked. Final exact-head CI remains required.
Local full Edge typecheck is BLOCKED by the pinned esm.sh Supabase dependency
connection refusal; aggregate smoke is not rerun against the same unavailable
import. Required exact-head CI must provide full typecheck/smoke; focused passing
results above do not substitute for those gates.
