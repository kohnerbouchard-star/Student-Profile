import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

async function read(relativePath) {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found for ${label}.`);
  }
  return source.replace(before, after);
}

async function patch(relativePath, transform) {
  const source = await read(relativePath);
  const expected = transform(source);
  if (source === expected) return false;
  if (checkOnly) {
    console.error(`Exchange-calendar patch drift: ${relativePath}`);
    return true;
  }
  await writeFile(path.join(repoRoot, relativePath), expected, "utf8");
  return true;
}

let differences = 0;

if (await patch("backend/src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.test.ts", (source) => {
  let expected = source.replaceAll(
    "execute_stock_market_order",
    "execute_stock_market_order_calendar_gated",
  );
  expected = replaceOnce(
    expected,
    'Deno.test("stock trading repository maps missing schema to schema-not-applied", async () => {',
    `Deno.test("stock trading repository rejects execution while the market is closed", async () => {
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithError("STOCK_TRADING_MARKET_CLOSED")
        .executeOrder(orderInput()),
    "stock_market_closed",
    409,
  );
});

Deno.test("stock trading repository maps missing schema to schema-not-applied", async () => {`,
    "stock trading market-closed test",
  );
  return expected;
})) differences += 1;

if (await patch("backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts", (source) => {
  let expected = replaceOnce(
    source,
    'import { calculateNextStockMarketTick } from "../calculations/stockMarketEngine.ts";',
    `import { calculateNextStockMarketTick } from "../calculations/stockMarketEngine.ts";
import {
  DEFAULT_STOCK_EXCHANGE_CODE,
  evaluateStockMarketSession,
  type StockMarketSessionState,
} from "../calendars/stockMarketExchangeCalendar.ts";`,
    "runner calendar import",
  );
  expected = replaceOnce(
    expected,
    '  readonly calculateNextTick?: CalculateStockMarketTick;\n  readonly createPublicRealtimePublisher?: (',
    `  readonly calculateNextTick?: CalculateStockMarketTick;
  readonly now?: () => Date;
  readonly evaluateMarketSession?: (at: Date) => StockMarketSessionState;
  readonly createPublicRealtimePublisher?: (`,
    "runner dependency calendar seam",
  );
  expected = replaceOnce(
    expected,
    `    const storylineRunnerAfterTick = dependencies.runStorylineEventsAfterTick ??`,
    `    const marketSession = (dependencies.evaluateMarketSession ??
      ((at: Date) =>
        evaluateStockMarketSession(DEFAULT_STOCK_EXCHANGE_CODE, at)))(
          (dependencies.now ?? (() => new Date()))(),
        );

    if (marketSession.status !== "open") {
      throw new StockMarketRunnerError(
        "stock_market_closed",
        marketSession.nextTransitionAt
          ? \`Stock market is closed. The next calendar transition is \${marketSession.nextTransitionAt}.\`
          : "Stock market is closed.",
        409,
      );
    }

    const storylineRunnerAfterTick = dependencies.runStorylineEventsAfterTick ??`,
    "runner closed-session gate",
  );
  expected = replaceOnce(
    expected,
    `        retryable: false,
      });
    }

    if (error instanceof EdgeActivationError) {`,
    `        retryable: error.code === "stock_market_closed",
      });
    }

    if (error instanceof EdgeActivationError) {`,
    "runner closed-session retryability",
  );
  return expected;
})) differences += 1;

if (await patch("backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts", (source) => {
  let expected = replaceOnce(
    source,
    '  readonly readRunnerSecret?: () => string | undefined;\n  readonly calculateNextTick?: (',
    `  readonly readRunnerSecret?: () => string | undefined;
  readonly now?: () => Date;
  readonly calculateNextTick?: (`,
    "runner test now option",
  );
  expected = replaceOnce(
    expected,
    '    readRunnerSecret: options.readRunnerSecret ?? (() => SECRET),\n    createRepository: () => repository,',
    `    readRunnerSecret: options.readRunnerSecret ?? (() => SECRET),
    now: options.now ?? (() => new Date("2026-07-20T00:00:00.000Z")),
    createRepository: () => repository,`,
    "runner test open default",
  );
  expected = replaceOnce(
    expected,
    'Deno.test("stock market runner returns success shape", async () => {',
    `Deno.test("stock market runner rejects ticks while the market is closed", async () => {
  const repository = new MockRunnerRepository();
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      repository,
      now: () => new Date("2026-07-19T00:00:00.000Z"),
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 409);
  assertEquals(body.error.code, "stock_market_closed");
  assertEquals(body.error.retryable, true);
  assertEquals(repository.loadedGameSessionIds, []);
});

Deno.test("stock market runner returns success shape", async () => {`,
    "runner closed test",
  );
  return expected;
})) differences += 1;

if (await patch("backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts", (source) => {
  let expected = replaceOnce(
    source,
    'import type {\n  PlayerGameDashboardCashBalanceDto,',
    `import {
  DEFAULT_STOCK_EXCHANGE_CODE,
  evaluateStockMarketSession,
} from "../../stocks/calendars/stockMarketExchangeCalendar.ts";
import type {
  PlayerGameDashboardCashBalanceDto,`,
    "dashboard calendar import",
  );
  expected = replaceOnce(
    expected,
    '  constructor(private readonly client: SupabasePlayerGameDashboardClient) {}',
    `  constructor(
    private readonly client: SupabasePlayerGameDashboardClient,
    private readonly now: () => Date = () => new Date(),
  ) {}`,
    "dashboard clock injection",
  );
  expected = replaceOnce(
    expected,
    '        marketStatus: gameSession.status === "active" ? "open" : "closed",',
    `        marketStatus: gameSession.status === "active"
          ? evaluateStockMarketSession(
            DEFAULT_STOCK_EXCHANGE_CODE,
            this.now(),
          ).status
          : "closed",`,
    "dashboard authoritative market status",
  );
  return expected;
})) differences += 1;

if (await patch("backend/package.json", (source) => {
  const document = JSON.parse(source);
  const calendarCommand = [
    "deno test",
    "--allow-read=supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql",
    "--config supabase/functions/deno.json",
    "--lock=supabase/functions/deno.lock",
    "--frozen",
    "src/domains/stocks/calendars/stockMarketExchangeCalendar.test.ts",
    "src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts",
    "src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.test.ts",
    "src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts",
  ].join(" ");
  document.scripts["test:stock-market-calendar"] = calendarCommand;
  if (!document.scripts["test:smoke"].startsWith("npm run test:stock-market-calendar && ")) {
    document.scripts["test:smoke"] =
      `npm run test:stock-market-calendar && ${document.scripts["test:smoke"]}`;
  }
  return `${JSON.stringify(document, null, 2)}\n`;
})) differences += 1;

if (await patch("backend/src/domains/stocks/README.md", (source) => {
  if (source.includes("## V8 Exchange Calendar Runtime")) return source;
  return `${source.trimEnd()}

## V8 Exchange Calendar Runtime

V8 introduces a Backend-authoritative market-session boundary for the one-year,
real-time game. The initial runtime profile intentionally preserves the legacy
classroom schedule: Asia/Seoul, Monday through Friday, 08:00 inclusive to 17:00
exclusive. The calendar contract supports ten stable fictional exchange codes,
versioned holiday dates, and early-close overrides; holiday records remain
fail-closed until approved.

The stock runner rejects closed-session ticks before loading or persisting market
state. The trading repository calls the calendar-gated service-role RPC, which
rejects immediate fills while the market is closed. The Player dashboard derives
market status from the same server-side calendar service instead of equating an
active game with an open market.

Closed sessions keep the last authoritative price. Market news and non-exchange
game systems may continue, but regular-session price ticks and immediate trade
fills do not. The minute key helper provides an exchange-scoped UTC idempotency
key for later missed-open-minute replay.
`;
})) differences += 1;

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Verified" : "Applied"} exchange-calendar runtime integration.`,
  );
}
