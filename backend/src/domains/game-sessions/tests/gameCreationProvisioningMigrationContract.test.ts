declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260724030000_add_game_creation_provisioning_orchestrator_v1.sql",
  import.meta.url,
);

Deno.test("Admin game creation provisions one isolated multiplayer game atomically", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

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

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) throw new Error(`Expected migration to include ${expected}`);
}

function assertNotIncludes(text: string, forbidden: string): void {
  if (text.includes(forbidden)) throw new Error(`Migration must not include ${forbidden}`);
}
