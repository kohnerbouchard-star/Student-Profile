#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "backend/supabase/migrations/20260823110200_business_manufacturing_resource_holds_v2.sql",
);
const foundationPath = path.join(
  root,
  "backend/supabase/migrations/20260823110000_business_manufacturing_job_foundation_v2.sql",
);
const workerPath = path.join(
  root,
  "backend/supabase/migrations/20260823110100_business_manufacturing_worker_and_read_v2.sql",
);
const phase4Path = path.join(
  root,
  "backend/supabase/migrations/20260822140300_business_production_labor_reservations_v2.sql",
);
const phase5Path = path.join(
  root,
  "backend/supabase/migrations/20260823100400_business_production_equipment_capacity_v2.sql",
);

for (const file of [migrationPath, foundationPath, workerPath, phase4Path, phase5Path]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
const lower = migration.toLowerCase();
const retained = [phase4Path, phase5Path].map((file) => fs.readFileSync(file, "utf8")).join("\n");

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

requireTokens(retained, "Certified resource authorities", [
  "business_labor_reservations",
  "business_recipe_labor_requirements",
  "reserve_business_equipment_v2",
  "business_equipment_reservations",
  "business_recipe_equipment_requirements",
]);

requireTokens(migration, "Manufacturing material hold authority", [
  "create table public.business_manufacturing_material_holds",
  "references public.physical_economy_recipe_inputs(id)",
  "references public.business_manufacturing_jobs(game_session_id, id)",
  "warehouse_account_id uuid not null",
  "work_in_progress_account_id uuid not null",
  "status in ('held','consumed','released')",
  "business_manufacturing_material_holds_line_unique",
  "BUSINESS_MANUFACTURING_HOLD_TERMINAL",
]);

requireTokens(migration, "Manufacturing labor/equipment links", [
  "create table public.business_manufacturing_labor_holds",
  "references public.business_labor_reservations(game_session_id, id)",
  "wage_per_cycle_snapshot",
  "allocated_labor_cost",
  "create table public.business_manufacturing_equipment_holds",
  "references public.business_equipment_reservations(game_session_id, id)",
  "business_manufacturing_equipment_holds_reservation_unique",
]);

requireTokens(migration, "Atomic manufacturing queue command", [
  "queue_business_manufacturing_job_v2",
  "from public.resolve_player_business_v2",
  "product_row.product_kind = 'physical_good'",
  "business_recipe_access",
  "physical_economy_recipe_outputs",
  "derive_business_manufacturing_duration_seconds_v2",
  "current_business_payroll_period_key_v2",
  "current_business_equipment_period_key_v2",
  "insert into public.business_manufacturing_jobs",
  "status,\n    resource_state",
  "'queued',\n    'reserved'",
]);

requireTokens(migration, "Canonical Warehouse to WIP movement", [
  "account_row.account_kind = 'warehouse'",
  "account_row.account_kind = 'work_in_progress'",
  "from public.physical_economy_recipe_inputs",
  "quantity_owned - v_holding.quantity_reserved < v_required",
  "economy_private.post_inventory_transaction_v2",
  "'business_manufacturing'",
  "'materials_to_wip'",
  "'eventType', 'TRANSFER_OUT'",
  "'eventType', 'TRANSFER_IN'",
  "insert into public.business_manufacturing_material_holds",
]);

requireTokens(migration, "Deterministic labor hold", [
  "from public.business_recipe_labor_requirements",
  "employee.workforce_source_type in ('candidate_v2','migration_v2')",
  "order by employee.public_key",
  "for update of employee",
  "insert into public.business_labor_reservations",
  "status in ('reserved','active','consumed')",
  "insert into public.business_manufacturing_labor_holds",
  "BUSINESS_LABOR_CAPACITY_UNAVAILABLE",
]);

requireTokens(migration, "Deterministic equipment hold", [
  "from public.business_recipe_equipment_requirements",
  "order by requirement.capability_key, requirement.public_key",
  "order by installation.public_key",
  "for update of locked_installation, locked_instance",
  "reserve_business_equipment_v2",
  "insert into public.business_manufacturing_equipment_holds",
  "BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE",
]);

requireTokens(migration, "Idempotency and publication safety", [
  "BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT",
  "where job_row.game_session_id = p_game_session_id",
  "and job_row.requested_by_player_id = p_player_id",
  "and job_row.idempotency_key = p_idempotency_key",
  "'business.manufacturing.queued'",
  "resourceAuthority', 'canonical_reserved_v2'",
  "revoke insert, update, delete on table public.business_manufacturing_jobs",
  "grant execute on function public.queue_business_manufacturing_job_v2",
]);

const functionStart = migration.indexOf(
  "create or replace function public.queue_business_manufacturing_job_v2",
);
const functionEnd = migration.indexOf("comment on function", functionStart);
if (functionStart < 0 || functionEnd <= functionStart) {
  throw new Error("Unable to isolate manufacturing queue command.");
}
const queueFunction = migration.slice(functionStart, functionEnd).toLowerCase();
const materialIndex = queueFunction.indexOf("post_inventory_transaction_v2");
const laborIndex = queueFunction.indexOf("insert into public.business_labor_reservations");
const equipmentIndex = queueFunction.indexOf("reserve_business_equipment_v2");
const transitionIndex = queueFunction.indexOf("insert into public.business_manufacturing_job_transitions");
if (!(materialIndex > 0 && laborIndex > materialIndex && equipmentIndex > laborIndex && transitionIndex > equipmentIndex)) {
  throw new Error("Manufacturing resource hold order is not deterministic material -> labor -> equipment -> evidence.");
}

forbidTokens(lower, "Phase 6B exclusions", [
  "status = 'completed'",
  "completed_at =",
  "create table public.business_store_offers",
  "create table if not exists public.business_store_offers",
  "cron.schedule",
  "create or replace function public.run_business_production_v1",
  "alter function public.run_business_production_v1",
  "durability_percent",
  "repair_cost",
  "client_completed_at",
]);

console.log("Business Phase 6B atomic manufacturing resource hold contract: PASS");
