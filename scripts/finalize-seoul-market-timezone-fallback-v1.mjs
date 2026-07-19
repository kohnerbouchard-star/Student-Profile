import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
let differences = 0;

async function writeExpected(relativePath, expected) {
  const absolutePath = path.join(repoRoot, relativePath);
  const current = await readFile(absolutePath, "utf8");
  if (current === expected) return;
  differences += 1;
  if (checkOnly) {
    console.error(`Fixed Seoul fallback drift: ${relativePath}`);
    return;
  }
  await writeFile(absolutePath, expected, "utf8");
}

const configModule = `export const DEFAULT_STOCK_MARKET_TIME_ZONE = "Asia/Seoul";

export interface StockMarketWindowConfig {
  readonly timeZone: string;
  readonly source: "game_setting" | "seoul_fallback";
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

export function readStockMarketWindowConfig(
  value: unknown,
): StockMarketWindowConfig {
  const record = isRecord(value) ? value : {};
  const rawTimeZone = record.timezone;

  if (rawTimeZone === undefined || rawTimeZone === null || rawTimeZone === "") {
    return {
      timeZone: DEFAULT_STOCK_MARKET_TIME_ZONE,
      source: "seoul_fallback",
    };
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

const configTest = `import {
  DEFAULT_STOCK_MARKET_TIME_ZONE,
  normalizeStockMarketWindowSetting,
  readStockMarketWindowConfig,
  StockMarketWindowConfigError,
} from "./stockMarketWindowConfig.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("missing timezone uses the fixed Seoul fallback", () => {
  assertEquals(readStockMarketWindowConfig({}), {
    timeZone: DEFAULT_STOCK_MARKET_TIME_ZONE,
    source: "seoul_fallback",
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

Deno.test("invalid configured timezone fails instead of using device time", () => {
  assertThrows(() => readStockMarketWindowConfig({ timezone: "Browser/Local" }));
  assertThrows(() => normalizeStockMarketWindowSetting({ timezone: "UTC+9" }));
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
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
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

const createGamePath = path.join(
  repoRoot,
  "backend/src/domains/game-sessions/application/createGame.ts",
);
let createGame = await readFile(createGamePath, "utf8");
createGame = createGame
  .replaceAll("DEFAULT_SERVER_STOCK_MARKET_TIME_ZONE", "DEFAULT_STOCK_MARKET_TIME_ZONE")
  .replace(
    '  DEFAULT_STOCK_MARKET_TIME_ZONE,\n  normalizeStockMarketWindowSetting,',
    '  DEFAULT_STOCK_MARKET_TIME_ZONE,\n  normalizeStockMarketWindowSetting,',
  );
if (!createGame.includes("DEFAULT_STOCK_MARKET_TIME_ZONE")) {
  throw new Error("Create-game timezone fallback anchor was not found.");
}
const currentCreateGame = await readFile(createGamePath, "utf8");
if (currentCreateGame !== createGame) {
  differences += 1;
  if (checkOnly) {
    console.error("Fixed Seoul fallback drift: backend/src/domains/game-sessions/application/createGame.ts");
  } else {
    await writeFile(createGamePath, createGame, "utf8");
  }
}

const readmePath = path.join(repoRoot, "backend/src/domains/stocks/README.md");
let readme = await readFile(readmePath, "utf8");
readme = readme.replace(
  "Existing games and missing settings use the server-owned `Asia/Seoul` fallback.",
  "Existing games and missing settings use the fixed `Asia/Seoul` fallback.",
);
const currentReadme = await readFile(readmePath, "utf8");
if (currentReadme !== readme) {
  differences += 1;
  if (checkOnly) {
    console.error("Fixed Seoul fallback drift: backend/src/domains/stocks/README.md");
  } else {
    await writeFile(readmePath, readme, "utf8");
  }
}

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? "Verified" : "Applied"} fixed Asia/Seoul market fallback.`);
}
