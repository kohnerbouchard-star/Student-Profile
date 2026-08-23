#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const paths = {
  foundation: path.join(root, "backend/supabase/migrations/20260823110000_business_manufacturing_job_foundation_v2.sql"),
  worker: path.join(root, "backend/supabase/migrations/20260823110100_business_manufacturing_worker_and_read_v2.sql"),
  manifest: path.join(root, "backend/supabase/migrations/20260823110200_business_manufacturing_resource_manifest_v2.sql"),
  start: path.join(root, "backend/supabase/migrations/20260823110300_business_manufacturing_atomic_start_v2.sql"),
  scope: path.join(root, "docs/roadmaps/business-phase6-timed-manufacturing-scope-v1.md"),
};

for (const [label, file] of Object.entries(paths)) {
  if (!fs.existsSync(file)) throw new Error(`Missing Phase 6B ${label}: ${file}`);
}

const foundation = fs.readFileSync(paths.foundation, "utf8");
const worker = fs.readFileSync(paths.worker, "utf8");
const manifest = fs.readFileSync(paths.manifest, "utf8");
const start = fs.readFileSync(paths.start, "utf8");
const scope = fs.readFileSync(paths.scope, "utf8");
const sql = `${manifest}\n${start}`;
const lower = sql.toLowerCase();

function requireTokens(source, label, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`${label} missing: ${token}`);
  }
}
function forbidTokens(source, label, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) throw new Error(`${label} contains forbidden token: ${token}`);
  }
}
function assertOrder(source, label, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    if (next < 0 || next <= cursor) throw new Error(`${label} order invalid at: ${token}`);
    cursor = next;
  }
}

requireTokens(manifest, "Manufacturing job manifest columns", [
  "add column output_quantity integer not null",
  "add column resource_manifest_status text not null",
  "add column material_hold_count integer not null",
  "add column labor_reservation_count integer not null",
  "add column equipment_reservation_count integer not null",
  "add column material_cost_basis numeric(18,4) not null",
  "add column labor_cost_basis numeric(18,4) not null",
  "add column payroll_period_key text null",
  "add column equipment_period_key text null",
  "business_manufacturing_jobs_manifest_counts_check",
]);

requireTokens(manifest, "Canonical manufacturing hold evidence", [
  "create table public.business_manufacturing_material_holds",
  "references public.physical_economy_recipe_inputs(id)",
  "references public.inventory_transactions(id)",
  "create table public.business_manufacturing_labor_holds",
  "references public.business_recipe_labor_requirements(id)",
  "references public.business_labor_reservations(game_session_id, id)",
  "create table public.business_manufacturing_equipment_holds",
  "references public.business_recipe_equipment_requirements(id)",
  "references public.business_equipment_reservations(game_session_id, id)",
  "deferrable initially deferred",
  "status in ('held','active','consumed','released')",
]);

requireTokens(manifest, "Deferred manifest validation", [
  "validate_business_manufacturing_resource_manifest_v2",
  "physical_economy_recipe_inputs",
  "manufacturing_material_to_wip",
  "inventory_transaction_lines",
  "physical_economy_recipe_outputs",
  "business_recipe_labor_requirements",
  "business_recipe_equipment_requirements",
  "BUSINESS_MANUFACTURING_MATERIAL_MANIFEST_LINE_INVALID",
  "BUSINESS_MANUFACTURING_LABOR_MANIFEST_REQUIREMENT_INVALID",
  "BUSINESS_MANUFACTURING_EQUIPMENT_MANIFEST_REQUIREMENT_INVALID",
  "create constraint trigger validate_business_manufacturing_job_manifest_v2",
  "deferrable initially deferred",
]);

requireTokens(start, "Atomic manufacturing start command", [
  "start_business_manufacturing_job_v2",
  "from public.resolve_player_business_v2",
  "product_row.product_kind = 'physical_good'",
  "business_recipe_access",
  "physical_economy_recipe_outputs",
  "game_session_recipe_availability",
  "scarcity_band <> 'unavailable'",
  "BUSINESS_MANUFACTURING_RECIPE_AMBIGUOUS",
  "BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT",
  "derive_business_manufacturing_duration_seconds_v2",
]);

