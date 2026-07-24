declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const V1_MIGRATION = new URL(
  "../../../../supabase/migrations/20260724030000_add_game_creation_provisioning_orchestrator_v1.sql",
  import.meta.url,
);
const V2_MIGRATION = new URL(
  "../../../../supabase/migrations/20260724120000_add_full_game_feature_activation_v2.sql",
  import.meta.url,
);
const STORY_REPAIR_MIGRATION = new URL(
  "../../../../supabase/migrations/20260724121000_repair_demo_storyline_activation_conflict_v2.sql",
  import.meta.url,
);

Deno.test("Admin game creation provisions one isolated multiplayer game atomically", async () => {
  const sql = await Deno.readTextFile(V1_MIGRATION);

  assertIncludes(sql, "begin;");
  assertIncludes(sql, "commit;");
  assertIncludes(sql, "provisioning_status text not null default 'pending'");
  assertIncludes(sql, "game_creation_provisioning_requests_scope_unique unique (staff_user_id, idempotency_key)");
  assertIncludes(sql, "create or replace function public.create_provisioned_game_v1");
  assertIncludes(sql, "security definer");
  assertIncludes(sql, "GAME_PROVISIONING_SERVICE_ROLE_REQUIRED");
  assertIncludes(sql, "release_row.status = 'applied_active'");
  assertIncludes(sql, "release_row.target_environment in ('local', 'test', 'staging')");

  assertIncludes(sql, "member_row.object_type = 'stock_template'");
  assertIncludes(sql, ") = 240");
  assertIncludes(sql, "member_row.object_type = 'game_contract'");
  assertIncludes(sql, ") = 30");
  assertIncludes(sql, "member_row.object_type = 'store_item'");
  assertIncludes(sql, ") = 50");
  assertIncludes(sql, "world_location_states where game_session_id = release_row.game_session_id) = 50");
  assertIncludes(sql, "world_route_states where game_session_id = release_row.game_session_id) = 13");
  assertIncludes(sql, "world_country_runtime where game_session_id = release_row.game_session_id) = 10");
  assertIncludes(sql, "arrival_class_grant_runtime where game_session_id = release_row.game_session_id) = 8");

  assertIncludes(sql, "'disabled'");
  assertIncludes(sql, "'draft'");
  assertIncludes(sql, "'provisioning'");
  assertIncludes(sql, "insert into public.game_session_stock_assets");
  assertIncludes(sql, "insert into public.game_session_contracts");
  assertIncludes(sql, "insert into public.store_items");
  assertIncludes(sql, "insert into public.world_runtime_instances");
  assertIncludes(sql, "insert into public.world_location_states");
  assertIncludes(sql, "insert into public.world_route_states");
  assertIncludes(sql, "insert into public.world_country_runtime");
  assertIncludes(sql, "insert into public.arrival_class_grant_runtime");
  assertIncludes(sql, "insert into public.message_game_policies");
  assertIncludes(sql, "insert into public.marketplace_policies");

  assertIncludes(sql, "GAME_PROVISIONING_VERIFICATION_FAILED");
  assertIncludes(sql, "set status = 'active'");
  assertIncludes(sql, "lifecycle_state = 'active'");
  assertIncludes(sql, "provisioning_status = 'ready'");
  assertIncludes(sql, "game_join_code_hash = v_join_hash");
  assertIncludes(sql, "game_join_code_status = 'active'");
  assertIncludes(sql, "extensions.digest(v_join_code, 'sha256')");
  assertIncludes(sql, "'joinCode', v_join_code");
  assertIncludes(sql, "'joinCode', null");
  assertIncludes(sql, "'joinCodeReissueRequired', true");

  assertIncludes(sql, "'transactionRolledBack', true");
  assertIncludes(sql, "'crafting', 'blocked_by_catalog_authority'");
  assertIncludes(sql, "'story', 'not_published'");
  assertIncludes(sql, "'arrivalGrantProcessor', 'not_implemented'");
  assertIncludes(sql, "from public, anon, authenticated");
  assertIncludes(sql, "to service_role");

  assertNotIncludes(sql, "insert into public.players");
  assertNotIncludes(sql, "insert into public.account_balances");
  assertNotIncludes(sql, "insert into public.inventory_holdings");
  assertNotIncludes(sql, "insert into public.player_progression_profiles");
  assertNotIncludes(sql, "grant execute on function public.create_provisioned_game_v1(uuid, text, jsonb, text, text) to authenticated");
});

