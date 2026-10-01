# REF-039 Stock tick execution ownership

Status: IN_PROGRESS. Base main `4e66e14d09ea838f72d3641f6f4812c97417953e`.
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
