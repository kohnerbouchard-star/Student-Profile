# FX temporal cutover correction (local candidate)

Status: IN_PROGRESS. Base main `9df2064d6835b64ab9f7a3bde19ed1da5356cded`.
No PR, merge, hosted write, deployment, bootstrap invocation or release approval.

## Verified diagnosis

Read-only production audit on 2026-11-17 resolved ECON SIM by project metadata.
The live bodies of bootstrap, Story volatility and fixing input functions match
canonical source byte-for-byte (MD5 and lengths respectively):

- bootstrap: `d62421f4c55f8163381f1b33ef64281c`, 21006 bytes;
- Story: `ec76a6fc5fb750c59e0e3e45fa1630cf`, 3769 bytes;
- fixing input: `2c675a5b20935d4b84b608addb618654`, 9886 bytes.

Two active games are blocked for incomplete macro snapshots. One genuinely has
zero macro rows and MUST remain blocked. The affected populated game has 980
rows, ten countries, a coherent 90-rate matrix at July 30 21:31:12.921885 UTC,
and its earliest complete cohort at July 30 22:14:33.032500 UTC. There are no
canonical fixings in either blocked game. All 90 rates match the canonical VAL
vector at existing eight-decimal precision; maximum unrounded difference is
0.0000000048936170. This is not an absence-of-data issue for the populated game.

## Exact candidate effects

Definition-only forward migration adds nullable legacy source-time provenance
on immutable fixings and replaces bootstrap with a bounded fallback. Existing
fixings remain unchanged with unknown (NULL) new provenance. Existing behavior
is retained when a complete cohort already exists at/before the matrix time.
Otherwise select the earliest actual complete cohort after the matrix and no
later than the requested cutover horizon or calculation time. The unchanged
legacy vector is carried forward to that cohort's timestamp. No rate, macro
snapshot, balance, inventory, Story plan or existing fixing is rewritten.

Bootstrap records the original matrix timestamp separately from effective_at
and includes it in the input hash. No additional price movement is introduced.
The existing Story per-game advisory lock serializes concurrent initializations;
fixing workers use the runtime row lock retained by bootstrap.
No caller gains permission: bootstrap remains revoked from service_role and
client roles. No new public RPC or operator bypass is added.

The zero-macro game and a request horizon before the first complete cohort stay
blocked. Policy baseline is not used as the recovery procedure. Existing legacy
coherence, currency and snapshot gates remain. Immutable evidence is preserved.

Story eligible_at stays the frozen event time; actual authorization time stays
its real queue time. A newly queued old event is eligible only for a future fixing
whose effective_at is at/after BOTH timestamps, and consumption remains once-only.
No backdated shock authorization and no historical economic replay are proposed.

## Verification and release limits

Passed: migration uniqueness (463), existing canonical FX workflow contract,
JS syntax and whitespace checks. Existing contract checks do not certify new SQL.
The rollback-only existing DB acceptance script now covers horizon rejection,
carry-forward, explicit provenance, all 90 fixture rates, exact ten real links,
bootstrap replay and frozen Story queue/replay. Execution FAILED TO START:
`spawnSync psql ENOENT`; Docker is also absent. No DB pass is claimed.

Before publication/rollout: independently review SQL, run full local/disposable
Postgres migration replay/lint and acceptance, add simultaneous bootstrap/worker
and lifecycle race proof, execute the added incomplete/incoherent/future-cohort and unchanged
policy-baseline cases, verify delayed shock consumption once-only after the next
boundary, and wire a main-target exact-head test workflow (existing FX workflow
is narrowly bound to historical PR671/base). Full mandated tests remain pending.
The operational recovery requires separately approved exact game, cutoff,
expected matrix/cohort fingerprints and runtime state fencing. Do not call this
bootstrap across all games, force ready, use policy-baseline true, or edit ledgers.
Keep Story dependency holds until reviewed recovery and verified actual readiness.
Production quota recovery and missing-release migrations are separate blockers.

Next: qualify this candidate on disposable PostgreSQL and independently review;
only then propose a guarded exact-game operational recovery, not manual SQL.

