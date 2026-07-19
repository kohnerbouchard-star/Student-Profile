import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
let differences = 0;

async function read(relativePath) {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

async function writeExpected(relativePath, expected) {
  const absolutePath = path.join(repoRoot, relativePath);
  let current = null;
  try {
    current = await read(relativePath);
  } catch {
    current = null;
  }
  if (current === expected) return;
  differences += 1;
  if (checkOnly) {
    console.error(`Configurable market-timezone drift: ${relativePath}`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, expected, "utf8");
}

async function patch(relativePath, transform) {
  const source = await read(relativePath);
  const expected = transform(source);
  await writeExpected(relativePath, expected);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found for ${label}.`);
  }
  return source.replace(before, after);
}

const configModule = `export const DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE = "Asia/Seoul";

export interface StockMarketWindowConfig {
  readonly timeZone: string;
  readonly source: "game_setting" | "server_fallback";
}

export class StockMarketWindowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockMarketWindowConfigError";
  }
}

export function isValidStockMarketTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeServerStockMarketTimeZone(value: unknown): string {
  return isValidStockMarketTimeZone(value)
    ? value.trim()
    : DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE;
}

export function readStockMarketWindowConfig(
  value: unknown,
  serverFallbackTimeZone: string = DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE,
): StockMarketWindowConfig {
  const fallback = normalizeServerStockMarketTimeZone(serverFallbackTimeZone);
  const record = isRecord(value) ? value : {};
  const rawTimeZone = record.timezone;

  if (rawTimeZone === undefined || rawTimeZone === null || rawTimeZone === "") {
    return { timeZone: fallback, source: "server_fallback" };
  }

  if (!isValidStockMarketTimeZone(rawTimeZone)) {
    throw new StockMarketWindowConfigError(
      "stockMarketWindow.timezone must be a valid IANA timezone.",
    );
  }

  return { timeZone: rawTimeZone.trim(), source: "game_setting" };
}

export function normalizeStockMarketWindowSetting(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const rawTimeZone = value.timezone;
  if (rawTimeZone === undefined || rawTimeZone === null || rawTimeZone === "") {
    return { ...value };
  }
  if (!isValidStockMarketTimeZone(rawTimeZone)) {
    throw new StockMarketWindowConfigError(
      "stockMarketWindow.timezone must be a valid IANA timezone.",
    );
  }
  return { ...value, timezone: rawTimeZone.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
`;

const openStateModule = `interface StockMarketOpenStateRpcError {
  readonly message: string;
  readonly code?: string;
}

interface StockMarketOpenStateRpcResponse<T> {
  readonly data: T | null;
  readonly error: StockMarketOpenStateRpcError | null;
}

export interface StockMarketOpenStateClient {
  rpc<T = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<StockMarketOpenStateRpcResponse<T>>;
}

export class StockMarketOpenStateReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockMarketOpenStateReadError";
  }
}

export async function readStockMarketOpenState(
  client: StockMarketOpenStateClient,
  gameSessionId: string,
  at: Date = new Date(),
): Promise<boolean> {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new StockMarketOpenStateReadError("A valid market evaluation time is required.");
  }

  const response = await client.rpc<boolean>("is_stock_market_open_at", {
    p_game_session_id: gameSessionId,
    p_at: at.toISOString(),
  });

  if (response.error || typeof response.data !== "boolean") {
    throw new StockMarketOpenStateReadError(
      "Authoritative stock market session state could not be read.",
    );
  }

  return response.data;
}
`;

const configTest = `import {
  DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE,
  normalizeServerStockMarketTimeZone,
  normalizeStockMarketWindowSetting,
  readStockMarketWindowConfig,
  StockMarketWindowConfigError,
} from "./stockMarketWindowConfig.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("missing timezone uses the server-owned fallback", () => {
  assertEquals(readStockMarketWindowConfig({}), {
    timeZone: DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE,
    source: "server_fallback",
  });
  assertEquals(readStockMarketWindowConfig({}, "America/New_York"), {
    timeZone: "America/New_York",
    source: "server_fallback",
  });
});

