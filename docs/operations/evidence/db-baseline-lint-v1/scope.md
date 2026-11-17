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
