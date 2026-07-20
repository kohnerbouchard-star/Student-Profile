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
    console.error(`Required market-timezone drift: ${relativePath}`);
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

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found for ${label}.`);
  }
  return source.replace(before, after);
}

function replaceRegexRequired(source, pattern, replacement, label) {
  if (typeof replacement === "string" && source.includes(replacement)) return source;
  if (!pattern.test(source)) {
    throw new Error(`Patch pattern not found for ${label}.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const configModule = `export class StockMarketWindowConfigError extends Error {
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

export function normalizeRequiredStockMarketWindowSetting(
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new StockMarketWindowConfigError(
      "stockMarketWindow is required and must be a JSON object.",
    );
  }

  const rawTimeZone = value.timezone;
  if (!isValidStockMarketTimeZone(rawTimeZone)) {
    throw new StockMarketWindowConfigError(
      "stockMarketWindow.timezone is required and must be a valid IANA timezone.",
    );
  }

  return {
    ...value,
    timezone: rawTimeZone.trim(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
`;

const configTest = `import {
  normalizeRequiredStockMarketWindowSetting,
  StockMarketWindowConfigError,
} from "./stockMarketWindowConfig.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("one explicit game timezone is required", () => {
  assertThrows(() => normalizeRequiredStockMarketWindowSetting(undefined));
  assertThrows(() => normalizeRequiredStockMarketWindowSetting({}));
  assertThrows(() =>
    normalizeRequiredStockMarketWindowSetting({ timezone: "Browser/Local" })
  );
});

Deno.test("valid IANA timezone is normalized and retained", () => {
  assertEquals(
    normalizeRequiredStockMarketWindowSetting({
      timezone: " Europe/London ",
      opensAt: "08:00",
      closesAt: "17:00",
    }),
    {
      timezone: "Europe/London",
      opensAt: "08:00",
      closesAt: "17:00",
    },
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
    throw new StockMarketOpenStateReadError(
      "A valid server market-evaluation time is required.",
    );
  }

  const response = await client.rpc<boolean>("is_stock_market_open_at", {
    p_game_session_id: gameSessionId,
    p_at: at.toISOString(),
  });

  if (response.error || typeof response.data !== "boolean") {
    throw new StockMarketOpenStateReadError(
      "Authoritative game market-session state could not be read.",
    );
  }

  return response.data;
}
`;

const openStateTest = `import {
  readStockMarketOpenState,
} from "./supabaseStockMarketWindowRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market status is evaluated with game scope and server time", async () => {
  const client = new FakeClient(true);
  const at = new Date("2026-07-20T00:00:00.000Z");
  const result = await readStockMarketOpenState(client, "game-1", at);

  assertEquals(result, true);
  assertEquals(client.calls, [{
    functionName: "is_stock_market_open_at",
    args: {
      p_game_session_id: "game-1",
      p_at: at.toISOString(),
    },
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
    throw new Error(
      \`Assertion failed. Actual: \${JSON.stringify(actual)} Expected: \${JSON.stringify(expected)}\`,
    );
  }
}
`;

const migration = `-- Require one explicit game-level timezone for every stock exchange.
-- Existing rows receive a one-time Asia/Seoul migration value. Runtime contains
-- no fallback and never reads a browser or device timezone.

update public.game_settings
set stock_market_window = jsonb_set(
  coalesce(stock_market_window, '{}'::jsonb),
  '{timezone}',
  to_jsonb('Asia/Seoul'::text),
  true
)
where nullif(btrim(stock_market_window ->> 'timezone'), '') is null;

create or replace function public.validate_required_stock_market_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  if jsonb_typeof(new.stock_market_window) <> 'object' then
    raise exception 'STOCK_MARKET_TIMEZONE_REQUIRED';
  end if;

  v_timezone := nullif(btrim(new.stock_market_window ->> 'timezone'), '');

  if v_timezone is null then
    raise exception 'STOCK_MARKET_TIMEZONE_REQUIRED';
  end if;

  if not exists (
    select 1
    from pg_timezone_names zone
    where zone.name = v_timezone
  ) then
    raise exception 'STOCK_MARKET_TIMEZONE_INVALID';
  end if;

  new.stock_market_window := jsonb_set(
    new.stock_market_window,
    '{timezone}',
    to_jsonb(v_timezone),
    true
  );

  return new;
end;
$$;

drop trigger if exists validate_required_stock_market_timezone
on public.game_settings;

create trigger validate_required_stock_market_timezone
before insert or update of stock_market_window
on public.game_settings
for each row
execute function public.validate_required_stock_market_timezone();

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

  if v_timezone is null then
    raise exception 'STOCK_MARKET_TIMEZONE_REQUIRED';
  end if;

  if not exists (
    select 1
    from pg_timezone_names zone
    where zone.name = v_timezone
  ) then
    raise exception 'STOCK_MARKET_TIMEZONE_INVALID';
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
    select 1
    from public.game_sessions game_session
    where game_session.id = p_game_session_id
      and game_session.status = 'active'
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
  'Authoritative game-scoped market-session decision. One required game timezone applies to every exchange.';

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
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) from public, anon, authenticated;
grant execute on function public.execute_stock_market_order_calendar_gated(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) to service_role;
`;

