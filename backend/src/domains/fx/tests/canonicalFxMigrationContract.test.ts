declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260825223806_canonical_fx_authority_v1.sql",
  import.meta.url,
);

Deno.test("canonical FX migration installs one ECO-valued fixing authority", async () => {
  const sql = compact(await Deno.readTextFile(MIGRATION));

  for (
    const table of [
      "fx_policy_versions",
      "fx_fixings",
      "fx_fixing_currency_values",
      "fx_fixing_macro_snapshots",
      "fx_story_shock_authorizations",
      "fx_fixing_story_shocks",
    ]
  ) {
    assertMatch(
      sql,
      new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "u"),
    );
    assertMatch(
      sql,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "u",
      ),
    );
  }
  assertMatch(
    sql,
    /create table(?: if not exists)? private\.fx_runtime_state\b/u,
  );
  assertMatch(sql, /units_per_eco numeric\(38,\s*18\)/u);
  assertMatch(sql, /currency_kind/u);
  assertMatch(sql, /global_settlement/u);
  assertMatch(sql, /'eco'/u);
  assertMatch(sql, /units_per_eco[^;]*>\s*0/u);
});

Deno.test("canonical FX migration owns the local 08:00 lease and immutable application boundary", async () => {
  const sql = compact(await Deno.readTextFile(MIGRATION));

  for (
    const routine of [
      "game_timezone_for_game_v1",
      "claim_due_fx_games_v1",
      "load_fx_fixing_input_v1",
      "apply_fx_fixing_v1",
      "fail_fx_fixing_claim_v1",
      "resolve_fx_rate_v1",
      "get_current_fx_fixing_v1",
      "list_fx_fixing_history_v1",
      "get_fx_runtime_status_v1",
      "configure_fx_runtime_scheduler_v1",
    ]
  ) {
    assertMatch(
      sql,
      new RegExp(
        `(?:create or replace|create) function public\\.${routine}\\b`,
        "u",
      ),
    );
  }
  assertMatch(
    sql,
    /stock_market_timezone_for_game[^$]+game_timezone_for_game_v1/u,
  );
  assertMatch(
    sql,
    /create trigger guard_fx_game_timezone before update of stock_market_window/u,
  );
  assertMatch(sql, /fx_timezone_immutable_after_bootstrap/u);
  assertMatch(sql, /08:00/u);
  assertMatch(sql, /for update skip locked/u);
  assertMatch(sql, /lease/u);
  assertMatch(sql, /retry_after_at/u);
  assertMatch(sql, /input_hash/u);
  assertMatch(sql, /fx_input_hash_conflict|fx_fixing_conflict/u);
  assertMatch(sql, /units_per_eco[^;]+\/[^;]+units_per_eco/u);
  assertMatch(sql, /currency_code\s*=\s*'eco'/u);
  const applyBody = functionBody(sql, "apply_fx_fixing_v1");
  assertMatch(applyBody, /fx_digest_jsonb_v1\([^)]*claimed_engine_input/u);
  assertMatch(applyBody, /canonicalinputjson/u);
  assertMatch(applyBody, /\[0-9\]\{18\}/u);
  assertMatch(applyBody, /previous[^;]+effective_at[^;]+fixing_effective_at/u);

  const schedulerBody = functionBody(sql, "configure_fx_runtime_scheduler_v1");
  assertMatch(schedulerBody, /\* \* \* \* \*/u);
  assertMatch(schedulerBody, /fx-orchestrator/u);
  assertMatch(schedulerBody, /runtime_scheduler_tokens/u);
});

Deno.test("Story volatility queues immutable next-fixing authorizations and retires pair writers", async () => {
  const sql = compact(await Deno.readTextFile(MIGRATION));
  const storyBody = functionBody(sql, "apply_story_currency_volatility_v1");

  assertMatch(storyBody, /fx_story_shock_authorizations/u);
  assertMatch(storyBody, /on conflict|command_key/u);
  assertDoesNotMatch(storyBody, /insert into public\.currency_exchange_rates/u);
  assertMatch(
    sql,
    /drop trigger[^;]+currency_exchange_rates|drop trigger[^;]+initialize_currency_exchange_rates/u,
  );
  assertMatch(sql, /currency_exchange_rates[^;]+legacy/u);
  assertMatch(
    sql,
    /create or replace function public\.convert_currency_amount\b/u,
  );
  assertMatch(
    sql,
    /function public\.convert_currency_amount\b[^$]+language plpgsql volatile/u,
  );
});