Deno.test("configured IANA timezone is authoritative", () => {
  assertEquals(readStockMarketWindowConfig({ timezone: " Europe/London " }), {
    timeZone: "Europe/London",
    source: "game_setting",
  });
  assertEquals(normalizeStockMarketWindowSetting({ timezone: "America/Chicago" }), {
    timezone: "America/Chicago",
  });
});

Deno.test("invalid configured timezone fails instead of trusting a client clock", () => {
  assertThrows(() => readStockMarketWindowConfig({ timezone: "Browser/Local" }));
  assertThrows(() => normalizeStockMarketWindowSetting({ timezone: "UTC+9" }));
});

Deno.test("invalid server fallback resolves to the server default", () => {
  assertEquals(
    normalizeServerStockMarketTimeZone("not-a-timezone"),
    DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE,
  );
});

function assertThrows(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    if (error instanceof StockMarketWindowConfigError) return;
    throw error;
  }
  throw new Error("Expected StockMarketWindowConfigError.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      \`Assertion failed. Actual: \${JSON.stringify(actual)} Expected: \${JSON.stringify(expected)}\`,
    );
  }
}
`;

const openStateTest = `import { readStockMarketOpenState } from "./supabaseStockMarketWindowRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("market open-state reader uses game scope and server time", async () => {
  const client = new FakeClient(true);
  const at = new Date("2026-07-20T00:00:00.000Z");
  const result = await readStockMarketOpenState(client, "game-1", at);
  assertEquals(result, true);
  assertEquals(client.calls, [{
    functionName: "is_stock_market_open_at",
    args: { p_game_session_id: "game-1", p_at: at.toISOString() },
  }]);
});

