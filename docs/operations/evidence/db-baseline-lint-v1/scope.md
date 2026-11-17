# DB-BASELINE-NAME-RESOLUTION-001

Status: IN_PROGRESS. Local-only branch `fix/db-baseline-lint-20261117` on
main `9df2064d6835b64ab9f7a3bde19ed1da5356cded`. No PR, merge, hosted schema,
production, staging, or deployment action. Parent incident: #1005.

## Evidence and diagnosis

Run 44018032749, job 133820570713 passes two full replays and FX PostgreSQL
acceptance, then fails whole-schema lint with twelve error-bearing functions.
All definitions predate the FX change. This is not evidence that FX failed its
acceptance or that the baseline is safe to deploy.

Nine functions have real PL/pgSQL OUT-variable/column collisions:

- `correct_arrival_class_assignment_v1`: revision increment.
- `seed_initial_player_balances`: created_at sort; also account_type and currency_code filters.
- `execute_campaign_event_atomic_v1`: revision and event_sequence increments.
- `control_campaign_instance_atomic_v1`: all four revision increments.
- `upsert_business_recipe_labor_requirement_v2`: conflict inference collides with recipe_definition_id. Use the existing named scope constraint.
- `moderate_admin_message_atomic_v2`: replay message thread_id predicate.
- `run_business_production_labor_v2`: reservation status predicate.
- `accept_business_ownership_transfer_offer_v2`: units and status on replay, units update/returning and active-owner count.
- `grant_business_recipe_access_v2`: recipe_key predicate.

Two functions call unqualified `digest` despite a pinned search_path excluding
its extensions schema: `create_business_workforce_candidate_v2` and
`reserve_business_labor_v2`. Qualify the existing function, do not widen the path.

The twelfth finding is `private.create_purchase_funding_quote_core_v1`:
`pg_temp.purchase_funding_line_stage_v1` is absent in the lint session. The core
creates this temporary table directly before the reported INSERT (original
migration 20260827090000 lines 641–660). The isolation wrapper resets it per call;
20260831102000 applies later patches. Static analysis does not execute CREATE
TEMPORARY TABLE. Classify as a temporary-relation analysis-context limitation,
not proven business failure. Do not suppress the finding, modify the economic
algorithm, or declare whole-schema lint green. A reviewed disposable same-session
fixture plus full checker run and real quote lifecycle acceptance is the next
verification step; no such workflow amendment is included here.

## Bounded correction

CLI-generated migration `20261117050144_baseline_function_name_resolution_v1.sql`
patches the actual current `pg_get_functiondef`, not stale historical definitions.
Each target must be exactly one public function, each old fragment must occur the
expected number of times, and mixed old/new occurrences within any single fragment abort transactionally. Different fragments may independently be already corrected. These are fragment guards, not a full-source identity lock.
Exact already-corrected definitions are accepted on replay. Later monetary
identity patches remain intact. Only name resolution changes. No domain command
is called, no table/data/ACL/search_path/security-mode changes occur, and no
historic migration is edited. No `variable_conflict` setting or lint waiver.

## Qualification

- Source-only Python suite: 4 tests PASS, checking eleven definitions, exact
  fragment multiplicities, idempotency, malformed/partial source rejection and
  absence of security/lint bypasses. This does not execute PostgreSQL.
- SQL acceptance authored: snapshot function identity/owner/ACL/security/search
  path/signature/volatility, apply twice, compare metadata and second-pass
  definitions, require no error-level checker findings for all eleven functions.
- PostgreSQL acceptance NOT RUN: this executor has no psql, postgres or Docker.
- Full schema lint NOT RUN locally; known temporary-stage issue remains.
- PR-only local qualification workflow now wires source tests, an uncorrected full
  baseline replay, actual migration applied twice, complete before-to-after function
  definition equivalence against the explicit replacement oracle, metadata checks,
  eleven-function checker acceptance, a full corrected replay, and unchanged
  whole-schema `--fail-on error` lint. No secrets, hosted target or deployment.
- Workflow authority is deliberately unbound (`prNumber: 0`), fail-closed until
  reviewed actual draft PR binding. Static workflow/identity checks PASS.
- No package, existing authority gate, legacy alias rehearsal or U1 hold changed.

Next: independent source review; disposable baseline negative-control and fixed
replay, SQL catalog/lint acceptance, then fixture-backed execution of affected
RPC paths with replay and wrong-game/role cases. A source-only result is not
merge/release qualification. Keep #1005's `--fail-on error` gate intact. Do not
mark this or FX complete until reviewed exact-head checks actually pass.


## Actual PR1006 qualification and supplemental context proof

Published draft #1006 head `1a824abe8319416a9b8eed17d7aca490639f43a6`.
Run `44022442570`, job `133834813828`, passed uncorrected baseline replay,
actual migration applied twice, full-definition oracle, identity/security metadata
invariance, all eleven corrected function checks, and complete corrected replay.
Whole-schema lint failed with exactly one error: the pre-existing temporary-stage
42P01 in `private.create_purchase_funding_quote_core_v1`. Eleven errors are fixed;
this does not yet constitute RPC lifecycle or complete release qualification.

