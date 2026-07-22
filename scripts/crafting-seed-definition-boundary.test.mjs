import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readMigration = (name) => readFile(
  new URL(`../backend/supabase/migrations/${name}`, import.meta.url),
  "utf8",
);
const literal = (value) => new RegExp(
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  "i",
);

const itemSchema = await readMigration("20260721140000_add_crafting_item_definitions_v1.sql");
const recipeSchema = await readMigration("20260721140100_add_crafting_recipe_definitions_v1.sql");
const importer = await readMigration("20260721141000_add_crafting_pack_import_v1.sql");
const identity = await readMigration("20260721141200_harden_crafting_pack_import_identity_v1.sql");
const activation = await readMigration("20260721141500_add_crafting_pack_activation_v1.sql");
const start = await readMigration("20260721142500_add_player_crafting_job_start_v1.sql");

test("Seed re-import preserves stable pack, item, and recipe identities", () => {
  assert.match(itemSchema, /unique \(pack_key, content_version, content_digest\)/i);
  assert.match(itemSchema, /unique \(pack_id, item_key\)/i);
  assert.match(recipeSchema, /unique \(pack_id, recipe_key\)/i);
  assert.match(importer, /on conflict \(pack_key,content_version,content_digest\) do update/i);
  assert.match(importer, /on conflict \(pack_id,item_key\) do update/i);
  assert.match(importer, /on conflict \(pack_id,recipe_key\) do update/i);
  assert.match(importer, /returning id into v_recipe_id/i);
  assert.doesNotMatch(importer, /delete from public\.physical_economy_item_definitions/i);
  assert.doesNotMatch(importer, /delete from public\.physical_economy_recipe_definitions/i);
});

test("Pack import rejects divergent reuse of a committed idempotency key", () => {
  for (const token of [
    "PHYSICAL_ECONOMY_IMPORT_IDEMPOTENCY_CONFLICT",
    "v_event.target_key is distinct from v_pack_key",
    "v_event.outcome->>'contentVersion'",
    "v_event.outcome->>'contentDigest'",
    "v_event.outcome->>'sourceCommit'",
  ]) assert.match(identity, literal(token));
});

test("Pack activation preserves matching replays and blocks divergent or inactive mutations", () => {
  for (const token of [
    "PHYSICAL_ECONOMY_ACTIVATION_IDEMPOTENCY_CONFLICT",
    "v_event.target_key is distinct from v_pack_key",
    "v_event.outcome->>'contentVersion'",
    "PHYSICAL_ECONOMY_GAME_INACTIVE",
    "g.status='active'",
    "g.lifecycle_state='active'",
  ]) assert.match(activation, literal(token));
  assert.ok(
    activation.indexOf("return v_event.outcome || jsonb_build_object('replayed',true)") <
      activation.indexOf("PHYSICAL_ECONOMY_GAME_INACTIVE"),
    "committed activation replay must resolve before lifecycle rejection",
  );
});

test("Activation fails closed on missing, inactive, or unresolved definitions", () => {
  for (const token of [
    "PHYSICAL_ECONOMY_DEFINITION_CLOSURE_INVALID",
    "physical_economy_recipe_inputs",
    "physical_economy_recipe_outputs",
    "physical_economy_effect_definitions",
    "physical_economy_substitution_options",
    "physical_economy_salvage_rules",
    "game_session_recipe_availability",
    "i.status in ('disabled','retired')",
    "r.status in ('disabled','retired')",
  ]) assert.match(activation, literal(token));
});

test("Player job start requires active definitions and availability", () => {
  for (const token of [
    "gp.status='active'",
    "r.status='active'",
    "not v_availability.enabled",
    "v_availability.scarcity_band='unavailable'",
    "store_items",
    "status='active'",
    "CRAFTING_INPUT_ITEM_UNAVAILABLE",
  ]) assert.match(start, literal(token));
});
