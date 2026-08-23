#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "backend/supabase/migrations/20260823110300_business_manufacturing_completion_v2.sql");
const assertionsPath = path.join(root, "backend/supabase/migrations/20260823110310_business_manufacturing_completion_schema_assertions_v2.sql");
for (const file of [migrationPath, assertionsPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required Phase 6C file: ${file}`);
}
const sql = fs.readFileSync(migrationPath, "utf8");
const lower = sql.toLowerCase();
const assertions = fs.readFileSync(assertionsPath, "utf8");

function requireTokens(source, label, tokens) {
  for (const token of tokens) if (!source.includes(token)) throw new Error(`${label} missing: ${token}`);
}
function forbidTokens(source, label, tokens) {
  for (const token of tokens) if (source.includes(token)) throw new Error(`${label} contains forbidden token: ${token}`);
}

requireTokens(sql, "Completion economics schema", [
  "completed_output_quantity integer null",
  "material_cost_basis numeric(18,4) null",
  "labor_cost_basis numeric(18,4) null",
  "total_cost_basis numeric(18,4) null",
  "finished_unit_cost numeric(18,6) null",
  "completion_token_hash text null",
  "manufacturing_labor_cost_basis numeric(18,4) null",
]);

requireTokens(sql, "Immutable completion receipt", [
  "create table public.business_manufacturing_completion_receipts",
  "inventory_transaction_id uuid not null",
  "business_manufacturing_completion_receipts_job_unique",
  "guard_business_manufacturing_completion_receipt_v2",
  "BUSINESS_MANUFACTURING_COMPLETION_RECEIPT_IMMUTABLE",
]);

requireTokens(sql, "Lease and due-time authority", [
  "complete_business_manufacturing_job_v2",
  "p_job_id uuid",
  "p_lease_token uuid",
  "v_job.completes_at > v_now",
  "v_job.completion_lease_token is distinct from p_lease_token",
  "v_job.completion_lease_expires_at <= v_now",
  "BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID",
  "BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT",
]);

requireTokens(sql, "Canonical settlement", [
  "business_manufacturing_job_materials",
  "material.status = 'staged'",
  "v_material.wip_account_id",
  "v_material.staged_quantity",
  "v_material.staged_unit_cost",
  "business_labor_reservations",
  "reservation.manufacturing_job_id = v_job.id",
  "business_equipment_reservations",
  "ensure_business_inventory_account_v2",
  "'finished_goods'",
  "post_inventory_transaction_v2",
  "'business_manufacturing'",
  "'job_completed'",
  "coalesce(v_inventory_post ->> 'status', '') <> 'committed'",
]);

requireTokens(sql, "Exact-once resource consumption", [
  "status = 'consumed'",
  "consumed_at = v_now",
  "BUSINESS_MANUFACTURING_MATERIAL_CONSUMPTION_CONFLICT",
  "BUSINESS_MANUFACTURING_LABOR_CONSUMPTION_CONFLICT",
  "BUSINESS_MANUFACTURING_EQUIPMENT_CONSUMPTION_CONFLICT",
  "resource_state = 'consumed'",
  "completion_lease_token = null",
  "completion_lease_expires_at = null",
]);

requireTokens(sql, "No duplicate payroll debit", [
  "employee.wage_per_cycle",
  "reservation.reserved_minutes::numeric",
  "manufacturing_labor_cost_basis",
  "'payrollCashDebitCreated', false",
]);

requireTokens(assertions, "Database Replay assertions", [
  "job.completed_output_quantity",
  "job.finished_unit_cost",
  "job.completion_token_hash",
  "reservation.manufacturing_labor_cost_basis",
  "complete_business_manufacturing_job_v2(uuid,uuid,uuid)",
]);

const signatureStart = sql.indexOf("create or replace function public.complete_business_manufacturing_job_v2");
const language = sql.indexOf("language plpgsql", signatureStart);
if (signatureStart < 0 || language <= signatureStart) throw new Error("Unable to isolate completion signature.");
const signature = sql.slice(signatureStart, language).toLowerCase();
const returnsStart = signature.indexOf("returns table");
if (returnsStart < 0) throw new Error("Completion omits public receipt table.");
forbidTokens(signature.slice(returnsStart), "Completion return privacy", [
  " uuid", "game_session_id", "business_id", "job_id", "inventory_transaction_id",
  "employee_id", "installation_id", "lease_token", "request_hash",
]);

forbidTokens(lower, "Phase 6C canonical-boundary exclusions", [
  "business_manufacturing_material_holds",
  "business_manufacturing_labor_holds",
  "business_manufacturing_equipment_holds",
  "payroll_debit",
  "create table public.inventory_accounts",
  "create table public.inventory_holdings",
  "create table public.business_store_offers",
  "cron.schedule",
]);

console.log("Business Phase 6C exact-once manufacturing completion contract: PASS");
