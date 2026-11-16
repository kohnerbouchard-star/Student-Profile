declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATIONS = [
  "20260826093000_player_banking_fx_v1.sql",
  "20260826094000_player_banking_fx_commands_v1.sql",
  "20260826095000_player_banking_fx_order_commands_v1.sql",
  "20260826096000_player_banking_fx_settlement_v1.sql",
].map((name) =>
  new URL(`../../../../supabase/migrations/${name}`, import.meta.url)
);

const PUBLIC_RPCS = [
  "list_player_bank_accounts_v1",
  "list_player_bank_activity_v1",
  "get_player_banking_fx_overview_v1",
  "list_player_fx_rate_history_v1",
  "list_player_fx_orders_v1",
  "create_player_fx_quote_v1",
  "submit_player_standard_fx_order_v1",
  "execute_player_instant_fx_v1",
  "cancel_player_standard_fx_order_v1",
] as const;

Deno.test("Player Banking FX migrations expose only the reviewed service RPC surface", async () => {
  const sql = await migrationSql();
  for (const routine of PUBLIC_RPCS) {
    assertMatch(
      sql,
      new RegExp(`create or replace function public\\.${routine}\\s*\\(`, "u"),
    );
    const body = functionBody(sql, routine);
    assertMatch(body, /security definer/u);
    assertMatch(body, /set search_path\s*=/u);
    assertMatch(
      sql,
      new RegExp(
        `revoke all on function public\\.${routine}\\s*\\([^;]+from public, anon, authenticated`,
        "u",
      ),
    );
    assertMatch(
      sql,
      new RegExp(
        `grant execute on function public\\.${routine}\\s*\\([^;]+to service_role`,
        "u",
      ),
    );
  }
  assertDoesNotMatch(
    sql,
    /grant execute[^;]+to anon|grant execute[^;]+to authenticated/u,
  );
});

Deno.test("Player Banking FX read RPCs expose fixing-scoped currencies and no internal account identity", async () => {
  const sql = await migrationSql();
  const accounts = functionBody(sql, "list_player_bank_accounts_v1");
  const overview = functionBody(sql, "get_player_banking_fx_overview_v1");
  const history = functionBody(sql, "list_player_fx_rate_history_v1");
  const orders = functionBody(sql, "list_player_fx_orders_v1");

  for (
    const field of [
      "account_key",
      "account_kind",
      "currency_code",
      "posted_amount",
      "held_amount",
      "available_amount",
    ]
  ) assertMatch(accounts, new RegExp(`\\b${field}\\b`, "u"));
  assertMatch(accounts, /account_row\.public_key/u);
  assertDoesNotMatch(accounts, /returns table\s*\([^)]*account_id/u);

  assertMatch(overview, /'currencies'/u);
  assertMatch(overview, /'currency_code'/u);
  assertMatch(overview, /'minor_unit'/u);
  assertMatch(overview, /fx_fixing_currency_values/u);
  assertMatch(overview, /currency_row\.status = 'active'/u);
  assertMatch(
    history,
    /target_value\.units_per_eco\s*\/\s*source_value\.units_per_eco/u,
  );
  assertMatch(orders, /receipt_row\.public_key/u);
});

Deno.test("Player Banking FX quote and order RPCs preserve exact replay and single-consumer boundaries", async () => {
  const sql = await migrationSql();
  const quote = functionBody(sql, "create_player_fx_quote_v1");
  const standard = functionBody(sql, "submit_player_standard_fx_order_v1");
  const instant = functionBody(sql, "execute_player_instant_fx_v1");
  const cancel = functionBody(sql, "cancel_player_standard_fx_order_v1");

  assertMatch(quote, /p_source_amount numeric/u);
  assertMatch(quote, /fx_quote_source_precision_invalid/u);
  assertMatch(quote, /'outcome', 'replayed', 'quote'/u);
  assertMatch(quote, /'outcome', 'applied', 'quote'/u);
  assertMatch(
    quote,
    /least\(v_now \+ interval '120 seconds', v_runtime\.next_due_at\)/u,
  );

  for (const command of [standard, instant]) {
    assertMatch(
      command,
      /where quote_row\.public_key = p_quote_key[^$]+for update/u,
    );
    assertMatch(command, /fx_quote_consumed/u);
    assertMatch(command, /'outcome', 'replayed', 'order'/u);
    assertMatch(command, /'outcome', 'applied'/u);
  }
  assertMatch(standard, /create_bank_account_hold_v1/u);
  assertMatch(standard, /standard_payer_reservation/u);
  assertMatch(standard, /standard_(?:clearing|reserve)_reservation/u);
  assertMatch(instant, /settle_player_fx_order_v1/u);
  assertMatch(cancel, /v_runtime\.status <> 'pending'/u);
  assertMatch(cancel, /release_bank_account_hold_v1/u);
  assertMatch(cancel, /'outcome', 'replayed', 'order'/u);
});

async function migrationSql(): Promise<string> {
  return compact((await Promise.all(
    MIGRATIONS.map((migration) => Deno.readTextFile(migration)),
  )).join("\n"));
}

function functionBody(sql: string, routine: string): string {
  const start = sql.indexOf(`function public.${routine}`);
  if (start < 0) throw new Error(`${routine} definition missing`);
  const endMarker = "$function$;";
  const end = sql.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${routine} body terminator missing`);
  return sql.slice(start, end + endMarker.length);
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
