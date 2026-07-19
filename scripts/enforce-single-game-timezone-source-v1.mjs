import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
let differences = 0;

async function read(relativePath) {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

async function patch(relativePath, transform) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await read(relativePath);
  const expected = transform(source);
  if (source === expected) return;

  differences += 1;
  if (checkOnly) {
    console.error(`Single game-timezone source drift: ${relativePath}`);
    return;
  }

  await writeFile(absolutePath, expected, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found for ${label}.`);
  }
  return source.replace(before, after);
}

await patch(
  "backend/src/domains/stocks/calendars/stockMarketExchangeCalendar.ts",
  (source) => {
    let expected = source;

    if (!expected.includes("isValidStockMarketTimeZone")) {
      expected = `import {\n  isValidStockMarketTimeZone,\n} from "./stockMarketWindowConfig.ts";\n\n${expected}`;
    }

    expected = expected.replace("  readonly timeZone: string;\n", "");
    expected = expected.replace('const DEFAULT_TIME_ZONE = "Asia/Seoul";\n', "");
    expected = expected.replace("        timeZone: DEFAULT_TIME_ZONE,\n", "");

    expected = replaceOnce(
      expected,
      `export function evaluateStockMarketSession(\n  exchangeCode: StockExchangeCode,\n  at: Date = new Date(),\n): StockMarketSessionState {\n  assertValidDate(at);\n  const calendar = getStockExchangeCalendar(exchangeCode);\n  const core = evaluateCore(calendar, at);`,
      `export function evaluateStockMarketSession(\n  exchangeCode: StockExchangeCode,\n  at: Date,\n  gameTimeZone: string,\n): StockMarketSessionState {\n  assertValidDate(at);\n  assertValidGameTimeZone(gameTimeZone);\n  const calendar = getStockExchangeCalendar(exchangeCode);\n  const core = evaluateCore(calendar, at, gameTimeZone);`,
      "required game timezone evaluator",
    );

    expected = replaceOnce(
      expected,
      `    nextTransitionAt: findNextTransitionAt(calendar, at, core.status),`,
      `    nextTransitionAt: findNextTransitionAt(\n      calendar,\n      at,\n      core.status,\n      gameTimeZone,\n    ),`,
      "next transition game timezone",
    );

    expected = replaceOnce(
      expected,
      `export function isStockMarketOpenAt(\n  at: Date,\n  exchangeCode: StockExchangeCode = DEFAULT_STOCK_EXCHANGE_CODE,\n): boolean {\n  assertValidDate(at);\n  return evaluateCore(getStockExchangeCalendar(exchangeCode), at).status ===\n    "open";\n}`,
      `export function isStockMarketOpenAt(\n  at: Date,\n  exchangeCode: StockExchangeCode,\n  gameTimeZone: string,\n): boolean {\n  assertValidDate(at);\n  assertValidGameTimeZone(gameTimeZone);\n  return evaluateCore(\n    getStockExchangeCalendar(exchangeCode),\n    at,\n    gameTimeZone,\n  ).status === "open";\n}`,
      "open-state required game timezone",
    );

    expected = replaceOnce(
      expected,
      `function evaluateCore(\n  calendar: StockExchangeCalendarDefinition,\n  at: Date,\n): {`,
      `function evaluateCore(\n  calendar: StockExchangeCalendarDefinition,\n  at: Date,\n  gameTimeZone: string,\n): {`,
      "core game timezone input",
    );

    expected = replaceOnce(
      expected,
      `  const local = localParts(at, calendar.timeZone);`,
      `  const local = localParts(at, gameTimeZone);`,
      "core single timezone use",
    );

    expected = replaceOnce(
      expected,
      `function findNextTransitionAt(\n  calendar: StockExchangeCalendarDefinition,\n  at: Date,\n  currentStatus: StockMarketSessionStatus,\n): string | null {`,
      `function findNextTransitionAt(\n  calendar: StockExchangeCalendarDefinition,\n  at: Date,\n  currentStatus: StockMarketSessionStatus,\n  gameTimeZone: string,\n): string | null {`,
      "transition game timezone input",
    );

    expected = replaceOnce(
      expected,
      `    if (evaluateCore(calendar, candidate).status !== currentStatus) {`,
      `    if (\n      evaluateCore(calendar, candidate, gameTimeZone).status !== currentStatus\n    ) {`,
      "transition single timezone use",
    );

    if (!expected.includes("function assertValidGameTimeZone(")) {
      expected = replaceOnce(
        expected,
        `function assertValidDate(value: Date): void {`,
        `function assertValidGameTimeZone(value: string): void {\n  if (!isValidStockMarketTimeZone(value)) {\n    throw new Error("A valid game-level IANA timezone is required.");\n  }\n}\n\nfunction assertValidDate(value: Date): void {`,
        "game timezone assertion",
      );
    }

    return expected;
  },
);

await patch(
  "backend/src/domains/stocks/calendars/stockMarketExchangeCalendar.test.ts",
  (source) => {
    let expected = source;

    if (!expected.includes('const GAME_TIME_ZONE = "Asia/Seoul";')) {
      expected = replaceOnce(
        expected,
        `declare const Deno: {\n  test(name: string, run: () => void | Promise<void>): void;\n};`,
        `declare const Deno: {\n  test(name: string, run: () => void | Promise<void>): void;\n};\n\nconst GAME_TIME_ZONE = "Asia/Seoul";`,
        "calendar test game timezone constant",
      );
    }

    expected = expected.replaceAll(
      `new Date("2026-07-19T23:00:00.000Z"),\n  );`,
      `new Date("2026-07-19T23:00:00.000Z"),\n    GAME_TIME_ZONE,\n  );`,
    );
    expected = expected.replaceAll(
      `new Date("2026-07-19T22:59:00.000Z"),\n  );`,
      `new Date("2026-07-19T22:59:00.000Z"),\n    GAME_TIME_ZONE,\n  );`,
    );
    expected = expected.replaceAll(
      `new Date("2026-07-20T08:00:00.000Z"),\n  );`,
      `new Date("2026-07-20T08:00:00.000Z"),\n    GAME_TIME_ZONE,\n  );`,
    );
    expected = expected.replace(
      `assertEquals(isStockMarketOpenAt(saturday, "AUX"), false);`,
      `assertEquals(\n    isStockMarketOpenAt(saturday, "AUX", GAME_TIME_ZONE),\n    false,\n  );`,
    );
    expected = expected.replace(
      `const state = evaluateStockMarketSession("AUX", saturday);`,
      `const state = evaluateStockMarketSession(\n    "AUX",\n    saturday,\n    GAME_TIME_ZONE,\n  );`,
    );

    if (!expected.includes("one supplied game timezone governs every exchange")) {
      expected = replaceOnce(
        expected,
        `Deno.test("minute keys are stable and exchange scoped", () => {`,
        `Deno.test("one supplied game timezone governs every exchange", () => {\n  const at = new Date("2026-07-20T13:00:00.000Z");\n  for (const exchangeCode of STOCK_EXCHANGE_CODES) {\n    assertEquals(\n      isStockMarketOpenAt(at, exchangeCode, "America/New_York"),\n      true,\n    );\n  }\n});\n\nDeno.test("minute keys are stable and exchange scoped", () => {`,
        "single timezone all-exchange test",
      );
    }

    return expected;
  },
);

await patch(
  "backend/supabase/migrations/20260719133000_require_stock_market_timezone_v1.sql",
  (source) => {
    if (source.includes("STOCK_MARKET_EXISTING_TIMEZONE_INVALID")) return source;

    return replaceOnce(
      source,
      `where nullif(btrim(stock_market_window ->> 'timezone'), '') is null;\n\ncreate or replace function public.validate_required_stock_market_timezone()`,
      `where nullif(btrim(stock_market_window ->> 'timezone'), '') is null;\n\ndo $$\nbegin\n  if exists (\n    select 1\n    from public.game_settings settings\n    where not exists (\n      select 1\n      from pg_timezone_names zone\n      where zone.name = btrim(settings.stock_market_window ->> 'timezone')\n    )\n  ) then\n    raise exception 'STOCK_MARKET_EXISTING_TIMEZONE_INVALID';\n  end if;\nend;\n$$;\n\ncreate or replace function public.validate_required_stock_market_timezone()`,
      "migration preflight for invalid existing timezone",
    );
  },
);

await patch(
  "backend/src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts",
  (source) => replaceOnce(
    source,
    `  assertIncludes(required, "STOCK_MARKET_TIMEZONE_INVALID");`,
    `  assertIncludes(required, "STOCK_MARKET_TIMEZONE_INVALID");\n  assertIncludes(required, "STOCK_MARKET_EXISTING_TIMEZONE_INVALID");`,
    "invalid existing timezone migration assertion",
  ),
);

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Verified" : "Applied"} one game-timezone source for every exchange.`,
  );
}