Deno.test("full activation v2 publishes executable Story and Arrival services without bypassing Crafting authority", async () => {
  const sql = await Deno.readTextFile(V2_MIGRATION);

  assertIncludes(sql, "create table if not exists public.arrival_package_runtime_definitions");
  assertIncludes(sql, "create table if not exists public.arrival_class_grant_definitions");
  assertIncludes(sql, "create table if not exists public.player_arrival_grant_receipts");
  assertIncludes(sql, "create table if not exists public.game_feature_activation_evidence");

  assertIncludes(sql, "create or replace function public.apply_arrival_grant_command_v1");
  assertIncludes(sql, "create trigger process_arrival_grant_command_after_insert");
  assertIncludes(sql, "create or replace function public.process_arrival_grant_commands_v1");
  assertIncludes(sql, "public.record_player_ledger_entry");
  assertIncludes(sql, "public.ensure_player_progression_profile_v1");
  assertIncludes(sql, "public.initialize_player_travel_state_v1");
  assertIncludes(sql, "status = 'completed'");

  assertIncludes(sql, "create trigger ensure_player_progression_after_activation");
  assertIncludes(sql, "create or replace function public.complete_game_feature_activation_v2");
  assertIncludes(sql, "public.initialize_demo_storyline_for_game");
  assertIncludes(sql, "insert into public.game_session_physical_economy_packs");
  assertIncludes(sql, "insert into public.game_session_recipe_availability");
  assertIncludes(sql, "create or replace function public.create_provisioned_game_v2");
  assertIncludes(sql, "public.create_provisioned_game_v1");
  assertIncludes(sql, "'full-game-feature-activation-v2'");

  assertIncludes(sql, "release_row.target_environment in ('local', 'test', 'staging')");
  assertIncludes(sql, "FULL_GAME_ACTIVATION_NON_PRODUCTION_RELEASE_REQUIRED");
  assertIncludes(sql, "ARRIVAL_GRANT_NON_PRODUCTION_RELEASE_REQUIRED");
  assertIncludes(sql, "v_crafting_status text := 'blocked'");
  assertIncludes(sql, "v_crafting_status := 'active'");
  assertIncludes(sql, "'craftingAuthorityRequired', v_crafting_status <> 'active'");

  assertIncludes(sql, "grant execute on function public.create_provisioned_game_v2");
  assertIncludes(sql, "to service_role");
  assertNotIncludes(sql, "to authenticated");
  assertNotIncludes(sql, "productionAuthorized', true");
});

Deno.test("Story activation conflict ambiguity is repaired forward-only", async () => {
  const sql = await Deno.readTextFile(STORY_REPAIR_MIGRATION);

  assertIncludes(sql, "create or replace function public.initialize_demo_storyline_for_game");
  assertIncludes(sql, "on conflict on constraint game_session_storylines_scope_unique");
  assertNotIncludes(sql, "on conflict (game_session_id, storyline_id)");
  assertIncludes(sql, "revoke all on function public.initialize_demo_storyline_for_game(uuid, text)");
  assertIncludes(sql, "from public, anon, authenticated");
  assertIncludes(sql, "grant execute on function public.initialize_demo_storyline_for_game(uuid, text)");
  assertIncludes(sql, "to service_role");
});

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) throw new Error(`Expected migration to include ${expected}`);
}

function assertNotIncludes(text: string, forbidden: string): void {
  if (text.includes(forbidden)) throw new Error(`Migration must not include ${forbidden}`);
}