## Expanded candidate coverage

Follow-up adds rollback-only negative and precision-boundary cases, earliest-of-two
cohorts, unchanged historical/policy provenance, and extends existing full daily
load/apply/replay to consume a pre-bootstrap eligible shock. These are authored,
not executed. [Exact qualification plan](qualification-plan.md) separates the
remaining actual queue-to-future-fixing proof and genuine multi-session races.
No source migration change or additional deployment authority is introduced.

Independent review corrected the future-cohort fixture to one statement-stable
timestamp and added a ten-country/single-timestamp/future-time precondition.
Without that precondition, a volatile per-row clock could falsely test an
incomplete cohort rather than the future-time safety bound. Static checks
pass after correction; PostgreSQL execution remains unverified.

## Dedicated disposable qualification candidate

A separate main-target draft-PR-only workflow now prepares two complete local
migration replays, the expanded rollback-only acceptance and local schema lint.
It uses pinned actions/tools, read-only GitHub permissions, no deployment or
production credentials, and exact-head/same-repository/eight-path scope checks.
The new authority starts with PR number0, deliberately disabling database work
until the actual independently reviewed draft PR is bound. The historical FX
workflow, U1 hold and declined alias-rehearsal workflow remain untouched.
Workflow YAML and12identity/scope cases pass locally. This is infrastructure for
obtaining evidence, not a substitute for real execution or concurrency proof.

Independent workflow review corrected lint to explicit `--fail-on error`; a
negative contract case now rejects omission. Warnings remain visible and errors
fail the job. Reviewer re-check found no new bypass. Full root tests initially
stopped at five missing-SDK environment failures because this fresh worktree
had no installed root dependencies; clean lockfile installation and rerun are
pending. No full-root or PostgreSQL success is claimed at this point.

Draft PR #1005 published at `115367ec24461491bd741ee7ebce589179007d4c`,
with tree `dc90ab3269c6ce7d09444a3c89222e52473890d8` independently fetched
and byte-identical to the reviewed local tree. Actual PR metadata confirms
main target, same repository, draft state and eight changed paths. Qualification
authority is now bound specifically to PR1005; no dispatch or live scope added.

After clean root lockfile installation using a writable local npm cache, the
full root `npm test` rerun passed on Node22.23.1/npm10.9.8. The five initial
missing-SDK failures were resolved without source/test changes. The PR-binding
contract also passes with actual PR1005. PostgreSQL results are still pending.


## Expanded disposable qualification follow-up

Published baseline `b8b5129b` / run `44018032749` passed serial PostgreSQL
acceptance and both migration replays; 12 baseline whole-schema lint findings
remain blocking and are not suppressed. The new local tranche adds strict
PR1005/exact-head/fresh-Docker bootstrap and lifecycle contention tests, including
initially paused bootstrap and both pause/resume orderings. Static review found
bootstrap replay could repopulate a paused schedule. The unmerged definition-only
migration now locks game lifecycle before advisory/runtime locks and keeps all
three paused schedule paths null, without changing active scheduling, pointer
selection, grants, rate history or temporal provenance.

A dedicated real-clock opt-in additionally queues through the actual Story RPC,
waits for the next real named-zone 08:00 boundary (maximum65 minutes), applies
using actual time, checks exact economic movement and single consumption/replay,
and verifies the next input omits the consumed shock. Actual authorization time,
eligibility and hash are preserved. It uses SQL-rendered results checked by the
canonical database validator, not the JavaScript worker engine. Default historical
runner behavior stays short; only the exact scoped draft workflow gets a100-minute
limit and the opt-in90-minute watchdog. All fixture work rolls back; committed
concurrency fixtures are destroyed with the disposable stack.

Neither new hosted proof has run yet. True daily-worker/bootstrap contention and
legacy90-row concurrent preservation remain pending; do not mark recovery or
completion. Existing lint --fail-on error, two complete replays, production denial
and no-alias-rehearsal boundaries remain unchanged. No live/staging activity.