const migrationTest = `declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const BASE_MIGRATION =
  "supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql";
const REQUIRED_TIMEZONE_MIGRATION =
  "supabase/migrations/20260719133000_require_stock_market_timezone_v1.sql";

Deno.test("one required game timezone gates all exchanges", async () => {
  const base = await Deno.readTextFile(BASE_MIGRATION);
  const required = await Deno.readTextFile(REQUIRED_TIMEZONE_MIGRATION);

  assertIncludes(
    base,
    "create or replace function public.execute_stock_market_order_calendar_gated",
  );
  assertIncludes(required, "to_jsonb('Asia/Seoul'::text)");
  assertIncludes(required, "validate_required_stock_market_timezone");
  assertIncludes(required, "STOCK_MARKET_TIMEZONE_REQUIRED");
  assertIncludes(required, "STOCK_MARKET_TIMEZONE_INVALID");
  assertIncludes(required, "from pg_timezone_names");
  assertIncludes(required, "p_game_session_id uuid");
  assertIncludes(
    required,
    "public.is_stock_market_open_at(p_game_session_id, now())",
  );
  assertNotIncludes(required, "coalesce(v_timezone");
});

function assertIncludes(source: string, expected: string): void {
  if (!source.includes(expected)) {
    throw new Error(\`Expected migration to include: \${expected}\`);
  }
}

function assertNotIncludes(source: string, unexpected: string): void {
  if (source.includes(unexpected)) {
    throw new Error(\`Expected migration to exclude: \${unexpected}\`);
  }
}
`;

await writeExpected(
  "backend/src/domains/stocks/calendars/stockMarketWindowConfig.ts",
  configModule,
);
await writeExpected(
  "backend/src/domains/stocks/calendars/stockMarketWindowConfig.test.ts",
  configTest,
);
await writeExpected(
  "backend/src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.ts",
  openStateModule,
);
await writeExpected(
  "backend/src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.test.ts",
  openStateTest,
);
await writeExpected(
  "backend/supabase/migrations/20260719133000_require_stock_market_timezone_v1.sql",
  migration,
);
await writeExpected(
  "backend/src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts",
  migrationTest,
);

await patch(
  "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts",
  (source) => {
    let expected = source;

    if (!expected.includes("supabaseStockMarketWindowRepository.ts")) {
      expected = replaceRegexRequired(
        expected,
        /import \{\n  DEFAULT_STOCK_EXCHANGE_CODE,\n  evaluateStockMarketSession,\n  type StockMarketSessionState,\n\} from "\.\.\/calendars\/stockMarketExchangeCalendar\.ts";/,
        `import {\n  readStockMarketOpenState,\n} from "../infrastructure/supabaseStockMarketWindowRepository.ts";`,
        "runner authoritative market-state import",
      );
    }

    if (!expected.includes("readonly readMarketOpenState?:")) {
      expected = replaceRequired(
        expected,
        `  readonly now?: () => Date;\n  readonly evaluateMarketSession?: (at: Date) => StockMarketSessionState;`,
        `  readonly now?: () => Date;\n  readonly readMarketOpenState?: (\n    client: EdgeSupabaseClient,\n    gameSessionId: string,\n    at: Date,\n  ) => Promise<boolean>;`,
        "runner market-state dependency",
      );
    }

    if (!expected.includes("const marketOpen = await")) {
      expected = replaceRegexRequired(
        expected,
        /    const marketSession = \(dependencies\.evaluateMarketSession \?\?[\s\S]*?    }\n\n    const storylineRunnerAfterTick/,
        `    const marketOpen = await (dependencies.readMarketOpenState ??\n      readStockMarketOpenState)(\n        serviceClient,\n        body.gameSessionId,\n        (dependencies.now ?? (() => new Date()))(),\n      );\n\n    if (!marketOpen) {\n      throw new StockMarketRunnerError(\n        "stock_market_closed",\n        "Stock market is closed in the configured game timezone.",\n        409,\n      );\n    }\n\n    const storylineRunnerAfterTick`,
        "runner game-scoped market gate",
      );
    }

    return expected;
  },
);

