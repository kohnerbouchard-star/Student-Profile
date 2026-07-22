import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationFiles = [
  "20260721130000_add_crafting_item_definitions_v1.sql",
  "20260721130100_add_crafting_recipe_definitions_v1.sql",
  "20260721130200_add_game_physical_economy_scope_v1.sql",
  "20260721130300_add_crafting_job_reservations_v1.sql",
  "20260721130400_add_equipment_and_item_effect_state_v1.sql",
  "20260721130500_add_crafting_salvage_admin_security_v1.sql",
  "20260721131000_add_crafting_pack_import_v1.sql",
  "20260721131200_harden_crafting_pack_import_identity_v1.sql",
  "20260721131300_harden_crafting_pack_version_identity_v1.sql",
  "20260721131500_add_crafting_pack_activation_v1.sql",
  "20260721132000_add_player_crafting_read_v1.sql",
  "20260721132500_add_player_crafting_job_start_v1.sql",
  "20260721133000_add_player_crafting_cancel_v1.sql",
  "20260721133500_add_player_crafting_claim_v1.sql",
  "20260721133700_add_player_equipment_slots_v1.sql",
  "20260721134000_add_player_item_effects_v1.sql",
  "20260721134500_add_player_equipment_salvage_v1.sql",
  "20260721135000_add_admin_crafting_read_v1.sql",
  "20260721135500_add_admin_crafting_recovery_v1.sql",
  "20260721135700_add_admin_crafting_supply_and_grants_v1.sql",
];
const migrationEntries = await Promise.all(migrationFiles.map(async (name) => [
  name,
  await readFile(new URL(`../backend/supabase/migrations/${name}`, import.meta.url), "utf8"),
]));
const migrationByName = new Map(migrationEntries);
const migration = migrationEntries.map(([, value]) => value).join("\n");

const source = (name) => {
  const value = migrationByName.get(name);
  assert.equal(typeof value, "string", `missing migration source: ${name}`);
  return value;
};

const mutationGuard = "perform public.assert_player_crafting_mutation_allowed_v1";

test("controller-assigned Crafting migration family is exact and ordered", () => {
  assert.equal(migrationFiles.length, 20);
  const versions = migrationFiles.map((name) => Number(name.slice(0, 14)));
  assert.deepEqual([...versions].sort((left, right) => left - right), versions);
  assert.ok(versions.every((version) => version >= 20260721130000 && version <= 20260721139999));
  assert.equal(new Set(versions).size, 20);
});

test("crafting migration provides atomic reservation and exactly-once output contracts", () => {
  for (const token of [
    "create table if not exists public.inventory_reservations",
    "create table if not exists public.crafting_jobs",
    "start_player_crafting_job_v1",
    "cancel_player_crafting_job_v1",
    "claim_player_crafting_job_v1",
    "output_granted_at",
    "for update",
    "quantity_reserved",
    "if v_job.status='claimed'",
  ]) assert.match(migration, new RegExp(token, "i"));
});

test("item effects are closed allowlist and keep audit history", () => {
  for (const token of [
    "physical_economy_safe_effect_handler_v1",
    "item_effect_grants",
    "item_effect_history",
    "ITEM_EFFECT_COOLDOWN_ACTIVE",
    "stacking_rule",
    "cooldown_seconds",
  ]) assert.match(migration, new RegExp(token, "i"));
});

