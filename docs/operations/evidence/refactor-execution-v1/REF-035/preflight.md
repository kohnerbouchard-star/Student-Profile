# REF-035 Messaging create-thread application boundary

Status: VERIFIED_COMPLETE. Exact base main `709c33778c28f7731048242e2e8393b04afd773b`.
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

Integration: merge REF-030a qualification main
`16d8e06dc0204da8bfe6ba7105d2502a771befd7` normally into this branch, preserving
its harness/workflow/evidence and only the REF-035 backlog delta. REF-030b has a
separate owner. Regenerated inventory is unchanged by that qualification-only
main change; Messaging remains 18 files. Fresh combined-head CI is mandatory.

## Qualified source and guarded merge

[PR794](https://github.com/kohnerbouchard-star/Student-Profile/pull/794) qualified
combined head `b2bca113e301eb0893dd96ef9783eb4ffab184ce` and merged with an
expected-head-guarded merge as `269adac8b3e4dcd96f45f4a01a1e24cdc75fa392`.
Both trees equal `c3bc43d15cc32d6febf9bfa6ff519eea8a64c5b8`. The final diff is
nine paths, eight meaningful plus inventory, 267 additions and 25 deletions.

All 29 exact-head workflows passed: 62 successful jobs and five expected
conditional skips (staging evidence, live parity, inventory materialization,
artifact promotion and protected transactional Messaging staging execution).
Vercel and the isolated Messaging harness status passed; no unresolved review
threads remained. [Messaging run 36847949222](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36847949222)
passed static harness job `110322506248`; protected execution `110323127068`
was skipped. This does not claim hosted Messaging atomicity certification.

[Backend run 36847948926](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36847948926),
job `110322504111`, passed full typecheck and aggregate smoke, resolving the
local dependency-fetch block. Downloaded [smoke artifact 11154542093](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36847948926/artifacts/11154542093)
verified SHA256 `945957bf14c28a35794bf4de1ded49fad4a7effe34692192202a160bbaaa2342`,
status 0, all three REF-035 cases and Messaging 37.
[Store/FX run 36847949064](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36847949064)
passed source/database/Player-browser/connected jobs
`110323100482/110323100300/110323100279/110323100035`;
[Store sales run 36847949020](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36847949020)
passed, including final database job `110323094059`. These required regression
results do not certify a production deployment or override REF-032's release
blocker. No SQL, route, RPC signature, policy or public contract changed.

## Merged-main verification and completion

Automatic merged-main verification is terminal: 16 workflows, 15 successful
and one expected skipped Edge inventory workflow; 33 successful jobs and seven
expected conditional skips (two Edge convergence, dependency review and four
live-parity/release jobs). No pending or failed jobs.

- [Backend Typecheck 36850138802](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36850138802): passed
- [Repository Quality 36850138852](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36850138852): passed
- [Store Cutover 36850138760](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36850138760): passed
- Store Atomic Settlement `36850138862`, Listing Inventory `36850138714`, Seller Offers `36850138738`, Withdrawal Safety `36850138811`: passed
- Manufacturing `36850138765`, Supply Chain `36850138759`, Production Git Release contracts `36850138808`, timezone `36850138867`, Runtime Wiring `36850138870`, Beta Security `36850138725`, Beta Pilot `36850138807`, CodeQL `36850139850`: passed
- Edge Inventory `36850138788`: expected skipped

REF-035 is VERIFIED_COMPLETE for this bounded R2 application extraction. The
same RPC remains canonical; no second persistence path or remaining create-RPC
site exists in the handler. Only three existing docs close out the task. Other
49 task records, REF-032's separate post-merge release blocker, and paused
REF-019/020 remain unchanged. Next independent serial candidate is REF-036,
subject to its own ownership, scope and R3 prerequisite/evidence preflight;
REF-030b continues under its separate owner.
