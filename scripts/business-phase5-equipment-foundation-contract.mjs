#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationNames = [
  "20260823100000_business_equipment_ownership_profiles_v2.sql",
  "20260823100100_business_recipe_equipment_requirements_v2.sql",
  "20260823100200_business_equipment_installation_schema_v2.sql",
  "20260823100210_business_equipment_materialization_v2.sql",
  "20260823100220_business_equipment_install_command_v2.sql",
  "20260823100300_business_equipment_reservation_schema_v2.sql",
  "20260823100310_business_equipment_reserve_command_v2.sql",
  "20260823100320_business_equipment_transition_status_read_v2.sql",
];
const migrationPaths = migrationNames.map((name) =>
  path.join(root, "backend/supabase/migrations", name)
);
const canonicalPaths = [
  "backend/supabase/migrations/20260721130000_add_crafting_item_definitions_v1.sql",
  "backend/supabase/migrations/20260721130100_add_crafting_recipe_definitions_v1.sql",
  "backend/supabase/migrations/20260721130400_add_equipment_and_item_effect_state_v1.sql",
  "backend/supabase/migrations/20260806120000_add_economic_asset_identity_and_accounts_v2.sql",
].map((name) => path.join(root, name));

for (const file of [...migrationPaths, ...canonicalPaths]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const migrations = Object.fromEntries(
  migrationPaths.map((file) => [path.basename(file), fs.readFileSync(file, "utf8")]),
);
const sql = Object.values(migrations).join("\n");
const canonical = canonicalPaths.map((file) => fs.readFileSync(file, "utf8")).join("\n");

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

requireTokens(canonical, "Canonical equipment authority", [
  "create table if not exists public.physical_economy_item_definitions",
  "create table if not exists public.physical_economy_recipe_definitions",
  "create table if not exists public.equipment_instances",
  "create table if not exists public.game_items",
  "create table if not exists public.inventory_accounts",
]);

forbidTokens(sql.toLowerCase(), "Phase 5 must reuse canonical authorities", [
  "create table public.physical_economy_item_definitions",
  "create table if not exists public.physical_economy_item_definitions",
  "create table public.physical_economy_recipe_definitions",
  "create table if not exists public.physical_economy_recipe_definitions",
  "create table public.game_items",
  "create table if not exists public.game_items",
  "create table public.inventory_accounts",
  "create table if not exists public.inventory_accounts",
  "create table public.inventory_holdings",
  "create table if not exists public.inventory_holdings",
  "create table public.equipment_instances",
  "create table if not exists public.equipment_instances",
]);

const ownership = migrations[migrationNames[0]];
requireTokens(ownership, "Equipment ownership/profile migration", [
  "alter column player_id drop not null",
  "economy_private.assign_equipment_instance_context_v2",
  "v_party.party_kind = 'player'",
  "v_party.party_kind = 'business'",
  "v_account.account_kind <> 'warehouse'",
  "new.player_id := null",
  "new.equipped_slot := null",
  "v_item.item_class <> 'equipment'",
  "not v_item.serialized",
  "business_equipment_capacity_profiles",
  "equipment_item_definition_id uuid not null",
  "references public.physical_economy_item_definitions",
  "base_capacity_minutes_per_period",
  "capability_keys text[]",
  "ensure_business_equipment_capacity_profile_v2",
  "coalesce(v_definition.tool_tags",
]);

const requirements = migrations[migrationNames[1]];
requireTokens(requirements, "Recipe equipment requirement migration", [
  "business_recipe_equipment_requirements",
  "references public.physical_economy_recipe_definitions",
  "capability_key text not null",
  "fixed_equipment_minutes_per_run",
  "equipment_minutes_per_unit",
  "minimum_instance_count",
  "sync_business_recipe_equipment_requirements_v2",
  "unnest(v_recipe.required_tools)",
  "canonical_required_tool_v1",
]);
forbidTokens(requirements.toLowerCase(), "Recipe requirement authority", [
  "jsonb_to_recordset",
  "p_required_tools",
  "p_equipment_minutes",
]);

const installation = migrations[migrationNames[2]];
requireTokens(installation, "Installation schema", [
  "create table if not exists public.business_equipment_installations",
  "equipment_instance_id uuid not null",
  "capacity_profile_id uuid not null",
  "business_equipment_installations_instance_unique",
  "guard_business_equipment_installation_v2",
  "account_row.account_kind = 'warehouse'",
  "party_row.party_kind = 'business'",
  "BUSINESS_EQUIPMENT_INSTALLATION_IDENTITY_IMMUTABLE",
  "BUSINESS_EQUIPMENT_INSTALLATION_RETIRED",
  "enable row level security",
]);

const materialize = migrations[migrationNames[3]];
requireTokens(materialize, "Equipment materialization command", [
  "materialize_owned_business_equipment_instance_v2",
  "from public.resolve_player_business_v2",
  "v_holding.quantity_owned",
  "select count(*)::integer",
  "v_instance_count >= v_holding.quantity_owned",
  "BUSINESS_EQUIPMENT_ALL_UNITS_MATERIALIZED",
  "insert into public.equipment_instances",
  "player_id",
  "v_account.id",
  "business.equipment.materialized",
]);

const installCommand = migrations[migrationNames[4]];
requireTokens(installCommand, "Equipment install command", [
  "install_owned_business_equipment_v2",
  "from public.resolve_player_business_v2",
  "BUSINESS_EQUIPMENT_INSTANCE_PLAYER_OWNED",
  "business_equipment_installations_instance_unique",
  "ensure_business_equipment_capacity_profile_v2",
  "business.equipment.installed",
  "mutation_idempotency_keys",
]);

const reservationSchema = migrations[migrationNames[5]];
requireTokens(reservationSchema, "Equipment reservation schema", [
  "create table if not exists public.business_equipment_reservations",
  "period_key ~ '^equipment:[1-9][0-9]*$'",
  "status in ('reserved','active','consumed','released')",
  "business_equipment_reservations_intent_unique",
  "business_equipment_reservations_idempotency_unique",
  "guard_business_equipment_reservation_v2",
  "for update",
  "existing.status in ('reserved','active','consumed')",
  "BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE",
  "BUSINESS_EQUIPMENT_RESERVATION_IDENTITY_IMMUTABLE",
  "BUSINESS_EQUIPMENT_RESERVATION_TERMINAL",
]);

const reserve = migrations[migrationNames[6]];
requireTokens(reserve, "Equipment reserve command", [
  "current_business_equipment_period_key_v2",
  "current_business_payroll_period_key_v2",
  "regexp_replace(v_payroll_key, '^payroll:', 'equipment:')",
  "reserve_business_equipment_v2",
  "BUSINESS_EQUIPMENT_PERIOD_MISMATCH",
  "BUSINESS_EQUIPMENT_CAPABILITY_MISMATCH",
  "BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT",
  "existing.status in ('reserved','active','consumed')",
  "v_used_minutes + p_reserved_minutes > v_profile.base_capacity_minutes_per_period",
]);

const recoveryRead = migrations[migrationNames[7]];
requireTokens(recoveryRead, "Equipment recovery/read migration", [
  "transition_business_equipment_reservation_v2",
  "set_owned_business_equipment_status_v2",
  "BUSINESS_EQUIPMENT_RESERVATION_ACTIVE",
  "read_owned_business_equipment_v2",
  "capability_keys text[]",
  "capacity_minutes integer",
  "reserved_minutes integer",
  "consumed_minutes integer",
  "available_minutes integer",
  "idle_minutes integer",
  "utilization_basis_points integer",
  "durability_supported boolean",
  "repair_supported boolean",
  "false,",
  "Internal UUIDs, inventory accounts, and trusted ownership fields remain server-private.",
]);

const readStart = recoveryRead.indexOf(
  "create or replace function public.read_owned_business_equipment_v2",
);
const readLanguage = recoveryRead.indexOf("language plpgsql", readStart);
if (readStart < 0 || readLanguage <= readStart) {
  throw new Error("Unable to isolate public Business equipment read contract.");
}
const readSignature = recoveryRead.slice(readStart, readLanguage);
const returnsStart = readSignature.indexOf("returns table");
if (returnsStart < 0) throw new Error("Public Business equipment read omits returns table.");
const readReturns = readSignature.slice(returnsStart);
forbidTokens(readReturns.toLowerCase(), "Public equipment read signature", [
  " uuid",
  "business_id",
  "installation_id",
  "equipment_instance_id",
  "inventory_account_id",
  "game_session_id",
  "player_id",
]);

forbidTokens(sql.toLowerCase(), "Phase 5A exclusions", [
  "create table public.business_production_jobs",
  "create table if not exists public.business_production_jobs",
  "create table public.business_store_offers",
  "create table if not exists public.business_store_offers",
  "create table public.business_ipos",
  "create table if not exists public.business_ipos",
  "cron.schedule",
  "durability_percent",
  "repair_cost",
]);

console.log("Business Phase 5A equipment authority foundation contract: PASS");