requireTokens(start, "Canonical Warehouse to WIP transfer", [
  "ensure_business_inventory_account_v2",
  "'warehouse'",
  "'work_in_progress'",
  "physical_economy_recipe_inputs",
  "v_input.base_quantity::bigint * p_quantity::bigint",
  "quantity_owned - v_warehouse_holding.quantity_reserved < v_required",
  "post_inventory_transaction_v2",
  "'manufacturing_material_to_wip'",
  "'direction', 'warehouse_to_wip'",
  "'quantityDelta', -v_required",
  "'quantityDelta', v_required",
  "insert into public.business_manufacturing_material_holds",
]);

requireTokens(start, "Deterministic labor holds", [
  "current_business_payroll_period_key_v2",
  "business_recipe_labor_requirements",
  "minimum_headcount",
  "minimum_skill_basis_points",
  "order by employee.public_key",
  "for update of employee",
  "reserve_business_labor_v2",
  "'production_job'",
  "insert into public.business_manufacturing_labor_holds",
  "wage_cost_basis",
]);

requireTokens(start, "Deterministic equipment holds", [
  "current_business_equipment_period_key_v2",
  "business_recipe_equipment_requirements",
  "minimum_instance_count",
  "order by installation.public_key",
  "for update of locked_installation, locked_instance",
  "reserve_business_equipment_v2",
  "insert into public.business_manufacturing_equipment_holds",
  "BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE",
  "BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE",
]);

assertOrder(start, "Job insertion must follow all resource holds", [
  "insert into public.business_manufacturing_material_holds",
  "insert into public.business_manufacturing_labor_holds",
  "insert into public.business_manufacturing_equipment_holds",
  "insert into public.business_manufacturing_jobs",
]);

assertOrder(start, "Replay must precede material mutation", [
  "select job_row.*\n  into v_existing",
  "if found then",
  "return query select",
  "v_warehouse_account_id :=",
  "post_inventory_transaction_v2",
]);

requireTokens(start, "Resource activation at queue start", [
  "activate_business_manufacturing_resource_holds_v2",
  "update public.business_manufacturing_material_holds",
  "update public.business_labor_reservations as reservation",
  "update public.business_equipment_reservations as reservation",
  "BUSINESS_MANUFACTURING_MATERIAL_ACTIVATION_CONFLICT",
  "BUSINESS_MANUFACTURING_LABOR_ACTIVATION_CONFLICT",
  "BUSINESS_MANUFACTURING_EQUIPMENT_ACTIVATION_CONFLICT",
  "perform public.activate_business_manufacturing_resource_holds_v2",
]);

const startSignatureBegin = start.indexOf(
  "create or replace function public.start_business_manufacturing_job_v2",
);
const startLanguage = start.indexOf("language plpgsql", startSignatureBegin);
if (startSignatureBegin < 0 || startLanguage <= startSignatureBegin) {
  throw new Error("Unable to isolate manufacturing start signature.");
}
const publicReturns = start.slice(startSignatureBegin, startLanguage).toLowerCase();
const returnsIndex = publicReturns.indexOf("returns table");
if (returnsIndex < 0) throw new Error("Manufacturing start omits returns table.");
forbidTokens(publicReturns.slice(returnsIndex), "Public manufacturing start receipt", [
  " uuid",
  "game_session_id",
  "business_id",
  "product_id",
  "recipe_definition_id",
  "output_game_item_id",
  "requested_by_player_id",
  "inventory_account_id",
  "lease_token",
  "request_hash",
]);

forbidTokens(lower, "Phase 6B authority exclusions", [
  "create table public.game_items",
  "create table if not exists public.game_items",
  "create table public.inventory_accounts",
  "create table if not exists public.inventory_accounts",
  "create table public.inventory_holdings",
  "create table if not exists public.inventory_holdings",
  "create table public.physical_economy_recipe_definitions",
  "create table if not exists public.physical_economy_recipe_definitions",
  "create table public.business_employees",
  "create table if not exists public.business_employees",
  "create table public.equipment_instances",
  "create table if not exists public.equipment_instances",
  "alter function public.run_business_production_v1",
  "create or replace function public.run_business_production_v1",
  "production_output_granted",
  "finished_goods",
  "create table public.business_store_offers",
  "cron.schedule",
  "durability_percent",
  "repair_cost",
]);

requireTokens(foundation + worker + scope, "Retained Phase 6 boundaries", [
  "business_manufacturing_jobs",
  "FOR UPDATE SKIP LOCKED",
  "Phase 6B — atomic manufacturing start and resource hold is OPEN",
  "does **not** expose a Player job-creation route or a completion settlement function",
]);

console.log("Business Phase 6B atomic manufacturing start contract: PASS");