await patch(
  "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts",
  (source) => {
    let expected = source;

    if (!expected.includes("readonly readMarketOpenState?:")) {
      expected = replaceRequired(
        expected,
        `  readonly now?: () => Date;\n  readonly calculateNextTick?: (`,
        `  readonly now?: () => Date;\n  readonly readMarketOpenState?: () => Promise<boolean>;\n  readonly calculateNextTick?: (`,
        "runner test market-state option",
      );
    }

    if (!expected.includes("readMarketOpenState: options.readMarketOpenState")) {
      expected = replaceRequired(
        expected,
        `    now: options.now ?? (() => new Date("2026-07-20T00:00:00.000Z")),\n    createRepository: () => repository,`,
        `    now: options.now ?? (() => new Date("2026-07-20T00:00:00.000Z")),\n    readMarketOpenState: options.readMarketOpenState ?? (async () => true),\n    createRepository: () => repository,`,
        "runner test default market-state reader",
      );
    }

    expected = expected.replace(
      `      now: () => new Date("2026-07-19T00:00:00.000Z"),`,
      `      readMarketOpenState: async () => false,`,
    );

    return expected;
  },
);

await patch(
  "backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts",
  (source) => {
    let expected = source;

    if (!expected.includes("supabaseStockMarketWindowRepository.ts")) {
      expected = replaceRegexRequired(
        expected,
        /import \{\n  DEFAULT_STOCK_EXCHANGE_CODE,\n  evaluateStockMarketSession,\n\} from "\.\.\/\.\.\/stocks\/calendars\/stockMarketExchangeCalendar\.ts";/,
        `import {\n  readStockMarketOpenState,\n} from "../../stocks/infrastructure/supabaseStockMarketWindowRepository.ts";`,
        "dashboard authoritative market-state import",
      );
    }

    if (!expected.includes("      marketOpen,\n      publicMarket,")) {
      expected = replaceRequired(
        expected,
        `      gameSession,\n      publicMarket,`,
        `      gameSession,\n      marketOpen,\n      publicMarket,`,
        "dashboard market-state result",
      );
    }

    if (!expected.includes("readStockMarketOpenState(this.client")) {
      expected = replaceRequired(
        expected,
        `      this.readGameSession(input.gameSessionId),\n      this.readPublicStockMarket(input.gameSessionId),`,
        `      this.readGameSession(input.gameSessionId),\n      readStockMarketOpenState(this.client, input.gameSessionId, this.now()),\n      this.readPublicStockMarket(input.gameSessionId),`,
        "dashboard market-state query",
      );
    }

    if (!expected.includes("gameSession.status === \"active\" && marketOpen")) {
      expected = replaceRegexRequired(
        expected,
        /        marketStatus: gameSession\.status === "active"[\s\S]*?          : "closed",/,
        `        marketStatus: gameSession.status === "active" && marketOpen\n          ? "open"\n          : "closed",`,
        "dashboard market status",
      );
    }

    return expected;
  },
);

await patch(
  "backend/src/domains/game-sessions/api/gameSettingsHttpHandler.ts",
  (source) => {
    let expected = source;

    if (!expected.includes("StockMarketWindowConfigError")) {
      expected = replaceRequired(
        expected,
        `import {\n  isRecord,`,
        `import {\n  normalizeRequiredStockMarketWindowSetting,\n  StockMarketWindowConfigError,\n} from "../../stocks/calendars/stockMarketWindowConfig.ts";\nimport {\n  isRecord,`,
        "settings timezone validator import",
      );
    }

    if (!expected.includes("invalid_stock_market_timezone")) {
      expected = replaceRequired(
        expected,
        `  } catch (error) {\n    if (error instanceof EdgeActivationError) {`,
        `  } catch (error) {\n    if (error instanceof StockMarketWindowConfigError) {\n      return jsonError(400, {\n        code: "invalid_stock_market_timezone",\n        message: error.message,\n        retryable: false,\n      });\n    }\n\n    if (error instanceof EdgeActivationError) {`,
        "settings timezone validation response",
      );
    }

    if (!expected.includes("normalizeRequiredStockMarketWindowSetting(")) {
      expected = replaceRequired(
        expected,
        `    payload.stock_market_window = body.stockMarketWindow;`,
        `    payload.stock_market_window = normalizeRequiredStockMarketWindowSetting(\n      body.stockMarketWindow,\n    );`,
        "settings required timezone persistence",
      );
    }

    return expected;
  },
);

