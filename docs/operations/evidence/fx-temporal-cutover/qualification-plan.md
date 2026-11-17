# Exact-head qualification plan

Not executed. No live/staging project is a test target. Use a disposable local
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
The next tranche must connect the actual queue RPC to a future fixing boundary,
without rewriting the authorization timestamp, and check the second daily input
omits the consumed shock. Never backdate production authorization to run this.

## Required multi-session races

Build a dedicated loopback-only harness with bounded barrier waits and cleanup.
Do not label serial savepoint tests concurrency evidence. Use independent
connections; preserve all existing timeout guards and reject hosted URLs.

1. Two bootstraps, same fresh fixture, overlapping transaction windows. Assert
   one initialized/one replayed, exactly one bootstrap and11values/10links,
   identical returned canonical pointer, unchanged90source rows.
2. Bootstrap replay vs daily worker. Hold runtime row lock in worker, start
   replay, publish daily fixing then commit. Replay must return latest fixing,
   never restore bootstrap or replace next_due_at with an earlier boundary.
3. Reverse order of race2: bootstrap acquires its locks first; worker waits and
   then operates on the canonical pointer. Check no deadlock, lost lease or
   skipped/duplicated fixing.
4. Lifecycle pause/resume vs bootstrap/replay in both orderings. Paused runtime
   must not become scheduled through a replay accidentally; resumed scheduling
   must respect lifecycle authority and retain the latest fixing pointer.
5. Held Story release vs lifecycle pause/teardown and FX readiness change, with
   the separate retry-containment owner. Assert exact game/attempt fencing and
   preservation of plan, effectiveAt, attempts and idempotency. No fixture may
   bypass lease ownership or mark failed claims completed to finish a race.

If race4 exposes pre-existing bootstrap scheduling behavior, report/fix it as a
bounded prerequisite, not a waived test. Candidate is not rollout-ready until
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
