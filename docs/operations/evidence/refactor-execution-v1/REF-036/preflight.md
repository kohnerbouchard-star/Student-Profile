# REF-036 Progression reward authority verification

Status: IN_PROGRESS. Exact base main `1bf9fc16e6d1ef1f2b962e2add58d1ea20d78623`.
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