Deno.test("FX persistence is service-only, RLS protected, and append-only", async () => {
  const sql = compact(await Deno.readTextFile(MIGRATION));

  assertMatch(
    sql,
    /revoke all on (?:all tables in schema public|table public\.fx_fixings)[^;]+anon[^;]+authenticated/u,
  );
  assertMatch(
    sql,
    /grant execute on function public\.claim_due_fx_games_v1[^;]+service_role/u,
  );
  assertMatch(
    sql,
    /grant execute on function public\.apply_fx_fixing_v1[^;]+service_role/u,
  );
  assertMatch(
    sql,
    /revoke all on function public\.apply_fx_fixing_v1[^;]+public[^;]+anon[^;]+authenticated/u,
  );
  assertMatch(sql, /guard[^;]+immutable|immutable[^;]+trigger/u);
  assertMatch(sql, /security definer/u);
  assertMatch(sql, /set search_path\s*=/u);
  assertMatch(
    sql,
    /revoke all on table private\.fx_runtime_state[^;]+service_role/u,
  );
  assertMatch(
    sql,
    /revoke all on table public\.fx_fixings[^;]+service_role/u,
  );
  assertMatch(
    sql,
    /revoke all on function public\.initialize_fx_authority_for_game_v1[^;]+service_role/u,
  );
  assertDoesNotMatch(sql, /service_role_key|sb_secret_|bearer eyj/iu);
});

Deno.test("FX bootstrap and compatibility cutover preserve legacy evidence", async () => {
  const sql = compact(await Deno.readTextFile(MIGRATION));
  const bootstrapBody = functionBody(
    sql,
    "initialize_fx_authority_for_game_v1",
  );

  assertMatch(
    sql,
    /initialize_fx_authority_for_game_v1|bootstrap_fx_authority_for_game_v1/u,
  );
  assertMatch(sql, /provisioning_status[^;]+ready/u);
  assertMatch(sql, /1e-?8|0\.00000001/u);
  assertMatch(sql, /cutover_status\s*=\s*'blocked'/u);
  assertDoesNotMatch(sql, /'cutoverstatus',\s*'cutover_blocked'/u);
  assertMatch(sql, /p_allow_policy_baseline/u);
  assertMatch(sql, /fx_legacy_matrix_missing/u);
  assertMatch(sql, /bootstrap/u);
  assertMatch(bootstrapBody, /private\.fx_runtime_state[^;]+for update/u);
  assertMatch(
    bootstrapBody,
    /order by fixing_row\.effective_at desc[^;]+fixing_row\.calculated_at desc/u,
  );
  assertMatch(
    sql,
    /function private\.ensure_ready_game_fx_v1.*?cutover_status = 'ready'.*?return new/u,
  );
  assertDoesNotMatch(sql, /delete from public\.currency_exchange_rates/u);
  assertDoesNotMatch(sql, /update public\.currency_exchange_rates/u);
});

function functionBody(sql: string, routine: string): string {
  const start = sql.indexOf(`function public.${routine}`);
  if (start < 0) throw new Error(`${routine} definition missing`);
  const next = sql.indexOf("create or replace function public.", start + 1);
  return sql.slice(start, next < 0 ? sql.length : next);
}

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, " ").trim();
}

function assertMatch(value: string, pattern: RegExp): void {
  if (!pattern.test(value)) throw new Error(`Expected SQL to match ${pattern}`);
}

function assertDoesNotMatch(value: string, pattern: RegExp): void {
  if (pattern.test(value)) {
    throw new Error(`Expected SQL not to match ${pattern}`);
  }
}
