declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721010000_add_campaign_arrival_world_runtime_v1.sql",
  import.meta.url,
);

Deno.test("world runtime migration is forward-only, isolated, and atomic", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertIncludes(sql, "begin;");
  assertIncludes(sql, "commit;");
  for (const table of [
    "campaign_instances",
    "campaign_event_executions",
    "campaign_effect_commands",
    "campaign_admin_audit",
    "arrival_class_assignments",
    "arrival_grant_commands",
    "world_location_states",
    "world_route_states",
    "player_residency_states",
  ]) {
    assertIncludes(sql, `create table public.${table}`);
    assertIncludes(sql, `alter table public.${table} enable row level security`);
    assertIncludes(sql, `revoke all on table public.${table}`);
  }
  assertIncludes(sql, "unique (campaign_instance_id, execution_key)");
  assertIncludes(sql, "unique (game_session_id, idempotency_key)");
  assertIncludes(sql, "unique (game_session_id, player_id, idempotency_key)");
  assertIncludes(sql, "for update;");
  assertIncludes(sql, "execute_campaign_event_atomic_v1");
  assertIncludes(sql, "assign_arrival_class_atomic_v1");
  assertIncludes(sql, "security definer");
  assertIncludes(sql, "set search_path = public, pg_temp");
  assertIncludes(sql, "CAMPAIGN_TRANSITION_INVALID");
  assertIncludes(sql, "to service_role");
  const executeGrant = sql.match(/grant execute on function public\.execute_campaign_event_atomic_v1[\s\S]*?to service_role;/);
  if (!executeGrant) throw new Error("Missing service-role execute grant for campaign RPC.");
  for (const role of ["public", "anon", "authenticated"]) {
    assertIncludes(sql, "from public, anon, authenticated");
    assertNotIncludes(executeGrant[0], `to ${role}`);
  }
  assertNotIncludes(sql, "insert into public.players");
  assertNotIncludes(sql, "insert into public.world_location_states (");
});

Deno.test("campaign outbox accepts only reviewed purpose-built effects", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const kind of [
    "publish_news",
    "create_contract",
    "notify_players",
    "apply_market_shock",
    "set_store_scarcity",
    "set_route_state",
  ]) {
    assertIncludes(sql, `'${kind}'`);
  }
  assertNotIncludes(sql, "generic_json");
  assertNotIncludes(sql, "raw_sql");
  assertNotIncludes(sql, "eval(");
});

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) throw new Error(`Expected migration to include ${expected}`);
}

function assertNotIncludes(text: string, forbidden: string): void {
  if (text.includes(forbidden)) throw new Error(`Migration must not include ${forbidden}`);
}