test("durability and repair remain disabled", () => {
  assert.match(migration, /durabilityEnabled',false/);
  assert.match(migration, /repairEnabled',false/);
  assert.doesNotMatch(migration, /durability_current|durability_max|repair_player/i);
});

test("browser access is denied for physical economy tables and functions", () => {
  assert.match(migration, /revoke all on table public\.%I from anon, authenticated/);
  assert.match(migration, /revoke all on function public\.start_player_crafting_job_v1/);
  assert.match(migration, /revoke all on function public\.use_player_inventory_item_effect_v1/);
  assert.match(migration, /revoke all on function public\.assert_player_crafting_mutation_allowed_v1/);
  assert.match(migration, /revoke all on function public\.import_physical_economy_pack_unchecked_v1/);
});

test("migration has balanced function bodies", () => {
  assert.equal((migration.match(/\$function\$/g) || []).length % 2, 0);
});

test("pack activation fails closed until PR 163 authorizes every quantitative gate", () => {
  for (const token of [
    "PHYSICAL_ECONOMY_PACK_NOT_AUTHORIZED",
    "activationAuthorization,catalogAuthorized",
    "activationAuthorization,recipeAuthorized",
    "activationAuthorization,calibrationAuthorized",
    "downstreamContractValidated",
    "balanceGateSummary,failures",
  ]) assert.match(migration, new RegExp(token, "i"));
});

test("pack import binds exact merged Seed identity and digest", () => {
  const value = source("20260721131200_harden_crafting_pack_import_identity_v1.sql");
  for (const token of [
    "PHYSICAL_ECONOMY_PACK_IDENTITY_MISMATCH",
    "econovaria.beta-seed-pack.v1",
    "1.0.0-beta",
    "190d09e5d0be729388af1d8e304d27e630bef40fba1f055c4272377f39b3f5e8",
    "6ced5aa36e60dfbd82620463f4f4bf6f56a349dd",
    "contentDigest",
    "sourceContracts,packDigest",
    "import_physical_economy_pack_unchecked_v1",
  ]) assert.match(value, new RegExp(token.replaceAll(".", "\\."), "i"));
});

test("crafting resolves deterministic quality and failure without duplicate grants", () => {
  for (const token of [
    "crafting_deterministic_basis_points_v1",
    "failureBasisPoints",
    "failureRoll",
    "qualityScore",
    "DETERMINISTIC_QUALITY_FAILURE",
    "consume_approved",
    "release_all",
    "output_granted_at",
  ]) assert.match(migration, new RegExp(token, "i"));
});

test("salvage enforces a player-scoped recraft cooldown and committed success", () => {
  for (const token of [
    "CRAFTING_RECRAFT_COOLDOWN_ACTIVE",
    "recraft_cooldown_seconds",
    "recraftAvailableAt",
    "committed",
    "refreshRequired",
  ]) assert.match(migration, new RegExp(token, "i"));
});

test("new Player mutations require an active game lifecycle", () => {
  const guardSource = source("20260721130500_add_crafting_salvage_admin_security_v1.sql");
  assert.match(guardSource, /g\.status\s*=\s*'active'/i);
  assert.match(guardSource, /g\.lifecycle_state\s*=\s*'active'/i);
  for (const name of [
    "20260721133000_add_player_crafting_cancel_v1.sql",
    "20260721133500_add_player_crafting_claim_v1.sql",
    "20260721133700_add_player_equipment_slots_v1.sql",
    "20260721134000_add_player_item_effects_v1.sql",
    "20260721134500_add_player_equipment_salvage_v1.sql",
  ]) assert.match(source(name), new RegExp(mutationGuard.replaceAll(".", "\\."), "i"));
  assert.match(source("20260721132500_add_player_crafting_job_start_v1.sql"), /g\.lifecycle_state='active'/i);
});

test("committed terminal retries are resolved before lifecycle rejection", () => {
  const pairs = [
    ["20260721133000_add_player_crafting_cancel_v1.sql", "if v_job.status='cancelled'"],
    ["20260721133500_add_player_crafting_claim_v1.sql", "if v_job.status='claimed'"],
    ["20260721133700_add_player_equipment_slots_v1.sql", "v_idempotency.status='COMPLETED'"],
    ["20260721134000_add_player_item_effects_v1.sql", "return v_existing.response_body"],
    ["20260721134500_add_player_equipment_salvage_v1.sql", "return jsonb_build_object('outcome','replayed'"],
  ];
  for (const [name, replayToken] of pairs) {
    const value = source(name);
    assert.ok(value.indexOf(replayToken) >= 0, `${name} lacks replay contract`);
    assert.ok(value.indexOf(replayToken) < value.indexOf(mutationGuard), `${name} rejects lifecycle before committed replay`);
  }
});

test("equipment slot changes use concurrency-safe idempotency", () => {
  const value = source("20260721133700_add_player_equipment_slots_v1.sql");
  for (const token of [
    "mutation_idempotency_keys",
    "players.me.equipment.slot",
    "request_hash",
    "EQUIPMENT_IDEMPOTENCY_CONFLICT",
    "for update",
    "status='COMPLETED'",
    "response_body",
  ]) assert.match(value, new RegExp(token.replaceAll(".", "\\."), "i"));
});

test("Crafting workflow is read-only and temporary transport is absent", async () => {
  const workflow = await readFile(new URL("../.github/workflows/crafting-item-runtime.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /pull_request_target|contents:\s*write|git\s+(push|commit|merge)|update-ref/i);
  const githubFiles = await walk(new URL("../.github/", import.meta.url));
  const prohibited = githubFiles.filter((path) =>
    /crafting.*(payload|transport|materializ|generator|reconstruct|snapshot|finaliz)|(payload|transport|materializ|generator|reconstruct|snapshot|finaliz).*crafting/i.test(path)
  );
  assert.deepEqual(prohibited, []);
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) results.push(...await walk(url));
    else results.push(url.pathname);
  }
  return results;
}
