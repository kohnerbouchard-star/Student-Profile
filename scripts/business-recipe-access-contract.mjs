#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const accessMigrationPath = "backend/supabase/migrations/20260819064000_business_recipe_access_v2.sql";
const readMigrationPath = "backend/supabase/migrations/20260819064110_business_recipe_access_read_v2.sql";
const handlerPath = "backend/src/domains/business/api/playerBusinessHttpHandler.ts";
const routePath = "backend/src/domains/business/api/playerBusinessRoutePaths.ts";
const repositoryPath = "backend/src/domains/business/infrastructure/supabaseBusinessRecipeReadRepository.ts";

const [accessSource, readSource, handlerSource, routeSource, repositorySource] = await Promise.all([
  readFile(accessMigrationPath, "utf8"),
  readFile(readMigrationPath, "utf8"),
  readFile(handlerPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(repositoryPath, "utf8"),
]);

assert.match(accessSource.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(accessSource.trim(), /commit;$/u);
assert.match(accessSource, /create table if not exists public\.business_recipe_access/u);
assert.match(accessSource, /references public\.physical_economy_recipe_definitions\(id\)/u);
assert.match(accessSource, /game_session_recipe_availability/u);
assert.match(accessSource, /availability\.enabled = true/u);
assert.match(accessSource, /grant_business_recipe_access_v2/u);
assert.match(accessSource, /grant execute on function public\.grant_business_recipe_access_v2[\s\S]{0,180}to service_role/iu);
assert.match(accessSource, /force row level security/iu);
assert.match(accessSource, /revoke all on table public\.business_recipe_access from public, anon, authenticated/iu);

assert.match(readSource.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(readSource.trim(), /commit;$/u);
assert.match(readSource, /create or replace function public\.read_owned_business_recipes_v2/u);
assert.match(readSource, /public\.resolve_player_business_v2\(p_game_session_id, p_player_id\)/u);
assert.match(readSource, /from public\.business_recipe_access access/u);
assert.match(readSource, /join public\.physical_economy_recipe_definitions recipe/u);
assert.match(readSource, /left join public\.game_session_recipe_availability availability/u);
assert.match(readSource, /left join public\.game_session_physical_economy_packs pack_scope/u);
assert.match(readSource, /cardinality\(availability\.country_codes\) = 0/u);
assert.match(readSource, /v_business\.country_code = any\(availability\.country_codes\)/u);
assert.match(readSource, /coalesce\(availability\.scarcity_band, 'unavailable'\) <> 'unavailable'/u);
assert.match(readSource, /access\.revoked_at is null/u);
assert.match(readSource, /revoke all on function public\.read_owned_business_recipes_v2\(uuid,uuid\)[\s\S]{0,100}from public, anon, authenticated/iu);
assert.match(readSource, /grant execute on function public\.read_owned_business_recipes_v2\(uuid,uuid\)[\s\S]{0,100}to service_role/iu);
assert.doesNotMatch(readSource, /physical_economy_recipe_inputs|physical_economy_recipe_outputs/iu);
assert.doesNotMatch(readSource, /\bbusiness_id\s+uuid\b/iu);

assert.match(routeSource, /tail\[0\] === "business" && tail\[1\] === "recipes"/u);
assert.match(routeSource, /kind: "businessRead", resource: "recipes"/u);
assert.match(repositorySource, /read_owned_business_recipes_v2/u);
assert.match(repositorySource, /p_game_session_id: input\.gameSessionId/u);
assert.match(repositorySource, /p_player_id: input\.playerId/u);
assert.match(handlerSource, /import \{ readBusinessRecipes \} from "\.\.\/infrastructure\/supabaseBusinessRecipeReadRepository\.ts";/u);
assert.match(handlerSource, /route\.resource === "recipes"[\s\S]{0,180}readBusinessRecipes\(client, publicScope\)/u);
assert.match(handlerSource, /\{ recipes: await readBusinessRecipes\(client, publicScope\) \}/u);

for (const forbidden of [
  /create table[^;]*business_recipe_definitions/iu,
  /create table[^;]*business_recipe_inputs/iu,
  /create table[^;]*business_recipe_outputs/iu,
  /unit_input_cost/iu,
  /unit_labor_cost/iu,
  /quality_score/iu,
]) {
  assert.doesNotMatch(accessSource, forbidden);
  assert.doesNotMatch(readSource, forbidden);
}

console.log("Business Phase 2 canonical recipe-access and read contract passed.");
