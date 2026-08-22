#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const foundationPath =
  "backend/supabase/migrations/20260822090000_business_workforce_payroll_foundation_v2.sql";
const hardeningPath =
  "backend/supabase/migrations/20260822103000_business_workforce_payroll_scope_hardening_v2.sql";

const [foundation, hardening] = await Promise.all([
  readFile(foundationPath, "utf8"),
  readFile(hardeningPath, "utf8"),
]);

assert.match(hardening.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(hardening.trim(), /commit;$/u);

for (const indexName of [
  "business_employees_scope_business_role_id_unique",
  "business_production_runs_scope_business_id_unique",
  "business_payroll_runs_scope_business_currency_id_unique",
]) {
  assert.match(hardening, new RegExp(indexName, "u"));
}

for (const constraintName of [
  "business_labor_reservations_employee_role_scope_fk",
  "business_labor_reservations_run_business_scope_fk",
  "business_payroll_entries_run_business_currency_scope_fk",
  "business_payroll_entries_employee_role_scope_fk",
]) {
  assert.match(hardening, new RegExp(constraintName, "u"));
}

assert.match(
  hardening,
  /foreign key \(\s*game_session_id,\s*business_id,\s*employee_id,\s*role_definition_id\s*\)[\s\S]{0,260}references public\.business_employees \(\s*game_session_id,\s*business_id,\s*id,\s*workforce_role_definition_id\s*\)/iu,
);
assert.match(
  hardening,
  /foreign key \(\s*game_session_id,\s*business_id,\s*production_run_id\s*\)[\s\S]{0,220}references public\.business_production_runs \(\s*game_session_id,\s*business_id,\s*id\s*\)/iu,
);
assert.match(
  hardening,
  /foreign key \(\s*game_session_id,\s*business_id,\s*payroll_run_id,\s*currency_code\s*\)[\s\S]{0,260}references public\.business_payroll_runs \(\s*game_session_id,\s*business_id,\s*id,\s*currency_code\s*\)/iu,
);

for (const functionName of [
  "enforce_business_workforce_candidate_role_floor_v2",
  "enforce_business_recipe_labor_role_floor_v2",
  "enforce_business_workforce_role_floor_update_v2",
]) {
  assert.match(
    hardening,
    new RegExp(
      `create or replace function public\\.${functionName}\\(\\)[\\s\\S]{0,220}security definer[\\s\\S]{0,100}set search_path = pg_catalog, public`,
      "iu",
    ),
  );
  assert.match(
    hardening,
    new RegExp(
      `revoke all on function public\\.${functionName}\\(\\)[\\s\\S]{0,100}from public, anon, authenticated`,
      "iu",
    ),
  );
}

for (const triggerName of [
  "enforce_business_workforce_candidate_role_floor",
  "enforce_business_recipe_labor_role_floor",
  "enforce_business_workforce_role_floor_update",
]) {
  assert.match(hardening, new RegExp(`create trigger ${triggerName}`, "iu"));
}

for (const errorCode of [
  "BUSINESS_WORKFORCE_CANDIDATE_SKILL_BELOW_ROLE_MINIMUM",
  "BUSINESS_RECIPE_LABOR_SKILL_BELOW_ROLE_MINIMUM",
  "BUSINESS_WORKFORCE_ROLE_MINIMUM_EXCEEDS_CANDIDATE_SKILL",
  "BUSINESS_WORKFORCE_ROLE_MINIMUM_EXCEEDS_RECIPE_REQUIREMENT",
]) {
  assert.match(hardening, new RegExp(errorCode, "u"));
}

for (const tableName of [
  "business_workforce_role_definitions",
  "business_workforce_candidates",
  "business_recipe_labor_requirements",
  "business_labor_reservations",
  "business_payroll_runs",
  "business_payroll_entries",
]) {
  const revoke = new RegExp(
    `revoke delete on table public\\.${tableName}[\\s\\S]{0,80}from service_role`,
    "iu",
  );
  assert.match(hardening, revoke);
  assert.match(
    foundation,
    new RegExp(
      `grant select, insert, update, delete[\\s\\S]{0,900}public\\.${tableName}[\\s\\S]{0,300}to service_role`,
      "iu",
    ),
    `Foundation grant for ${tableName} was not found before the forward revoke.`,
  );
}

assert.doesNotMatch(
  hardening,
  /grant\s+(?:all|select|insert|update|delete|execute)[\s\S]{0,120}\bto\s+(?:public|anon|authenticated)\b/iu,
);
assert.doesNotMatch(hardening, /create table public\./iu);
assert.doesNotMatch(hardening, /insert into public\.business_(?:payroll|labor)/iu);
assert.doesNotMatch(hardening, /record_player_ledger_entry|post_inventory_transaction_v2/iu);

console.log(
  "Business Phase 4A workforce/payroll scope hardening contract passed.",
);
