import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

async function patch(relativePath, transform) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  const expected = transform(source);
  if (source === expected) return false;
  if (checkOnly) {
    console.error(`Stock-market timezone integration drift: ${relativePath}`);
    return true;
  }
  await writeFile(absolutePath, expected, "utf8");
  return true;
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found for ${label}.`);
  }
  return source.replace(before, after);
}

let differences = 0;

if (await patch(
  "backend/src/domains/stocks/calendars/stockMarketExchangeCalendar.ts",
  (source) => source.replaceAll(
    "DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE",
    "SEOUL_STOCK_MARKET_TIME_ZONE",
  ),
)) differences += 1;

if (await patch(
  "backend/src/domains/stocks/calendars/stockMarketMinuteReplay.ts",
  (source) => {
    let expected = replaceOnce(
      source,
      `  readonly exchangeCode: StockExchangeCode;
  readonly lastProcessedMinute: string | null;`,
      `  readonly exchangeCode: StockExchangeCode;
  readonly timeZone?: string;
  readonly lastProcessedMinute: string | null;`,
      "replay timezone input",
    );
    expected = replaceOnce(
      expected,
      `    const session = evaluateStockMarketSession(input.exchangeCode, candidate);`,
      `    const session = evaluateStockMarketSession(
      input.exchangeCode,
      candidate,
      input.timeZone ? { timeZone: input.timeZone } : undefined,
    );`,
      "replay timezone evaluation",
    );
    return expected;
  },
)) differences += 1;

if (await patch(
  "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts",
  (source) => {
    let expected = replaceOnce(
      source,
      `import {
  SupabaseStockMarketRunnerRepository,
} from "../infrastructure/supabaseStockMarketRunnerRepository.ts";`,
      `import {
  SupabaseStockMarketRunnerRepository,
} from "../infrastructure/supabaseStockMarketRunnerRepository.ts";
import {
  readServerStockMarketTimeZone,
  type SupabaseStockMarketTimeZoneClient,
} from "../infrastructure/supabaseStockMarketTimeZoneRepository.ts";`,
      "runner timezone repository import",
    );
    expected = replaceOnce(
      expected,
      `  readonly evaluateMarketSession?: (at: Date) => StockMarketSessionState;
  readonly createPublicRealtimePublisher?: (`,
      `  readonly evaluateMarketSession?: (at: Date) => StockMarketSessionState;
  readonly readStockMarketTimeZone?: (
    client: SupabaseStockMarketTimeZoneClient,
    gameSessionId: string,
  ) => Promise<string>;
  readonly createPublicRealtimePublisher?: (`,
      "runner timezone dependency seam",
    );
    expected = replaceOnce(
      expected,
      `    const marketSession = (dependencies.evaluateMarketSession ??
      ((at: Date) =>
        evaluateStockMarketSession(DEFAULT_STOCK_EXCHANGE_CODE, at)))(
          (dependencies.now ?? (() => new Date()))(),
        );`,
      `    const stockMarketTimeZone = await (
      dependencies.readStockMarketTimeZone ?? readServerStockMarketTimeZone
    )(
      serviceClient as unknown as SupabaseStockMarketTimeZoneClient,
      body.gameSessionId,
    );
    const marketSession = (dependencies.evaluateMarketSession ??
      ((at: Date) =>
        evaluateStockMarketSession(
          DEFAULT_STOCK_EXCHANGE_CODE,
          at,
          { timeZone: stockMarketTimeZone },
        )))(
          (dependencies.now ?? (() => new Date()))(),
        );`,
      "runner configured timezone evaluation",
    );
    return expected;
  },
)) differences += 1;

if (await patch(
  "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts",
  (source) => {
    let expected = replaceOnce(
      source,
      `  readonly now?: () => Date;
  readonly calculateNextTick?: (`,
      `  readonly now?: () => Date;
  readonly readStockMarketTimeZone?: () => Promise<string>;
  readonly calculateNextTick?: (`,
      "runner test timezone option",
    );
    expected = replaceOnce(
      expected,
      `    now: options.now ?? (() => new Date("2026-07-20T00:00:00.000Z")),
    createRepository: () => repository,`,
      `    now: options.now ?? (() => new Date("2026-07-20T00:00:00.000Z")),
    readStockMarketTimeZone: options.readStockMarketTimeZone ??
      (async () => "Asia/Seoul"),
    createRepository: () => repository,`,
      "runner test timezone default",
    );
    expected = replaceOnce(
      expected,
      `Deno.test("stock market runner returns success shape", async () => {`,
      `Deno.test("stock market runner uses the persisted game timezone instead of a device timezone", async () => {
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      now: () => new Date("2026-07-20T13:00:00.000Z"),
      readStockMarketTimeZone: async () => "America/New_York",
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.tickIndex, 4);
});

Deno.test("stock market runner returns success shape", async () => {`,
      "runner persisted timezone test",
    );
    return expected;
  },
)) differences += 1;

if (await patch(
  "backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts",
  (source) => {
    let expected = replaceOnce(
      source,
      `import {
  DEFAULT_STOCK_EXCHANGE_CODE,
  evaluateStockMarketSession,
} from "../../stocks/calendars/stockMarketExchangeCalendar.ts";`,
      `import {
  DEFAULT_STOCK_EXCHANGE_CODE,
  evaluateStockMarketSession,
} from "../../stocks/calendars/stockMarketExchangeCalendar.ts";
import {
  resolveStockMarketWindowSettings,
} from "../../stocks/calendars/stockMarketWindowSettings.ts";`,
      "dashboard timezone settings import",
    );
    expected = replaceOnce(
      expected,
      `  | "game_session_stock_assets"
  | "game_sessions"`,
      `  | "game_session_stock_assets"
  | "game_sessions"
  | "game_settings"`,
      "dashboard game settings table",
    );
    expected = replaceOnce(
      expected,
      `interface GameSessionRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly updated_at?: string | null;
}
`,
      `interface GameSessionRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly updated_at?: string | null;
}

interface GameSettingsRow {
  readonly stock_market_window: unknown;
}
`,
      "dashboard game settings row",
    );
    expected = replaceOnce(
      expected,
      `      gameSession,
      publicMarket,`,
      `      gameSession,
      stockMarketTimeZone,
      publicMarket,`,
      "dashboard timezone result",
    );
    expected = replaceOnce(
      expected,
      `      this.readGameSession(input.gameSessionId),
      this.readPublicStockMarket(input.gameSessionId),`,
      `      this.readGameSession(input.gameSessionId),
      this.readStockMarketTimeZone(input.gameSessionId),
      this.readPublicStockMarket(input.gameSessionId),`,
      "dashboard timezone query",
    );
    expected = replaceOnce(
      expected,
      `          ? evaluateStockMarketSession(
            DEFAULT_STOCK_EXCHANGE_CODE,
            this.now(),
          ).status`,
      `          ? evaluateStockMarketSession(
            DEFAULT_STOCK_EXCHANGE_CODE,
            this.now(),
            { timeZone: stockMarketTimeZone },
          ).status`,
      "dashboard configured timezone evaluation",
    );
    expected = replaceOnce(
      expected,
      `  private async readPublicStockMarket(
    gameSessionId: string,`,
      `  private async readStockMarketTimeZone(
    gameSessionId: string,
  ): Promise<string> {
    const response = await this.client
      .from("game_settings")
      .select("stock_market_window")
      .eq("game_session_id", gameSessionId)
      .maybeSingle();

    if (response.error) {
      throw readFailed();
    }

    const row = response.data as GameSettingsRow | null;
    return resolveStockMarketWindowSettings(
      row?.stock_market_window,
    ).timezone;
  }

  private async readPublicStockMarket(
    gameSessionId: string,`,
      "dashboard timezone reader",
    );
    return expected;
  },
)) differences += 1;

if (await patch(
  "backend/supabase/migrations/20260719142000_configure_stock_market_timezone_v1.sql",
  (source) => source
    .replaceAll("v_server_fallback", "v_seoul_fallback")
    .replaceAll("server fallback", "Seoul fallback")
    .replaceAll("Server fallback", "Seoul fallback"),
)) differences += 1;

if (await patch(
  "backend/src/domains/stocks/tests/stockMarketMinuteReplayMigrationContract.test.ts",
  (source) => source.replace(
    'assertIncludes(source, "public.is_stock_market_open_at(v_market_minute)");',
    'assertIncludes(source, "public.is_stock_market_open_at(p_game_session_id, v_market_minute)");',
  ),
)) differences += 1;

if (await patch("backend/package.json", (source) => {
  const document = JSON.parse(source);
  const command = [
    "deno test",
    "--allow-read=supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql,supabase/migrations/20260719142000_configure_stock_market_timezone_v1.sql,supabase/migrations/20260719143000_add_stock_market_minute_replay_v1.sql",
    "--config supabase/functions/deno.json",
    "--lock=supabase/functions/deno.lock",
    "--frozen",
    "src/domains/stocks/calendars/stockMarketWindowSettings.test.ts",
    "src/domains/stocks/calendars/stockMarketExchangeCalendar.test.ts",
    "src/domains/stocks/calendars/stockMarketMinuteReplay.test.ts",
    "src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts",
    "src/domains/stocks/tests/stockMarketTimeZoneMigrationContract.test.ts",
    "src/domains/stocks/tests/stockMarketMinuteReplayMigrationContract.test.ts",
    "src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.test.ts",
    "src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts",
  ].join(" ");
  document.scripts["test:stock-market-calendar"] = command;
  return `${JSON.stringify(document, null, 2)}\n`;
})) differences += 1;

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Verified" : "Applied"} Seoul fallback market-timezone integration.`,
  );
}
