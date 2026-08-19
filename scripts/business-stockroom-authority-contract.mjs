#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("backend/supabase/migrations/20260819064100_business_stockroom_read_v2.sql", "utf8");

assert.match(migration, /create or replace function public\.resolve_player_business_v2/u);
assert.match(migration, /business_ownership_positions/u);
assert.match(migration, /ownership\.status = 'active'/u);
assert.match(migration, /ownership\.ended_at is null/u);
assert.match(migration, /ownership_model_version = 1[\s\S]{0,120}owner_player_id = p_player_id/u);
assert.match(migration, /create or replace function public\.read_owned_business_stockroom_v2/u);
assert.match(migration, /account\.account_kind = 'warehouse'/u);
assert.match(migration, /public\.inventory_holdings/u);
assert.match(migration, /public\.game_items/u);
assert.match(migration, /holding\.average_unit_cost/u);
assert.match(migration, /holding\.quantity_owned - holding\.quantity_reserved/u);
assert.match(migration, /grant execute on function public\.read_owned_business_stockroom_v2\(uuid,uuid\) to service_role/u);
assert.doesNotMatch(migration, /public\.business_inventory/u);
assert.doesNotMatch(migration, /unit_input_cost|unit_labor_cost|quality_score/iu);

console.log("Business Phase 3A canonical Stockroom authority contract passed.");
