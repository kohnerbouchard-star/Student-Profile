#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "backend/supabase/migrations/20260822090000_business_workforce_payroll_foundation_v2.sql";
const liveMutationPath =
  "backend/src/domains/business/api/playerBusinessMutationExecutor.ts";
const liveValidationPath =
  "backend/src/domains/business/api/playerBusinessRequestValidation.ts";
const productionPath =
  "backend/supabase/migrations/20260806120210_cutover_business_production_v2.sql";
const settlementPath =
  "backend/supabase/migrations/20260806120230_cutover_business_settlement_v2.sql";

const [source, liveMutation, liveValidation, production, settlement] =
  await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(liveMutationPath, "utf8"),
    readFile(liveValidationPath, "utf8"),
    readFile(productionPath, "utf8"),
    readFile(settlementPath, "utf8"),
  ]);

assert.match(source.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(source.trim(), /commit;$/u);

for (const table of [
  "business_workforce_role_definitions",
  "business_workforce_candidates",
  "business_recipe_labor_requirements",
  "business_labor_reservations",
  "business_payroll_runs",
  "business_payroll_entries",
]) {
  assert.match(
    source,
    new RegExp(`create table public\\.${table}\\b`, "u"),
    `missing ${table}`,
  );
  assert.match(
    source,
    new RegExp(
      `alter table public\\.${table}[\\s\\S]{0,120}enable row level security`,
      "u",
    ),
    `${table} must enable RLS`,
  );
  assert.match(
    source,
    new RegExp(
      `alter table public\\.${table}[\\s\\S]{0,120}force row level security`,
      "u",
    ),
    `${table} must force RLS`,
  );
  assert.match(
    source,
    new RegExp(
      `revoke all on table public\\.${table}[\\s\\S]{0,100}from public, anon, authenticated`,
      "u",
    ),
    `${table} must be browser-inaccessible`,
  );
}

assert.match(
  source,
  /create table public\.business_workforce_role_definitions/u,
);
assert.match(source, /role_key text not null/u);
assert.match(source, /default_labor_minutes_per_cycle integer not null/u);
assert.match(source, /minimum_skill_basis_points integer not null/u);
assert.doesNotMatch(
  source.slice(
    source.indexOf("create table public.business_workforce_role_definitions"),
    source.indexOf("create table public.business_workforce_candidates"),
  ),
  /wage|salary|pay_rate/iu,
  "Role definitions must not hard-code compensation.",
);

assert.match(
  source,
  /create table public\.business_workforce_candidates[\s\S]{0,2600}wage_per_cycle numeric\(14, 2\) not null/u,
);
assert.match(
  source,
  /create table public\.business_workforce_candidates[\s\S]{0,2600}labor_minutes_per_cycle integer not null/u,
);
assert.match(
  source,
  /create table public\.business_workforce_candidates[\s\S]{0,2600}skill_basis_points integer not null/u,
);
assert.match(
  source,
  /business_workforce_candidates_source_unique[\s\S]{0,160}game_session_id[\s\S]{0,160}source_type[\s\S]{0,160}source_key/u,
);
assert.match(
  source,
  /create_business_workforce_candidate_v2[\s\S]{0,9000}on conflict \(game_session_id, source_type, source_key\)[\s\S]{0,120}do nothing/u,
);
assert.match(
  source,
  /create_business_workforce_candidate_v2[\s\S]{0,12000}IDEMPOTENCY_KEY_CONFLICT/u,
);

assert.match(
  source,
  /create table public\.business_recipe_labor_requirements/u,
);
assert.match(
  source,
  /references public\.physical_economy_recipe_definitions\(id\)/u,
);
assert.match(source, /fixed_labor_minutes_per_run integer not null/u);
assert.match(source, /labor_minutes_per_unit integer not null/u);
assert.match(source, /minimum_headcount integer not null/u);
assert.match(source, /minimum_skill_basis_points integer not null/u);
assert.doesNotMatch(
  source,
  /create table public\.(?:business_recipe_definitions|business_recipe_inputs|business_recipe_outputs)/u,
  "Phase 4A must not duplicate the canonical recipe authority.",
);

assert.doesNotMatch(
  source,
  /create table public\.(?:business_employees_v2|business_workforce_employees)/u,
  "The existing Business employee table must remain canonical.",
);
assert.match(
  source,
  /alter table public\.business_employees[\s\S]{0,900}add column workforce_candidate_id uuid null/u,
);
assert.match(
  source,
  /alter table public\.business_employees[\s\S]{0,1200}add column workforce_role_definition_id uuid null/u,
);
assert.match(
  source,
  /workforce_source_type text not null default 'historical_v1'/u,
);
assert.match(
  source,
  /business_employees_canonical_workforce_valid[\s\S]{0,500}workforce_candidate_id is not null[\s\S]{0,500}productivity_index = 1/u,
  "Canonical employees must derive authority from a candidate and must not carry a client-selected productivity multiplier.",
);
assert.match(
  source,
  /business_employees_candidate_unique[\s\S]{0,120}where workforce_candidate_id is not null/u,
);

assert.match(
  source,
  /create table public\.business_labor_reservations/u,
);
assert.match(source, /reserved_minutes integer not null/u);
assert.match(
  source,
  /business_labor_reservations_employee_period_status_idx/u,
);
assert.match(
  source,
  /create or replace function public\.reserve_business_labor_v2/u,
);
assert.match(
  source,
  /reserve_business_labor_v2[\s\S]{0,9000}from public\.business_employees[\s\S]{0,500}for update/u,
  "Reservation creation must serialize on the canonical employee row.",
);
assert.match(
  source,
  /reserve_business_labor_v2[\s\S]{0,16000}sum\(reservation_row\.reserved_minutes\)[\s\S]{0,900}BUSINESS_LABOR_CAPACITY_EXCEEDED/u,
  "Reservation creation must enforce finite per-period capacity.",
);
assert.match(
  source,
  /status in \([\s\S]{0,120}'reserved'[\s\S]{0,120}'active'[\s\S]{0,120}'consumed'/u,
);
assert.match(
  source,
  /create or replace function public\.release_business_labor_reservation_v2/u,
);

assert.match(
  source,
  /create table public\.business_payroll_runs/u,
);
assert.match(
  source,
  /business_payroll_runs_period_unique[\s\S]{0,180}game_session_id[\s\S]{0,180}business_id[\s\S]{0,180}payroll_period_key/u,
  "Payroll idempotency must not depend on a sale row.",
);
assert.match(
  source,
  /gross_wages_due = gross_wages_paid \+ gross_wages_unpaid/u,
);
assert.match(
  source,
  /create table public\.business_payroll_entries/u,
);
assert.match(
  source,
  /business_payroll_entries_scope_unique[\s\S]{0,120}payroll_run_id[\s\S]{0,120}employee_id/u,
);
assert.match(source, /wage_due = wage_paid \+ wage_unpaid/u);
assert.match(
  source,
  /employee_player_id uuid null/u,
  "Payroll evidence must support both Player-linked and system candidates.",
);

for (const functionName of [
  "upsert_business_workforce_role_v2",
  "create_business_workforce_candidate_v2",
  "upsert_business_recipe_labor_requirement_v2",
  "reserve_business_labor_v2",
  "release_business_labor_reservation_v2",
]) {
  assert.match(
    source,
    new RegExp(
      `revoke all on function public\\.${functionName}\\([\\s\\S]{0,260}\\) from public, anon, authenticated`,
      "u",
    ),
    `${functionName} must be revoked from browser roles`,
  );
  assert.match(
    source,
    new RegExp(
      `grant execute on function public\\.${functionName}\\([\\s\\S]{0,260}\\) to service_role`,
      "u",
    ),
    `${functionName} must remain service-owned`,
  );
}

for (const forbiddenTable of [
  "business_balances",
  "business_inventory_v2",
  "business_companies",
  "business_recipe_definitions",
  "business_workforce_employees",
]) {
  assert.doesNotMatch(
    source,
    new RegExp(`create table public\\.${forbiddenTable}\\b`, "u"),
    `forbidden parallel authority ${forbiddenTable}`,
  );
}

assert.doesNotMatch(
  source,
  /grant execute on function[\s\S]{0,240}to (?:anon|authenticated)/iu,
);
assert.doesNotMatch(
  source,
  /grant (?:select|insert|update|delete|all)[\s\S]{0,180}to (?:anon|authenticated)/iu,
);

// Phase 4A is intentionally additive. These assertions keep the remaining
// Phase 4B cutover debt explicit rather than silently claiming it is solved.
assert.match(
  liveMutation,
  /case "businessHire"[\s\S]{0,1800}p_role_name[\s\S]{0,600}p_wage_per_cycle[\s\S]{0,600}p_productivity_index/u,
);
assert.match(
  liveValidation,
  /businessHire:[\s\S]{0,500}"wagePerCycle"[\s\S]{0,200}"productivityIndex"/u,
);
assert.match(
  production,
  /v_labor_cost :=[\s\S]{0,180}unit_labor_cost/u,
);
assert.match(
  production,
  /if v_labor_cost > 0 then[\s\S]{0,500}record_player_ledger_entry\([\s\S]{0,500}'production_labor'/u,
);
assert.match(
  settlement,
  /sum\(employee_row\.wage_per_cycle\)/u,
);
assert.match(settlement, /'wage_expense'/u);

console.log(
  "Business Phase 4A workforce/payroll authority foundation passed; live hiring, production labor charging, and payroll settlement cutover remain explicitly deferred.",
);
