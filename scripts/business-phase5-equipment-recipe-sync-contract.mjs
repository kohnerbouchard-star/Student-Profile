#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = path.join(
  root,
  "backend/supabase/migrations/20260823100110_business_recipe_equipment_requirement_sync_v2.sql",
);
if (!fs.existsSync(migration)) throw new Error(`Missing recipe equipment sync migration: ${migration}`);
const sql = fs.readFileSync(migration, "utf8");

for (const token of [
  "sync_business_recipe_equipment_requirements_trigger_v2",
  "perform public.sync_business_recipe_equipment_requirements_v2(new.id)",
  "after insert or update of required_tools, base_duration_seconds, status",
  "on public.physical_economy_recipe_definitions",
  "requirement.source_kind = 'canonical_required_tool_v1'",
  "requirement.status = 'active'",
  "revoke all on function economy_private.sync_business_recipe_equipment_requirements_trigger_v2()",
  "grant execute on function economy_private.sync_business_recipe_equipment_requirements_trigger_v2()",
]) {
  if (!sql.includes(token)) throw new Error(`Equipment recipe synchronization missing: ${token}`);
}

for (const forbidden of [
  "create table public.physical_economy_recipe_definitions",
  "create table public.business_recipe_definitions",
  "p_required_tools",
]) {
  if (sql.toLowerCase().includes(forbidden.toLowerCase())) {
    throw new Error(`Equipment recipe synchronization contains forbidden authority: ${forbidden}`);
  }
}

console.log("Business Phase 5 equipment recipe synchronization contract: PASS");
