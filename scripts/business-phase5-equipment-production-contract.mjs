#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = path.join(
  root,
  "backend/supabase/migrations/20260823100400_business_production_equipment_capacity_v2.sql",
);
if (!fs.existsSync(file)) throw new Error(`Missing Phase 5B migration: ${file}`);
const sql = fs.readFileSync(file, "utf8");

function requireTokens(tokens) {
  for (const token of tokens) {
    if (!sql.includes(token)) throw new Error(`Phase 5B missing: ${token}`);
  }
}
function forbidTokens(tokens) {
  const source = sql.toLowerCase();
  for (const token of tokens) {
    if (source.includes(token.toLowerCase())) {
      throw new Error(`Phase 5B contains forbidden token: ${token}`);
    }
  }
}

requireTokens([
  "reserved_equipment_minutes integer not null default 0",
  "equipment_authority_mode text not null default 'not_required'",
  "rename to run_business_production_labor_v2",
  "create or replace function public.run_business_production_v1",
  "from public.business_recipe_equipment_requirements",
  "current_business_equipment_period_key_v2",
  "v_requirement.minimum_instance_count",
  "v_requirement.capability_key = any(profile.capability_keys)",
  "order by installation.public_key",
  "for update of locked_installation, locked_instance",
  "reservation.status in ('reserved','active','consumed')",
  "perform public.reserve_business_equipment_v2",
  "BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE",
  "BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE",
  "from public.run_business_production_labor_v2",
  "perform public.transition_business_equipment_reservation_v2",
  "'consumed'",
  "equipment_authority_mode = 'canonical_equipment_v2'",
  "Production replay must never reserve equipment again.",
]);

forbidTokens([
  "create table public.equipment_instances",
  "create table if not exists public.equipment_instances",
  "create table public.physical_economy_item_definitions",
  "create table public.physical_economy_recipe_definitions",
  "create table public.inventory_holdings",
  "cron.schedule",
  "business_production_jobs",
  "durability_percent",
  "repair_cost",
]);

const reserveIndex = sql.indexOf("perform public.reserve_business_equipment_v2");
const settleIndex = sql.indexOf("from public.run_business_production_labor_v2", reserveIndex);
const consumeIndex = sql.indexOf("perform public.transition_business_equipment_reservation_v2", settleIndex);
if (!(reserveIndex >= 0 && settleIndex > reserveIndex && consumeIndex > settleIndex)) {
  throw new Error("Phase 5B must reserve equipment before production settlement and consume it after success.");
}

console.log("Business Phase 5B production equipment capacity contract: PASS");
