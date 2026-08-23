#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "backend/supabase/migrations/20260823110200_business_manufacturing_start_resources_v2.sql");
const assertionsPath = path.join(root, "backend/supabase/migrations/20260823110210_business_manufacturing_resource_schema_assertions_v2.sql");
const scopePath = path.join(root, "docs/roadmaps/business-phase6-timed-manufacturing-scope-v1.md");
for (const file of [migrationPath, assertionsPath, scopePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required Phase 6B file: ${file}`);
}
const sql = fs.readFileSync(migrationPath, "utf8");
const lower = sql.toLowerCase();
const assertions = fs.readFileSync(assertionsPath, "utf8");
const scope = fs.readFileSync(scopePath, "utf8");

function requireTokens(source, label, tokens) {
  for (const token of tokens) if (!source.includes(token)) throw new Error(`${label} missing: ${token}`);
}
function forbidTokens(source, label, tokens) {
  for (const token of tokens) if (source.includes(token)) throw new Error(`${label} contains forbidden token: ${token}`);
}

requireTokens(sql, "Direct job resource bindings", [
  "add column if not exists manufacturing_job_id uuid null",
  "business_labor_reservations_manufacturing_job_fk",
  "business_equipment_reservations_manufacturing_job_fk",
  "business_labor_reservations_single_work_binding_check",
  "business_equipment_reservations_single_work_binding_check",
  "num_nonnulls(production_run_id, manufacturing_job_id) <= 1",
]);

requireTokens(sql, "Canonical WIP material manifest", [
  "create table public.business_manufacturing_job_materials",
  "warehouse_account_id uuid not null",
  "wip_account_id uuid not null",
  "staged_quantity integer not null",
  "staged_unit_cost numeric(18,4) not null",
  "status in ('staged','consumed','released')",
  "business_manufacturing_job_materials_line_unique",
  "guard_business_manufacturing_material_v2",
]);

requireTokens(sql, "Atomic manufacturing start", [
  "start_business_manufacturing_job_v2",
  "from public.resolve_player_business_v2",
  "product_row.product_kind = 'physical_good'",
  "business_recipe_access",
  "physical_economy_recipe_outputs",
  "game_session_recipe_availability",
  "scarcity_band <> 'unavailable'",
  "select recipe.*",
  "v_product.output_game_item_id",
  "BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT",
  "derive_business_manufacturing_duration_seconds_v2",
  "post_inventory_transaction_v2",
  "'manufacturing_material_staged'",
  "'location', 'warehouse'",
  "'location', 'work_in_progress'",
  "coalesce(v_inventory_post->>'status', '') <> 'committed'",
]);

forbidTokens(sql, "Replay-safe composite assignment", [
  "select recipe, output_item\n  into v_recipe, v_output",
  "v_output public.game_items%rowtype",
]);

requireTokens(sql, "Deterministic finite reservations", [
  "current_business_payroll_period_key_v2",
  "order by employee.public_key",
  "manufacturing_job_id",
  "current_business_equipment_period_key_v2",
  "order by installation.public_key",
  "reserve_business_equipment_v2",
  "BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE",
  "BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE",
]);

requireTokens(sql, "Commit-time resource proof", [
  "validate_business_manufacturing_resources_v2",
  "deferrable initially deferred",
  "BUSINESS_MANUFACTURING_MATERIAL_HOLD_INCOMPLETE",
  "BUSINESS_MANUFACTURING_LABOR_HOLD_INCOMPLETE",
  "BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INCOMPLETE",
  "set constraints validate_business_manufacturing_resources_v2 immediate",
]);

requireTokens(assertions, "Database Replay schema assertions", [
  "reservation.manufacturing_job_id",
  "material.staged_quantity",
  "material.staged_unit_cost",
  "start_business_manufacturing_job_v2(uuid,uuid,text,text,integer,text,text)",
]);

const laborAssertionEnd = assertions.indexOf("from public.business_labor_reservations as reservation");
if (laborAssertionEnd < 0) throw new Error("Unable to isolate labor reservation schema assertion.");
const laborAssertionStart = assertions.lastIndexOf("perform", laborAssertionEnd);
if (laborAssertionStart < 0) throw new Error("Unable to locate labor reservation assertion start.");
const laborAssertion = assertions.slice(laborAssertionStart, laborAssertionEnd);
requireTokens(laborAssertion, "Canonical labor reservation schema assertion", [
  "reservation.employee_id",
  "reservation.role_definition_id",
  "reservation.reservation_kind",
  "reservation.source_reference_key",
]);
forbidTokens(laborAssertion, "Canonical labor reservation schema assertion", [
  "reservation.requirement_id",
  "reservation.intent_ref",
]);

const equipmentAssertionEnd = assertions.indexOf("from public.business_equipment_reservations as reservation");
if (equipmentAssertionEnd < 0) throw new Error("Unable to isolate equipment reservation schema assertion.");
const equipmentAssertionStart = assertions.lastIndexOf("perform", equipmentAssertionEnd);
if (equipmentAssertionStart < 0) throw new Error("Unable to locate equipment reservation assertion start.");
const equipmentAssertion = assertions.slice(equipmentAssertionStart, equipmentAssertionEnd);
requireTokens(equipmentAssertion, "Canonical equipment reservation schema assertion", [
  "reservation.installation_id",
  "reservation.requirement_id",
  "reservation.intent_ref",
]);
forbidTokens(equipmentAssertion, "Canonical equipment reservation schema assertion", [
  "reservation.role_definition_id",
  "reservation.reservation_kind",
  "reservation.source_reference_key",
]);

const signatureStart = sql.indexOf("create or replace function public.start_business_manufacturing_job_v2");
const language = sql.indexOf("language plpgsql", signatureStart);
if (signatureStart < 0 || language <= signatureStart) throw new Error("Unable to isolate manufacturing start signature.");
const signature = sql.slice(signatureStart, language).toLowerCase();
const returnsStart = signature.indexOf("returns table");
if (returnsStart < 0) throw new Error("Manufacturing start omits public return table.");
forbidTokens(signature.slice(returnsStart), "Manufacturing start public receipt", [
  " uuid", "game_session_id", "business_id", "product_id", "recipe_definition_id",
  "output_game_item_id", "employee_id", "installation_id", "request_hash", "lease_token",
]);

forbidTokens(lower, "Phase 6B canonical-boundary exclusions", [
  "create table public.business_manufacturing_material_holds",
  "create table public.business_manufacturing_labor_holds",
  "create table public.business_manufacturing_equipment_holds",
  "create table public.game_items",
  "create table public.inventory_accounts",
  "create table public.inventory_holdings",
  "complete_business_manufacturing_job_v2",
  "create table public.business_store_offers",
  "cron.schedule",
]);

requireTokens(scope, "Phase 6 scope", [
  "Phase 6B",
  "Warehouse",
  "Work in Progress",
  "labor",
  "equipment",
  "exactly once",
]);

console.log("Business Phase 6B atomic manufacturing start contract: PASS");
