# Exact-head qualification plan

Prior exact-head run `44018032749` passed both migration replays and serial acceptance, but strict whole-schema lint failed on 12 baseline function errors. The expanded tests below are authored, not yet executed. No live/staging project is a test target. Use a disposable local
Supabase/PostgreSQL17 service with the complete ordered migrations, not a toy
schema or mocks. The existing acceptance runner rejects non-loopback targets.

## Single-transaction acceptance

Run migration replay/lint, `node scripts/validate-supabase-migrations.mjs`, then
`node scripts/canonical-fx-authority-database.mjs`. Added rollback-only cases:

- zero macro input remains zero and blocked;
- nine-country cohort cannot satisfy ten-country readiness;
- request horizon before cohort rejects; future cohort rejects even if caller
  supplies a future horizon;
- earliest of two eligible complete cohorts wins;
- coherence tolerance accepts the unchanged 1e-8 boundary, rejects 2e-8;
- 89 legacy pairs remain blocked;
- original rates, complete cohort links and separate provenance preserved;
- existing historical cohort behavior and policy-baseline timestamps unchanged;
- bootstrap replay does not duplicate or rewind authority;
- Story queued with pre-cutover frozen eligibleAt replays once;
- full existing daily load/apply/replay consumes a pre-bootstrap eligible shock
  once, while an authorization newer than the fixing remains queued.

The full-consumption fixture is direct rollback-only historical authorization
setup, not evidence that a newly queued production shock has already executed.
The dedicated draft-PR-only `--real-clock-story-proof` extension now connects an
actual queue RPC to a real future named-zone 08:00 boundary, waiting at most
65 minutes without rewriting authorization timestamps. It uses actual-clock
claim/apply, validates the exact +75-bps NRC movement and one consumed link,
replays without writes, and checks the next input omits that authorization.
The result uses the existing SQL renderer and canonical database validation;
it is not JavaScript-engine end-to-end evidence. The default historical harness
retains its 150-second timeout. The opt-in client watchdog is 90 minutes and
this dedicated workflow is bounded at 100 minutes; disconnect rolls back the
fixture. No production clock or time guard is changed.

## Required multi-session races

The new `fx-temporal-cutover-concurrency.mjs` harness uses an exact-head, fresh, pinned local Docker database, independent connections, bounded barriers and cleanup. Its implemented subset is not full race completion.
Do not label serial savepoint tests concurrency evidence. Use independent
connections; preserve all existing timeout guards and reject hosted URLs.

1. Implemented for a policy-baseline fixture, not yet executed: two bootstraps, same fresh fixture, overlapping transaction windows. Assert
   one initialized/one replayed, exactly one bootstrap and11values/10links,
   identical returned canonical pointer. The fixture has zero legacy rows; concurrent preservation of 90 legacy source rows remains pending (serial preservation already exists).
2. Pending: bootstrap replay vs daily worker. Hold runtime row lock in worker, start
   replay, publish daily fixing then commit. Replay must return latest fixing,
   never restore bootstrap or replace next_due_at with an earlier boundary.
3. Pending: reverse order of race2: bootstrap acquires its locks first; worker waits and
   then operates on the canonical pointer. Check no deadlock, lost lease or
   skipped/duplicated fixing.
4. Implemented, not yet executed: lifecycle pause/resume vs bootstrap/replay in both orderings, plus initially paused bootstrap. Paused runtime
   must not become scheduled through a replay accidentally; resumed scheduling
   must respect lifecycle authority and retain the latest fixing pointer.
5. Held Story release vs lifecycle pause/teardown and FX readiness change, with
   the separate retry-containment owner. Assert exact game/attempt fencing and
   preservation of plan, effectiveAt, attempts and idempotency. No fixture may
   bypass lease ownership or mark failed claims completed to finish a race.

Static review exposed pre-existing replay rescheduling paused games. This
unmerged candidate now locks the game lifecycle before bootstrap advisory and
runtime locks, matching lifecycle-trigger order, and retains a null due time
in all three paused bootstrap/replay schedule paths. Active scheduling and
latest-fixing pointer selection remain unchanged. This bounded correction
requires the new actual PostgreSQL race proof; it is not a waived test. Candidate is not rollout-ready until
these outcomes have actual PostgreSQL evidence.

## CI/publication

Existing canonical-FX workflow is historical PR671/base-branch restricted.
Do not weaken it or pretend it runs on a new main-target PR. Prepare a separate
exact-head scoped draft-PR workflow/authority with the approved PR number after
publication is authorized; include this migration and acceptance script in its
path triggers. Pin actions/dependencies and use local DB only. Run full required
root/backend checks and independent final-head review. Retain existing release,
U1, migration-parity and production-denial gates.

## Recovery boundary

Passing tests qualifies code only. Recovery still needs an explicit approved
release manifest and exact-game operational guard: expected blocked reason,
no existing fixing, expected matrix timestamp/hash, source rate count/coherence,
expected cohort timestamp/hash, lifecycle and policy. Acquire appropriate locks
and fail if those inputs changed. Never run against all games: the genuine
zero-macro game must remain blocked. Resolve quota and missing migrations as
separate release prerequisites. Observe actual future fixing and Story claims
before declaring the incident recovered.
