#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "backend/supabase/migrations/20260822140300_business_production_labor_reservations_v2.sql",
);
const payrollClockPath = path.join(
  root,
  "backend/supabase/migrations/20260822140000_business_payroll_clock_v2.sql",
);

for (const file of [migrationPath, payrollClockPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const sql = fs.readFileSync(migrationPath, "utf8");
const payrollClock = fs.readFileSync(payrollClockPath, "utf8");

const required = [
  "run_business_production_material_compat_v1",
  "business_recipe_labor_requirements",
  "business_labor_reservations",
  "current_business_payroll_period_key_v2",
  "reserve_business_labor_v2",
  "BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE",
  "BUSINESS_LABOR_SKILL_UNAVAILABLE",
  "BUSINESS_LABOR_CAPACITY_UNAVAILABLE",
  "canonical_recipe_v2",
  "reserved_labor_minutes",
  "labor_cost_basis",
  "production_run_id = v_run.id",
  "status = 'consumed'",
  "read_owned_business_workforce_utilization_v2",
  "utilizationBasisPoints",
  "latestPayrollStatus",
  "from public.resolve_player_business_v2",
  "grant execute on function public.read_owned_business_workforce_utilization_v2",
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Phase 4C-B production labor contract missing: ${token}`);
  }
}

const forbidden = [
  "business_employee_labor_reservations",
  "create table public.business_recipe_labor_requirements",
  "create table public.business_labor_reservations",
];
for (const token of forbidden) {
  if (sql.includes(token)) {
    throw new Error(`Phase 4C-B must reuse certified authority, found forbidden token: ${token}`);
  }
}

if (!payrollClock.includes("unit_labor_cost = 0")) {
  throw new Error("Phase 4C-A must keep synthetic product labor charge fixed at zero.");
}
if (!payrollClock.includes("Recurring payroll is the only wage cash authority")) {
  throw new Error("Phase 4C-A payroll cash-authority comment is missing.");
}

const wrapperStart = sql.indexOf("create or replace function public.run_business_production_v1");
const utilizationStart = sql.indexOf("create or replace function public.read_owned_business_workforce_utilization_v2");
if (wrapperStart < 0 || utilizationStart <= wrapperStart) {
  throw new Error("Unable to isolate the Phase 4C-B production wrapper.");
}
const wrapper = sql.slice(wrapperStart, utilizationStart);
if (wrapper.includes("record_player_ledger_entry(")) {
  throw new Error("Canonical Phase 4C production must not post a wage cash ledger entry.");
}
if (!wrapper.includes("ledger_entry_id = null")) {
  throw new Error("Canonical production must explicitly retain no production wage ledger entry.");
}

const utilization = sql.slice(utilizationStart);
for (const forbiddenKey of [
  "'employeeId'",
  "'businessId'",
  "'playerId'",
  "'gameSessionId'",
  "'roleDefinitionId'",
]) {
  if (utilization.includes(forbiddenKey)) {
    throw new Error(`Browser utilization payload leaks internal scope key: ${forbiddenKey}`);
  }
}

console.log("Business Phase 4C-B production labor contract: PASS");