class FakeClient {
  readonly calls: unknown[] = [];
  constructor(private readonly result: boolean) {}
  async rpc(functionName: string, args: unknown) {
    this.calls.push({ functionName, args });
    return { data: this.result, error: null };
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(\`Assertion failed: \${JSON.stringify(actual)} !== \${JSON.stringify(expected)}\`);
  }
}
`;

const migration = `-- Make the stock-market timezone an explicit per-game setting.
-- The browser/device timezone is never consulted. Existing and legacy games use
-- the server-owned Asia/Seoul fallback until staff saves stockMarketWindow.timezone.

update public.game_settings
set stock_market_window = jsonb_set(
  coalesce(stock_market_window, '{}'::jsonb),
  '{timezone}',
  to_jsonb('Asia/Seoul'::text),
  true
)
where nullif(btrim(stock_market_window ->> 'timezone'), '') is null;

create or replace function public.stock_market_timezone_for_game(
  p_game_session_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  select nullif(btrim(settings.stock_market_window ->> 'timezone'), '')
  into v_timezone
  from public.game_settings settings
  where settings.game_session_id = p_game_session_id;

  v_timezone := coalesce(v_timezone, 'Asia/Seoul');

  if not exists (
    select 1 from pg_timezone_names zone where zone.name = v_timezone
  ) then
    raise exception 'STOCK_MARKET_INVALID_TIMEZONE_SETTING';
  end if;

  return v_timezone;
end;
$$;

revoke all on function public.stock_market_timezone_for_game(uuid)
from public, anon, authenticated;
grant execute on function public.stock_market_timezone_for_game(uuid)
to service_role;

create or replace function public.is_stock_market_open_at(
  p_game_session_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_local timestamp without time zone;
  v_iso_day integer;
  v_local_time time without time zone;
begin
  if p_game_session_id is null or p_at is null then
    return false;
  end if;

  if not exists (
    select 1 from public.game_sessions session
    where session.id = p_game_session_id
      and session.status = 'active'
  ) then
    return false;
  end if;

  v_timezone := public.stock_market_timezone_for_game(p_game_session_id);
  v_local := p_at at time zone v_timezone;
  v_iso_day := extract(isodow from v_local)::integer;
  v_local_time := v_local::time;

  return v_iso_day between 1 and 5
    and v_local_time >= time '08:00'
    and v_local_time < time '17:00';
end;
$$;

comment on function public.is_stock_market_open_at(uuid, timestamptz) is
  'Authoritative game-scoped stock-session decision using game_settings.stock_market_window.timezone and a server-owned fallback.';

revoke all on function public.is_stock_market_open_at(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.is_stock_market_open_at(uuid, timestamptz)
to service_role;

create or replace function public.execute_stock_market_order_calendar_gated(
  p_game_session_id uuid,
  p_player_session_id uuid,
  p_stock_asset_id uuid,
  p_side text,
  p_quantity numeric,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  game_session_id uuid,
  player_session_id uuid,
  player_id uuid,
  stock_asset_id uuid,
  ticker text,
  side text,
  quantity numeric,
  execution_price numeric,
  gross_value numeric,
  status text,
  rejection_reason text,
  cash_balance numeric,
  cash_currency_code text,
  holding_quantity numeric,
  average_cost numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.stock_orders existing_order
    where existing_order.game_session_id = p_game_session_id
      and existing_order.player_session_id = p_player_session_id
      and existing_order.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  ) and not public.is_stock_market_open_at(p_game_session_id, now()) then
    raise exception 'STOCK_TRADING_MARKET_CLOSED';
  end if;

  return query
  select result.*
  from public.execute_stock_market_order(
    p_game_session_id,
    p_player_session_id,
    p_stock_asset_id,
    p_side,
    p_quantity,
    p_idempotency_key
  ) result;
end;
$$;

revoke all on function public.execute_stock_market_order_calendar_gated(
  uuid, uuid, uuid, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.execute_stock_market_order_calendar_gated(
  uuid, uuid, uuid, text, numeric, text
) to service_role;
`;

const migrationTest = `declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const BASE_MIGRATION =
  "supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql";
const CONFIG_MIGRATION =
  "supabase/migrations/20260719133000_make_stock_market_timezone_configurable_v1.sql";

Deno.test("exchange calendar migrations gate orders with a game-configured timezone", async () => {
  const base = await Deno.readTextFile(BASE_MIGRATION);
  const config = await Deno.readTextFile(CONFIG_MIGRATION);
  assertIncludes(base, "create or replace function public.execute_stock_market_order_calendar_gated");
  assertIncludes(config, "stock_market_window ->> 'timezone'");
  assertIncludes(config, "from pg_timezone_names");
  assertIncludes(config, "create or replace function public.is_stock_market_open_at(");
  assertIncludes(config, "p_game_session_id uuid");
  assertIncludes(config, "public.is_stock_market_open_at(p_game_session_id, now())");
  assertIncludes(config, "STOCK_TRADING_MARKET_CLOSED");
  assertIncludes(config, "to_jsonb('Asia/Seoul'::text)");
});

function assertIncludes(source: string, expected: string): void {
  if (!source.includes(expected)) {
    throw new Error(\`Expected migration to include: \${expected}\`);
  }
}
`;

await writeExpected("backend/src/domains/stocks/calendars/stockMarketWindowConfig.ts", configModule);
await writeExpected("backend/src/domains/stocks/calendars/stockMarketWindowConfig.test.ts", configTest);
await writeExpected("backend/src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.ts", openStateModule);
await writeExpected("backend/src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.test.ts", openStateTest);
await writeExpected("backend/supabase/migrations/20260719133000_make_stock_market_timezone_configurable_v1.sql", migration);
await writeExpected("backend/src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts", migrationTest);

await patch("backend/src/domains/stocks/calendars/stockMarketExchangeCalendar.ts", (source) => {
  let expected = replaceOnce(
    source,
    "export const STOCK_EXCHANGE_CODES = [",
    `import { isValidStockMarketTimeZone } from "./stockMarketWindowConfig.ts";\n\nexport const STOCK_EXCHANGE_CODES = [`,
    "calendar timezone validator import",
  );
  expected = replaceOnce(
    expected,
    `export interface StockMarketSessionState {`,
    `export interface StockMarketCalendarOverrides {\n  readonly timeZone?: string;\n}\n\nexport interface StockMarketSessionState {`,
    "calendar override contract",
  );
  expected = replaceOnce(
    expected,
    `export function evaluateStockMarketSession(\n  exchangeCode: StockExchangeCode,\n  at: Date = new Date(),\n): StockMarketSessionState {\n  assertValidDate(at);\n  const calendar = getStockExchangeCalendar(exchangeCode);`,
    `export function evaluateStockMarketSession(\n  exchangeCode: StockExchangeCode,\n  at: Date = new Date(),\n  overrides: StockMarketCalendarOverrides = {},\n): StockMarketSessionState {\n  assertValidDate(at);\n  const calendar = resolveCalendar(exchangeCode, overrides);`,
    "calendar configured evaluation",
  );
  expected = replaceOnce(
    expected,
    `export function isStockMarketOpenAt(\n  at: Date,\n  exchangeCode: StockExchangeCode = DEFAULT_STOCK_EXCHANGE_CODE,\n): boolean {\n  assertValidDate(at);\n  return evaluateCore(getStockExchangeCalendar(exchangeCode), at).status ===\n    "open";\n}\n\nfunction evaluateCore(`,
    `export function isStockMarketOpenAt(\n  at: Date,\n  exchangeCode: StockExchangeCode = DEFAULT_STOCK_EXCHANGE_CODE,\n  overrides: StockMarketCalendarOverrides = {},\n): boolean {\n  assertValidDate(at);\n  return evaluateCore(resolveCalendar(exchangeCode, overrides), at).status ===\n    "open";\n}\n\nfunction resolveCalendar(\n  exchangeCode: StockExchangeCode,\n  overrides: StockMarketCalendarOverrides,\n): StockExchangeCalendarDefinition {\n  const calendar = getStockExchangeCalendar(exchangeCode);\n  if (overrides.timeZone === undefined) return calendar;\n  if (!isValidStockMarketTimeZone(overrides.timeZone)) {\n    throw new Error("A valid IANA market timezone is required.");\n  }\n  return { ...calendar, timeZone: overrides.timeZone.trim() };\n}\n\nfunction evaluateCore(`,
    "calendar override resolver",
  );
  return expected;
});

await patch("backend/src/domains/stocks/calendars/stockMarketExchangeCalendar.test.ts", (source) => replaceOnce(
  source,
  `Deno.test("minute keys are stable and exchange scoped", () => {`,
  `Deno.test("configured timezone changes the authoritative session", () => {\n  const at = new Date("2026-07-20T13:00:00.000Z");\n  assertEquals(evaluateStockMarketSession("FGX", at).status, "closed");\n  assertEquals(\n    evaluateStockMarketSession("FGX", at, { timeZone: "America/New_York" }).status,\n    "open",\n  );\n});\n\nDeno.test("minute keys are stable and exchange scoped", () => {`,
  "calendar timezone override test",
));

await patch("backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts", (source) => {
  let expected = source.replace(
    `import {\n  DEFAULT_STOCK_EXCHANGE_CODE,\n  evaluateStockMarketSession,\n  type StockMarketSessionState,\n} from "../calendars/stockMarketExchangeCalendar.ts";`,
    `import {\n  readStockMarketOpenState,\n} from "../infrastructure/supabaseStockMarketWindowRepository.ts";`,
  );
  expected = replaceOnce(
    expected,
    `  readonly now?: () => Date;\n  readonly evaluateMarketSession?: (at: Date) => StockMarketSessionState;`,
    `  readonly now?: () => Date;\n  readonly readMarketOpenState?: (\n    client: EdgeSupabaseClient,\n    gameSessionId: string,\n    at: Date,\n  ) => Promise<boolean>;`,
    "runner open-state dependency",
  );
  expected = replaceOnce(
    expected,
    `    const marketSession = (dependencies.evaluateMarketSession ??\n      ((at: Date) =>\n        evaluateStockMarketSession(DEFAULT_STOCK_EXCHANGE_CODE, at)))(\n          (dependencies.now ?? (() => new Date()))(),\n        );\n\n    if (marketSession.status !== "open") {\n      throw new StockMarketRunnerError(\n        "stock_market_closed",\n        marketSession.nextTransitionAt\n          ? \`Stock market is closed. The next calendar transition is \${marketSession.nextTransitionAt}.\`\n          : "Stock market is closed.",\n        409,\n      );\n    }`,
    `    const marketOpen = await (dependencies.readMarketOpenState ??\n      readStockMarketOpenState)(\n        serviceClient,\n        body.gameSessionId,\n        (dependencies.now ?? (() => new Date()))(),\n      );\n\n    if (!marketOpen) {\n      throw new StockMarketRunnerError(\n        "stock_market_closed",\n        "Stock market is closed for the configured game timezone.",\n        409,\n      );\n    }`,
    "runner game-configured gate",
  );
  return expected;
});

await patch("backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts", (source) => {
  let expected = replaceOnce(
    source,
    `  readonly now?: () => Date;\n  readonly calculateNextTick?: (`,
    `  readonly now?: () => Date;\n  readonly readMarketOpenState?: () => Promise<boolean>;\n  readonly calculateNextTick?: (`,
    "runner test open-state option",
  );
  expected = replaceOnce(
    expected,
    `    now: options.now ?? (() => new Date("2026-07-20T00:00:00.000Z")),\n    createRepository: () => repository,`,
    `    now: options.now ?? (() => new Date("2026-07-20T00:00:00.000Z")),\n    readMarketOpenState: options.readMarketOpenState ?? (async () => true),\n    createRepository: () => repository,`,
    "runner test default open state",
  );
  expected = expected.replace(
    `      now: () => new Date("2026-07-19T00:00:00.000Z"),`,
    `      readMarketOpenState: async () => false,`,
  );
  return expected;
});

await patch("backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts", (source) => {
  let expected = source.replace(
    `import {\n  DEFAULT_STOCK_EXCHANGE_CODE,\n  evaluateStockMarketSession,\n} from "../../stocks/calendars/stockMarketExchangeCalendar.ts";`,
    `import {\n  readStockMarketOpenState,\n} from "../../stocks/infrastructure/supabaseStockMarketWindowRepository.ts";`,
  );
  expected = replaceOnce(
    expected,
    `      gameSession,\n      publicMarket,`,
    `      gameSession,\n      marketOpen,\n      publicMarket,`,
    "dashboard market-open destructuring",
  );
  expected = replaceOnce(
    expected,
    `      this.readGameSession(input.gameSessionId),\n      this.readPublicStockMarket(input.gameSessionId),`,
    `      this.readGameSession(input.gameSessionId),\n      readStockMarketOpenState(this.client, input.gameSessionId, this.now()),\n      this.readPublicStockMarket(input.gameSessionId),`,
    "dashboard authoritative market-state read",
  );
  expected = replaceOnce(
    expected,
    `        marketStatus: gameSession.status === "active"\n          ? evaluateStockMarketSession(\n            DEFAULT_STOCK_EXCHANGE_CODE,\n            this.now(),\n          ).status\n          : "closed",`,
    `        marketStatus: gameSession.status === "active" && marketOpen\n          ? "open"\n          : "closed",`,
    "dashboard configured market status",
  );
  return expected;
});

await patch("backend/src/domains/game-sessions/api/gameSettingsHttpHandler.ts", (source) => {
  let expected = replaceOnce(
    source,
    `import {\n  isRecord,`,
    `import {\n  normalizeStockMarketWindowSetting,\n  StockMarketWindowConfigError,\n} from "../../stocks/calendars/stockMarketWindowConfig.ts";\nimport {\n  isRecord,`,
    "settings timezone config import",
  );
  expected = replaceOnce(
    expected,
    `    if (error instanceof EdgeActivationError) {`,
    `    if (error instanceof StockMarketWindowConfigError) {\n      return jsonError(400, {\n        code: "invalid_stock_market_timezone",\n        message: error.message,\n        retryable: false,\n      });\n    }\n\n    if (error instanceof EdgeActivationError) {`,
    "settings invalid timezone response",
  );
  expected = replaceOnce(
    expected,
    `    payload.stock_market_window = body.stockMarketWindow;`,
    `    payload.stock_market_window = normalizeStockMarketWindowSetting(\n      body.stockMarketWindow,\n    );`,
    "settings timezone validation",
  );
  return expected;
});

await patch("backend/src/domains/game-sessions/application/createGame.ts", (source) => {
  let expected = replaceOnce(
    source,
    `import type { GameSessionRecord, UUID } from "../../../auth/types";`,
    `import type { GameSessionRecord, UUID } from "../../../auth/types";\nimport {\n  DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE,\n  normalizeStockMarketWindowSetting,\n} from "../../stocks/calendars/stockMarketWindowConfig";`,
    "create game timezone import",
  );
  expected = replaceOnce(
    expected,
    `    stockMarketWindow: normalizeJsonObject(input.stockMarketWindow),`,
    `    stockMarketWindow: normalizeStockMarketWindow(input.stockMarketWindow),`,
    "create game timezone default",
  );
  expected = replaceOnce(
    expected,
    `function normalizeJsonObject(value: JsonObject | null | undefined): JsonObject {`,
    `function normalizeStockMarketWindow(\n  value: JsonObject | null | undefined,\n): JsonObject {\n  try {\n    return normalizeStockMarketWindowSetting(\n      value ?? { timezone: DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE },\n    ) as JsonObject;\n  } catch {\n    throw new CreateGameValidationError(\n      "stockMarketWindow.timezone must be a valid IANA timezone.",\n    );\n  }\n}\n\nfunction normalizeJsonObject(value: JsonObject | null | undefined): JsonObject {`,
    "create game timezone normalizer",
  );
  return expected;
});

await patch("backend/package.json", (source) => {
  const document = JSON.parse(source);
  document.scripts["test:stock-market-calendar"] = [
    "deno test",
    "--allow-read=supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql,supabase/migrations/20260719133000_make_stock_market_timezone_configurable_v1.sql",
    "--config supabase/functions/deno.json",
    "--lock=supabase/functions/deno.lock",
    "--frozen",
    "src/domains/stocks/calendars/stockMarketWindowConfig.test.ts",
    "src/domains/stocks/calendars/stockMarketExchangeCalendar.test.ts",
    "src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts",
    "src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.test.ts",
    "src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.test.ts",
    "src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts",
  ].join(" ");
  return `${JSON.stringify(document, null, 2)}\n`;
});

await patch(".github/workflows/exchange-calendar-runtime-v1.yml", (source) => {
  let expected = source.replaceAll(
    "scripts/apply-exchange-calendar-runtime-v1.mjs",
    "scripts/apply-configurable-stock-market-timezone-v1.mjs",
  );
  expected = expected.replace(
    "integration drift check",
    "configurable timezone drift check",
  );
  return expected;
});

await patch("backend/src/domains/stocks/README.md", (source) => {
  if (source.includes("### Configurable game timezone")) return source;
  return `${source.trimEnd()}\n\n### Configurable game timezone\n\nThe authoritative timezone is stored at \`game_settings.stock_market_window.timezone\` as an IANA timezone. Browser and device timezones are never used for market decisions. Existing games and missing settings use the server-owned \`Asia/Seoul\` fallback. Game creation writes the fallback into the setting, staff PATCH requests validate configured values, and the runner, dashboard, and order RPC all read the game-scoped server decision.\n`;
});

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? "Verified" : "Applied"} configurable stock-market timezone integration.`);
}