await patch(
  "backend/src/domains/game-sessions/application/createGame.ts",
  (source) => {
    let expected = source;

    if (!expected.includes("normalizeRequiredStockMarketWindowSetting")) {
      expected = replaceRequired(
        expected,
        `import type { GameSessionRecord, UUID } from "../../../auth/types";`,
        `import type { GameSessionRecord, UUID } from "../../../auth/types";\nimport {\n  normalizeRequiredStockMarketWindowSetting,\n  StockMarketWindowConfigError,\n} from "../../stocks/calendars/stockMarketWindowConfig";`,
        "create-game timezone validator import",
      );
    }

    if (!expected.includes("stockMarketWindow: normalizeRequiredStockMarketWindow(")) {
      expected = replaceRequired(
        expected,
        `    stockMarketWindow: normalizeJsonObject(input.stockMarketWindow),`,
        `    stockMarketWindow: normalizeRequiredStockMarketWindow(\n      input.stockMarketWindow,\n    ),`,
        "create-game required timezone",
      );
    }

    if (!expected.includes("function normalizeRequiredStockMarketWindow(")) {
      expected = replaceRequired(
        expected,
        `function normalizeJsonObject(value: JsonObject | null | undefined): JsonObject {`,
        `function normalizeRequiredStockMarketWindow(\n  value: JsonObject | null | undefined,\n): JsonObject {\n  try {\n    return normalizeRequiredStockMarketWindowSetting(value) as JsonObject;\n  } catch (error) {\n    if (error instanceof StockMarketWindowConfigError) {\n      throw new CreateGameValidationError(error.message);\n    }\n    throw error;\n  }\n}\n\nfunction normalizeJsonObject(value: JsonObject | null | undefined): JsonObject {`,
        "create-game required timezone normalizer",
      );
    }

    return expected;
  },
);

await patch(
  "backend/src/domains/licensing/contracts/activationRequestParser.ts",
  (source) => {
    let expected = source;

    if (!expected.includes("normalizeRequiredStockMarketWindowSetting")) {
      expected = replaceRequired(
        expected,
        `import type { JsonObject } from "../../../supabase/tableTypes.ts";`,
        `import type { JsonObject } from "../../../supabase/tableTypes.ts";\nimport {\n  normalizeRequiredStockMarketWindowSetting,\n  StockMarketWindowConfigError,\n} from "../../stocks/calendars/stockMarketWindowConfig.ts";`,
        "activation timezone validator import",
      );
    }

    if (!expected.includes("stockMarketWindow: parseRequiredStockMarketWindow(")) {
      expected = replaceRequired(
        expected,
        `    stockMarketWindow: parseOptionalJsonObject(value.stockMarketWindow),`,
        `    stockMarketWindow: parseRequiredStockMarketWindow(\n      value.stockMarketWindow,\n    ),`,
        "activation required timezone",
      );
    }

    if (!expected.includes("function parseRequiredStockMarketWindow(")) {
      expected = replaceRequired(
        expected,
        `function parseOptionalJsonObject(value: unknown): JsonObject | null {`,
        `function parseRequiredStockMarketWindow(value: unknown): JsonObject {\n  try {\n    return normalizeRequiredStockMarketWindowSetting(value) as JsonObject;\n  } catch (error) {\n    if (error instanceof StockMarketWindowConfigError) {\n      throw new LicensingActivationRequestParseError(\n        "invalid_activation_settings",\n        error.message,\n      );\n    }\n    throw error;\n  }\n}\n\nfunction parseOptionalJsonObject(value: unknown): JsonObject | null {`,
        "activation required timezone parser",
      );
    }

    return expected;
  },
);

await patch("backend/package.json", (source) => {
  const document = JSON.parse(source);
  document.scripts["test:stock-market-calendar"] = [
    "deno test",
    "--allow-read=supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql,supabase/migrations/20260719133000_require_stock_market_timezone_v1.sql",
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

await patch("backend/src/domains/stocks/README.md", (source) => {
  const marker = "## Required Game Timezone";
  if (source.includes(marker)) return source;

  return `${source.trimEnd()}\n\n${marker}\n\nEvery game must store one valid IANA timezone at \`game_settings.stock_market_window.timezone\`. The same timezone governs every Econovaria exchange. Browser and device timezones are prohibited. Existing games receive a one-time \`Asia/Seoul\` migration value; after migration there is no runtime fallback. Missing or invalid settings fail closed at the request, database, runner, dashboard, and order-execution boundaries.\n`;
});

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Verified" : "Applied"} required game market timezone integration.`,
  );
}
