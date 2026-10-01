# REF-039 Stock tick execution ownership

Status: VERIFIED_COMPLETE. Base main `4e66e14d09ea838f72d3641f6f4812c97417953e`.
REF-038 is VERIFIED_COMPLETE. Discovery is already canonical in the orchestrator;
the selected misplaced owner is runStockMarketRunner and its persistence/realtime
helpers inside stockMarketRunnerHttpHandler.ts. No overlapping release owner was
found in current protected PR files. Preserve all other blocked/paused tasks.

## Named review children and scope

REF-039a qualifies the unchanged runner before extraction: this record, REF-039
task, its backlog entry, scripts/ref-039-stock-runner-acceptance.ts and the existing
.github/workflows/ref-018-attendance-qualification.yml, runtimeCursorStockMarketRepositories.test.ts,
HTTP test registration, exact-PR authority and generated inventory. At most 400 semantic lines.
REF-039b depends on qualified/merged a and moves the cohesive execution family to
backend/src/domains/stocks/application/runStockMarketRunner.ts, rewires the HTTP
owner, extends its owning tests, adds exact-PR authority and regenerates inventory.
The parent stays IN_PROGRESS until both children and merged-main evidence pass.
Parent ceiling is twelve meaningful paths; generated inventory is separately listed.

Protected: both Edge entrypoints, scheduler contract/release workflow, migrations,
SQL definitions, auth, lease/schedule policy, engine formulas and package scripts.
The current path has cursor/tick uniqueness, not an explicit lease object; expired
lease testing is inapplicable and no lease is introduced. Same-key sequential
replay is a 409 duplicate rejection, not a replay receipt. Competing commits may
hit the existing unique-constraint error mapping; preserve and record it honestly.

## Qualification boundary

Exercise actual HTTP, calendar reader, runtime-cursor/base repositories, engine
and apply_stock_market_runner_tick through a disposable psql transport. SQL runs
as service_role; fixture setup and transient failure injection use only guarded
loopback PostgreSQL. Verify duplicate/competing tick identity, persisted prices,
all game-scoped state on rejection/rollback, checkpoint/cursor effects, closed and
paused games, due discovery eligibility and cross-game isolation. Observe actual
lock overlap. Inject failure after asset updates inside the tick insert, then
remove injection and retry. Post-commit realtime/Story failures remain best effort.
No scheduler execution, hosted requests or live cron certification is claimed.

Current baseline calendar suite passes 60 tests. Required final evidence includes
owning runner/cursor tests, market-trigger/auth/economic checks, full backend,
architecture and fresh disposable qualification at each actual implementation
candidate. Local Docker/PostgreSQL are unavailable; CI database evidence is pending.

The unchanged cursor suite exposed two stale fixtures: its fake omitted the
already-shipped Business event consumer and expected no RPC for explicit ticks.
Repair only that fake and assert full implicit cursor→consumer / explicit consumer
call arrays, game and limit 1000. Retain unknown-RPC denial and existing tick/news
assertions. Register the suite through the existing calendar HTTP test module.
Base repository tests pass 11 and root tests pass. The narrow fixture repair adds
no runtime behavior; parent union remains eleven meaningful paths plus inventory.

Repaired owning calendar suite passes 63 (including all three cursor cases),
market-trigger passes 5, harness Deno check and root tests pass. REF-041 source
merge is retained in the base; its closeout will be integrated once when ready.

Initial PR805 head e1dde545 ran full backend and all retained DB harnesses, but
run 36871848436/job110401322153 failed before runner acceptance because fixture
readiness lacked canonical campaign metadata (CAMPAIGN_DEFAULT_GAME_NOT_READY).
Correct the fixture, pair paused lifecycle with disabled status, and preserve
chained transport ordering. This failed run earns no REF039 database credit.

Integrate REF041 closeout main b85a337bd74683484aa6395483cecaecd55072c8 once,
preserving its source and completion records; regenerate inventory. Fresh combined
head must qualify, including the initial Sales DB port-bind infrastructure failure.

Combined 8f08b5e run36874516072 reached a real tick/cursor/checkpoint, then exposed
an incorrect empty-ledger fixture assumption. Ready-game FX legitimately seeds
11 buffers (22 ledger rows). Compare complete ledger and transaction snapshots
before/after success, race and retry, retaining exact bootstrap count/kind checks.

The monetary-baseline correction is batched with REF040 blocked-record main
480683bb011289576db8e9ddf05ed75daf8d17f7. Its status and all prior records remain.

## REF039a qualified; REF039b selected execution family

PR805 qualified ce2116341fe267af9b1cf2f7c5e42c7c2227e8ce and merged as
0bc661b2fa2bc13a78d43a55026c5cf38dad47ff with identical tree
30d3e31b69aa03626f495c8dc6f6309535537808. All31 workflows/66 jobs passed,
four expected conditional skips, Vercel success, no review threads. Actual R3
run36876129461/job110415916890/artifact11169402756 passes all REF039 cases and
six retained DB harnesses, full28-root backend/smoke;208 scoped snapshot tables.
Downloaded ZIP SHA256 e3e9c1c4e40414f169ef5a2953d84cb21e0a5de5a44747bd38779ead3e2423b7.
Lint retains142 findings/17 errors unchanged; no clean/live database certification.

