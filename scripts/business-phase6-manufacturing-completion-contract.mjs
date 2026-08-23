#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "backend/supabase/migrations/20260823110300_business_manufacturing_completion_v2.sql",
);
const resourceHoldPath = path.join(
  root,
  "backend/supabase/migrations/20260823110200_business_manufacturing_resource_holds_v2.sql",
);
const workerPath = path.join(
  root,
  "backend/supabase/migrations/20260823110100_business_manufacturing_worker_and_read_v2.sql",
);

for (const file of [migrationPath, resourceHoldPath, workerPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
const lower = migration.toLowerCase();
const resourceHold = fs.readFileSync(resourceHoldPath, "utf8");
const worker = fs.readFileSync(workerPath, "utf8");

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

requireTokens(resourceHold, "Certified Phase 6B hold authority", [
  "business_manufacturing_material_holds",
  "business_manufacturing_labor_holds",
  "business_manufacturing_equipment_holds",
  "queue_business_manufacturing_job_v2",
  "'queued',\n    'reserved'",
]);
requireTokens(worker, "Certified Phase 6A lease authority", [
  "claim_due_business_manufacturing_jobs_v2",
  "completion_lease_token = extensions.gen_random_uuid()",
  "completion_lease_expires_at",
  "for update skip locked",
]);

requireTokens(migration, "Completion economics schema", [
  "alter table public.business_manufacturing_jobs",
  "add column output_quantity integer null",
  "add column material_cost_basis numeric(14,2) not null default 0",
  "add column labor_cost_basis numeric(14,2) not null default 0",
  "add column total_cost_basis numeric(14,2) not null default 0",
  "add column output_unit_cost_basis numeric(18,6) not null default 0",
  "add column completion_receipt_hash text null",
  "business_manufacturing_jobs_completion_economics_state_check",
]);

requireTokens(migration, "Immutable completion receipt", [
  "create table public.business_manufacturing_completion_receipts",
  "default ('mcr_' || encode(gen_random_bytes(16), 'hex'))",
  "references public.business_manufacturing_jobs(game_session_id, id)",
  "business_manufacturing_completion_receipts_job_unique",
  "business_manufacturing_completion_receipts_inventory_key_unique",
  "guard_business_manufacturing_completion_receipt_v2",
  "BUSINESS_MANUFACTURING_COMPLETION_RECEIPT_IMMUTABLE",
  "force row level security",
  "revoke all on table public.business_manufacturing_completion_receipts",
]);

requireTokens(migration, "Lease-bound exact-once completion", [
  "complete_business_manufacturing_job_v2",
  "v_job.status = 'completed'",
  "BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT",
  "v_job.completes_at > v_now",
  "v_job.completion_lease_token is distinct from p_lease_token",
  "v_job.completion_lease_expires_at <= v_now",
  "BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID",
  "completion_lease_hash is distinct from v_lease_hash",
]);

requireTokens(migration, "Canonical output authority", [
  "from public.physical_economy_recipe_outputs as recipe_output",
  "recipe_output.item_key = v_output.canonical_key",
  "BUSINESS_MANUFACTURING_MULTI_OUTPUT_UNSUPPORTED",
  "v_output_quantity := ceil(v_recipe_output.base_quantity * v_job.quantity)::integer",
  "account_row.account_kind = 'finished_goods'",
  "BUSINESS_MANUFACTURING_FINISHED_GOODS_UNAVAILABLE",
]);

requireTokens(migration, "Canonical WIP settlement", [
  "from public.business_manufacturing_material_holds as hold",
  "hold.status = 'held'",
  "order by hold.line_key, hold.public_key",
  "for update",
  "inventory_account_id = v_material.work_in_progress_account_id",
  "BUSINESS_MANUFACTURING_WIP_HOLDING_INVALID",
  "'eventType', 'CONSUMED'",
  "'location', 'work_in_progress'",
]);

requireTokens(migration, "Finished Goods posting and cost basis", [
  "v_total_cost := v_material_cost + v_labor_cost",
  "v_unit_cost := round(v_total_cost / nullif(v_output_quantity, 0), 6)",
  "'eventType', 'PRODUCED'",
  "'location', 'finished_goods'",
  "economy_private.post_inventory_transaction_v2",
  "'production'",
  "'business_manufacturing'",
  "'job_completed'",
  "v_journal_lines",
]);

requireTokens(migration, "Exact-once labor and equipment consumption", [
  "from public.business_manufacturing_labor_holds as hold",
  "join public.business_labor_reservations as reservation",
  "order by reservation.public_key",
  "BUSINESS_MANUFACTURING_LABOR_HOLD_INVALID",
  "update public.business_labor_reservations",
  "status = 'consumed'",
  "from public.business_manufacturing_equipment_holds as hold",
  "join public.business_equipment_reservations as reservation",
  "BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INVALID",
  "update public.business_equipment_reservations",
]);

requireTokens(migration, "Atomic terminal evidence", [
  "update public.business_manufacturing_material_holds",
  "insert into public.business_manufacturing_completion_receipts",
  "update public.business_manufacturing_jobs",
  "status = 'completed'",
  "resource_state = 'consumed'",
  "completion_lease_token = null",
  "insert into public.business_manufacturing_job_transitions",
  "'business.manufacturing.completed'",
  "insert into public.audit_log",
]);

const functionStart = migration.indexOf(
  "create or replace function public.complete_business_manufacturing_job_v2",
);
const functionEnd = migration.indexOf("comment on function", functionStart);
if (functionStart < 0 || functionEnd <= functionStart) {
  throw new Error("Unable to isolate Phase 6C completion function.");
}
const completion = migration.slice(functionStart, functionEnd).toLowerCase();
const inventoryIndex = completion.indexOf("post_inventory_transaction_v2");
const laborIndex = completion.indexOf("update public.business_labor_reservations");
const equipmentIndex = completion.indexOf("update public.business_equipment_reservations");
const receiptIndex = completion.indexOf("insert into public.business_manufacturing_completion_receipts");
const jobIndex = completion.indexOf("update public.business_manufacturing_jobs");
const transitionIndex = completion.indexOf("insert into public.business_manufacturing_job_transitions");
if (!(
  inventoryIndex > 0 &&
  laborIndex > inventoryIndex &&
  equipmentIndex > laborIndex &&
  receiptIndex > equipmentIndex &&
  jobIndex > receiptIndex &&
  transitionIndex > jobIndex
)) {
  throw new Error(
    "Completion order must remain inventory -> labor -> equipment -> receipt -> job -> evidence.",
  );
}

forbidTokens(lower, "Phase 6C exclusions", [
  "create table public.business_store_offers",
  "create table if not exists public.business_store_offers",
  "cron.schedule",
  "create or replace function public.run_business_production_v1",
  "alter function public.run_business_production_v1",
  "status = 'cancelled'",
  "status = 'failed'",
  "durability_percent",
  "repair_cost",
  "client_completed_at",
  "browser_completed_at",
]);

console.log("Business Phase 6C exact-once completion contract: PASS");