A supplemental disposable transaction now prepares the exact temporary table
shape from the unchanged runtime definition, proves missing and malformed shapes
fail, checks every CLI-covered function with that context, reports coverage by
schema/count/signature digest and all findings, and rolls back. No function is
excluded, no error suppressed, and the original CLI fail-on-error step remains
unchanged after this proof and the existing quote lifecycle acceptance harness.
The overall workflow is therefore still expected to report the context-free CLI
finding, even if the supplemental proof succeeds. That is intentional, not green.

Coverage was verified against Supabase CLI v2.109.1 source commit
`6d4c19870ed213ba7f682f117d0345c8a40bfa94`, specifically
`apps/cli-go/pkg/migration/drop.go`, `queries/list.sql`, and
`apps/cli-go/internal/db/lint/templates/check.sql`: identical managed-schema
patterns, extension-dependency/schema-owner exclusions, PL/pgSQL language filter
and non-trigger return-type filter. The supplemental checker uses
`fatal_errors := false` to reveal all errors instead of stopping on the first.
It does not claim trigger coverage, which the current CLI likewise excludes.
No runtime definition, checker pragma or database data is changed by this proof.

Next decision only after actual evidence: independently review an explicit
context-aware gate implementation with the same enumerated coverage, both negative
controls, complete error reporting and lifecycle evidence. Do not silently convert
the existing CLI failure into success or ignore its result.

## Reviewed context-aware gate transition candidate

Run `44024643912`, job `133841949002`, on exact head
`87f17ce77be6a6095107c4885c89fb54bd6c281c` passed both migration replays,
all definition/security assertions, the full 531-function contextual check, and
actual service-role quote lifecycle acceptance (stage isolation, balanced currency
nets, zero replay/rollback deltas and two-game isolation). Context-free CLI again
reported only the same temporary-stage error. This is now evidence of an invalid
checker context rather than an untested exemption.

The next candidate explicitly replaces that final context-free invocation with
the context-aware fail-on-error gate, rather than concealing its exit status.
The preceding historical notes accurately describe earlier candidates, not this
transition. No errors are ignored. Any finding at level error fails the subprocess
and job. Coverage uses the pinned CLI 2.109.1 filters and additionally requires the
observed per-schema counts (30/6/68/427). Count/schema drift blocks for review.
Every routine definition is compared before/after checking.

Independent-review hardening: the temporary relation now exists only while the
one known quote-core OID is checked; the other 530 functions see it absent. An
unrelated deliberately invalid public function is created in a rolled-back
negative-control transaction and enters the same enumeration (532 total). The
actual checker subprocess must exit nonzero with SQLSTATE 42703 and the final
error-level assertion. A subsequent fresh clean subprocess must return zero and
531 functions, also proving the negative-control fixture did not persist. Missing
psql, early SQL failure or a different error cannot satisfy that control. Existing
absent/malformed-stage controls remain mandatory, and quote lifecycle acceptance
still runs before the final gate.

This transition has not yet executed in CI. Independent review and exact-head
positive/negative execution are required before calling the gate qualified. No
merge, production/staging execution, runtime definition change or trigger coverage
is claimed or authorized. Trigger exclusion is identical to the pinned CLI, not
an assertion that triggers are validated.


## Current-main reconciliation (2026-11-17)

Prepared against main `942e37de71f312bd361b40e6f0dcfb7c74f9140e` on the
existing #1006 owner branch. The starting local tree matched published head
`5fa772cca882a7a25f8fc5890197cd00ae57a963` exactly:
`44e6808601b7bacd974c7ba50160640ee59236e1`. Only the shared roadmap conflicted;
both intake histories and all incoming feature changes are retained.

Main adds no migration changes relative to this branch's prior baseline.
The correction migration, SQL acceptance, qualification workflow and verifier
remain byte-identical. The exact positive 531-function and negative 532-function
checks are not relaxed or recalibrated. Local source checks must not be treated
as PostgreSQL proof; independent union review and fresh exact-head hosted
qualification are required before merge. No main merge or live/staging action.

## Exact-head results and authority correction (2026-11-17)

Head `f295b78ecd5caa1cac16a4d49c3efd5807bc14cd` passed dedicated run
`44045497674`, job `133910039308`: both replay phases, apply-twice definition
and security equivalence, actual quote lifecycle/isolation, injected-invalid
checker rejection, clean 531-function gate, rollback and teardown. Independent
hosted review confirmed the bounded result. This is not an all-checks pass.

Eleven other workflows failed: nine source jobs fell back to a legacy Player
authority not bound to PR1006; Loan Review and Database Replay rejected the new
migration absent from the exact suffix registry. The correction adds actual-PR
metadata for the complete 13-path scope (15 locks including read-only verifier
and tests), and registers the exact fifteenth suffix while preserving all
previous fourteen identities and immutable environment manifests. Required
checks remain derived from actual workflow filters, with production, mutation
and secret permissions denied. No verifier, migration or runtime SQL changes.

Local checks pass: 27 suffix tests including missing/modified suffix rejection,
16 authority cases, 12 dedicated scope cases and five source regressions.
Independent metadata review and fresh complete exact-head CI are required.
No main merge, alias rehearsal, deployment or live/staging action.

Normal reconciliation also retains merged Market #997 main `bdc00c8f`; no
workflow or migration changed in that incoming main, so derived job coverage
remains unchanged. Local root aggregate initially stopped on missing installed
`@supabase/supabase-js`, not a source assertion; no passing aggregate claimed.
