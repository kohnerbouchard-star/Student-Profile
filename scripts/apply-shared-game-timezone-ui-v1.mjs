import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

const html = await source("index.html");
const login = await source("frontend/src/core/login.js");
const api = await source("frontend/src/core/api.js");
const signup = await source("backend/src/domains/auth/api/staffSignupHttpHandler.ts");
const signupTest = await source("backend/src/domains/auth/api/staffSignupHttpHandlerTest.ts");

for (const [value, expected] of [
  [html, 'id="gameTimeZone"'],
  [html, 'value="Asia/Seoul"'],
  [html, "Controls market hours for every exchange in this game."],
  [login, 'text("gameTimeZone")'],
  [login, 'Intl.supportedValuesOf("timeZone")'],
  [login, "VALID_DIFFICULTIES"],
  [api, "stockMarketWindow: {"],
  [api, "timezone: String(input?.timeZone"],
  [signup, "invalid_stock_market_timezone"],
  [signup, "stockMarketWindow: input.stockMarketWindow"],
  [signupTest, 'stockMarketWindow: { timezone: "Asia/Seoul" }']
]) {
  if (!value.includes(expected)) {
    throw new Error(`Shared game-timezone integration is missing: ${expected}`);
  }
}

if (login.includes("resolvedOptions().timeZone")) {
  throw new Error("Create Game must not infer the game timezone from the browser.");
}

console.log("Verified shared game-timezone UI integration without modifying the worktree.");
