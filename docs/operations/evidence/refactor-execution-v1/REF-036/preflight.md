# REF-036 Progression reward authority verification

Status: VERIFIED_COMPLETE. Exact base main `1bf9fc16e6d1ef1f2b962e2add58d1ea20d78623`.
REF-022 is VERIFIED_COMPLETE. REF-030b owns separate Contract work and does not
edit the shared qualification workflow. Preserve REF-015/025/032 blockers,
paused REF-019/020 and all dependent gates.

## Reconciled scope and source authority

Verification-only disposition under the task's stop rule: current Progression
rewards are skill_points, reputation or badge, never currency. No Progression
import of Economy/Banking or second money/ledger payment exists. The existing
claim_player_progression_reward_atomic_v1 owns the reward lock, grant effect,
claimed marker and command receipt. Do not invent an Economy adapter or payment.

The actual event service calls record_progression_integration_event_v1 once.
Its latest SQL replacement is 20260721162000: source/key identities, profile
lock, timestamp bounds, same-day caps, replay before lifecycle denial and scoped
achievement generation remain canonical. The original claim routine in
20260721160000 is unchanged: same-key replay, conflicting command rejection,
reward-row lock, one effect and audit insert. The 20260721163000 level curve
and all seeded definitions/anti-abuse thresholds are preserved.

Exactly five editable paths: new scripts/ref-036-progression-acceptance.ts,
existing .github/workflows/ref-018-attendance-qualification.yml, this record,
REF-036 task and only its backlog entry. Ten meaningful-file ceiling, fewer than
400 semantic lines. No application, migration, policy, package, credential or
production change. Preserve every existing qualification invocation, especially
REF-030. Trigger only disposable local qualification through the existing job.

## Missing evidence and qualification

Baseline Progression 28, ledger invariants 25, progression simulations and Admin
Progression contracts pass. The simulation's concurrent-claim case is a serial
loop over an in-memory model; the protected isolated-staging harness covers
serial apply/replay and is not fresh disposable concurrency evidence.

Add a loopback-only database harness using actual event service and claim HTTP
handler with only the RPC transport replaced by service_role psql. Exercise
apply/replay/source conflict, out-of-order events, cap/no extra rewards,
insufficient eligibility, wrong game, already claimed, competing claims with two
observed lock waiters, and failure injected inside the actual claim before its
receipt insert. Compare all game-scoped rows on rejected/rolled-back operations,
check exact grant/receipt effects and no economic ledger/bank changes. Temporary
fault injection belongs only to the disposable test database and is removed.
Existing SQL/schema files stay unchanged. Fresh exact-head R3 evidence, backend
checks and unchanged lint diagnostics are required before completion.

Local harness typecheck passes. Docker and psql are unavailable in this executor,
so database acceptance is NOT_RUN locally; CI must supply actual evidence.
The five-path patch is below 400 lines and preserves all existing qualification
steps. No source/risk gate is satisfied by an unexecuted harness alone.

Initial real run `36853193927`, job `110339895391`, reached event apply/replay/
conflict/out-of-order SQL but rejected the harness's first claim before any RPC:
its synthetic POST lacked application/json. Add the required header, preserving
the existing parser and single-call assertion. This failed candidate is not
acceptance; fresh corrected-head execution remains mandatory.

Integration uses REF-030 closeout main
`6288e2e8646771cec66402b64eec631029602091`, preserving its qualified submission
adapter, inventory and completed evidence plus REF-035/032 records. The fixture
header correction is batched into this normal merge; a transport-only diagnostic
confirms one claim RPC is reached, without awarding database acceptance credit.
Fresh combined-head R3 execution is still required.

Combined attempt `816c69adc8d4604a85ebbe50d8c91c657302b5f4` passed real claims,
replay/caps and rollback in run `36856005316`. Artifact review found its snapshot
covered 198 public/economy_private tables; include private too, matching the
retained harnesses' full game-scoped census, then require fresh qualification.

## Qualified source and guarded merge

[PR797](https://github.com/kohnerbouchard-star/Student-Profile/pull/797) qualified
head `74bfd82e84b0e93f5505789dbd6fae22a04f097e` and merged with an expected-head-
guarded merge as `c20c22a5385b2c0940e1a4df53b27b7bfba26812`. Both trees equal
`fe2cb62dcc0f2164246e78dd2662b004e22b92cd`. Final scope is five paths,
319 additions and three deletions, with no application or SQL change.

All eight exact-head workflows and Vercel passed: 11 successful jobs and three
expected conditional release/staging skips; no unresolved review threads.
[Qualification run 36856930431](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36856930431),
job `110351527998`, passed full backend typecheck/smoke, retained REF-018/022/
023/024/030 acceptance, and real REF-036 event/claim acceptance.
Downloaded [artifact 11158804665](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36856930431/artifacts/11158804665)
independently verifies SHA256
`34354ab4f92cd89aa34454e6d43981d63baeb41cb844baf7ff33b3eed40e1156`.
Its exact-source JSON records all 208 game-scoped tables, replay/conflict/scope/
eligibility, out-of-order/cap behavior, in-command rollback with same-key retry,
and two observed lock waiters yielding one reward effect and one receipt.

The exercised grant is the existing First Step skill-point reward; this does
not claim branch-specific execution of badge or reputation reward claims.
No monetary payment is introduced. Replay, rejected claims and injected failure
preserve all captured game-scoped state; successful claims alter only the
profile, reward and command audit. Lint comparison remains 142 findings/17 errors,
with no additions or removals. This is not clean-database or production
certification. The earlier failed/more limited fixture attempts above remain
historical; only this complete exact-head execution supplies final R3 credit.

## Merged-main verification and completion

All eight automatic merged-main workflows passed: ten successful jobs and five
expected conditional skips (four live-parity/release jobs and dependency review).
No pending or failed checks. [Fresh main qualification 36857818905](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36857818905),
job `110354426325`, repeated the same actual 208-table event/claim/rollback/race
acceptance and retained regressions. Downloaded [main artifact 11159821878](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36857818905/artifacts/11159821878)
independently verifies SHA256
`f45bcce40f4e118789c48b15a59ac25189c08d1c335c81f854db5b16d63a63e0`;
its REF-036 JSON binds merged main and passes every recorded check. Lint remains
142/17 with no new diagnostics.

Other passing main runs: Repository Quality `36857818952`, Supply Chain
`36857818614`, Beta Security `36857819129`, Beta Pilot `36857819138`, timezone
`36857818879`, Production Git Release contracts `36857818816`, CodeQL
`36857816848`.

REF-036 is VERIFIED_COMPLETE for this verification-only scope and exercised
skill-point claim path. Current authority required no new Economy adapter;
application debt counts and production routes/RPCs remain unchanged. Exactly
three existing docs close out this task; other 49 records and incident gates
are preserved. REF-037 is independently owned in parallel. The next unowned
serial candidate is REF-038, subject to its own current-source preflight.
