#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "backend/supabase/migrations/20260819064000_business_recipe_access_v2.sql";
const source = await readFile(migrationPath, "utf8");

assert.match(source.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(source.trim(), /commit;$/u);
assert.match(source, /create table if not exists public\.business_recipe_access/u);
assert.match(source, /references public\.physical_economy_recipe_definitions\(id\)/u);
assert.match(source, /game_session_recipe_availability/u);
assert.match(source, /availability\.enabled = true/u);
assert.match(source, /grant_business_recipe_access_v2/u);
assert.match(source, /grant execute on function public\.grant_business_recipe_access_v2[\s\S]{0,180}to service_role/iu);
assert.match(source, /force row level security/iu);
assert.match(source, /revoke all on table public\.business_recipe_access from public, anon, authenticated/iu);

for (const forbidden of [
  /create table[^;]*business_recipe_definitions/iu,
  /create table[^;]*business_recipe_inputs/iu,
  /create table[^;]*business_recipe_outputs/iu,
  /unit_input_cost/iu,
  /unit_labor_cost/iu,
  /quality_score/iu,
]) {
  assert.doesNotMatch(source, forbidden);
}

console.log("Business Phase 2 canonical recipe-access contract passed.");