REF039b moves the existing tick execution/payload/serialization/realtime family
into one application module. HTTP keeps authorization, parsing, service creation,
calendar and wall-clock read, news action and post-tick Story callback. Shared
realtime types/logger move with unchanged bodies; no new runtime policy or port.
No inbound code imports of the old execution exports exist, so no unused API
compatibility re-export is added. Entrypoints and scheduler contract remain exact.
Editable b paths: new application/runStockMarketRunner.ts, current HTTP handler
and test under Stocks, this record, REF039 task, exact-PR authority; generated
inventory is separate. Parent union stays eleven meaningful files plus inventory.

Four direct execution characterization cases pass before/after the move: loaded
object identity, trimmed seed, load→calculate→apply→publish, bounded return history
and failure stopping/identity at each of load/calculation/apply. Calendar63→67.
Independent temporary before/after execution uses the actual engine across two
games, three seed forms and two tick indices: complete payload/result/publication
captures are byte-equal,29505 bytes, SHA256
fd0786f437a41ad2ea20a6af9477c588ef5c64244c9d61b1612f58acef1dc323.
The original source is temporary comparison input only, never a second committed
implementation. Fresh candidate DB qualification must follow the new application
through the unchanged actual HTTP harness before b can merge.

Mechanical proof:261 original lines move exactly, except three necessary export
modifiers on shared types/logger; conservative credit516 changed lines. The full
execution/realtime block SHA256 remains
1481063d0a68dd44800c3e64466a13f6987f7b4c1c8c774d959d91d54fd78498;
payload block0ed2535b208c2b569ddc199cf73240698d5cd7e8c646753e7567e4869871a75d.
After removing moved blocks/imports/new wiring and the unused final separator,
residual HTTP is byte-exact:
93621e6878eb3dd2527d957b17cd2055e601e084b06be23a41a112a9fe309e44.
Handler inventory869→601 lines; one287-line cohesive application owner added.
Source/test denominator1266→1267; cross-domain import records162→163 because the
existing realtime type dependency is now shared across the two owners. All
ratchet ceilings remain unchanged and pass; no second economic authority exists.

REF039b final base is eed2b365f2314f7b788bd658b419cf05bc42200a, preserving the
REF042 blocked diagnostic record. Local TypeScript, root, scheduler contract5,
architecture/boundary/secrets and calendar67 checks pass. Candidate R3 is pending.

## Qualified REF039b merge and parent closeout

[PR809](https://github.com/kohnerbouchard-star/Student-Profile/pull/809) qualified
head e5622d3309924cd7f72f25050a5c92e3ed0f58a6 and merged with an expected-head
guard as 500c17a45634801ebe988204fbe138d76567920f. Both trees equal
e9c3441c7d1280db813da69b0ac5df662ddaf248. Final b diff: 769 changed lines,
516 conservative mechanical credit, 40 generated inventory, 213 semantic lines;
seven paths / six meaningful. Parent a/b union is eleven meaningful paths, below twelve.

All 31 PR workflows / 66 jobs pass, with four expected conditional skips, Vercel
success and no review threads. Initial Multiplayer/load run 36881398263 returned
one empty 503 in the 40-player read wave; unchanged retry job 110442282816 passed.
No runtime, timeout, test threshold or gate was changed to obtain that result.

Fresh actual-application R3 run 36881398177 / job 110433769611 / artifact 11171044191
passes. Downloaded ZIP SHA256
d0f2b914099e756462373039f178f4cf21248e55e1d4eedd22f7d987cdd84fe5 matches GitHub.
The retained REF039a-named harness executes the new application through HTTP:
208 scoped tables, calendar/discovery/replay, two observed lock waiters and one
commit, existing 500/23505 concurrent loser, in-command rollback/retry and no
additional monetary effects beyond the verified 22-row/11-transaction FX bootstrap.
All retained DB cases, full 28-root backend typecheck/smoke and calendar 67 pass.
Lint remains 142 findings / 17 errors with identical diagnostics, not clean DB proof.

The 162→163 cross-domain import-record increase is disclosed and within the
unchanged accepted ceiling 168; it reflects the shared realtime type dependency,
not an added owner or transactional path. The current runner has no lease object;
no expired-lease execution claim is made. No production or live cron certification.
Fresh merged-main R3 run 36886551279 / job 110451226355 / artifact 11175425562
also passes on 500c17a, including all seven DB qualifications and unchanged lint.
Downloaded ZIP SHA256
02e4210b951694e2ffb3ca88b6f3321bd8b4d79dacf41fb3b804bdb3a7146c56 is verified.
Merged-main verification is terminal: 16 successful workflows and one expected
Edge-inventory skip; 34 successful jobs and seven conditional skips (two Edge
convergence, four explicit-release/live-evidence jobs, dependency review).
Relevant runs: [Backend 36886551018](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36886551018),
[Quality 36886551323](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36886551323),
[Atomic 36886551075](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36886551075),
[Seller Offers 36886551381](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36886551381)
and [R3 36886551279](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36886551279).
Both children are qualified and merged; REF039 is VERIFIED_COMPLETE for this
bounded repository seam. Preserve every other blocked/paused item. Next eligible
independent item is REF045 preflight; REF044 awaits REF043 completion.
