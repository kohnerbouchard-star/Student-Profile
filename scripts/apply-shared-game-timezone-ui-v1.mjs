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
const provisioning = await source(
  "backend/supabase/functions/admin-api/gameProvisioningOperations.ts",
);

for (const [value, expected] of [
  [html, 'id="adminNewGameTimeZone"'],
  [html, 'id="adminCreateGameForm"'],
  [html, 'value="Asia/Seoul"'],
  [login, 'text("adminNewGameTimeZone")'],
  [login, 'Intl.supportedValuesOf("timeZone")'],
  [login, "VALID_DIFFICULTIES"],
  [api, 'callAdminBffJsonRoute("/games"'],
  [api, "stockMarketWindow: {"],
  [api, "timezone: String(input?.timeZone"],
  [provisioning, "handleLicensingActivationRequest"],
  [signupTest, "public signup rejects license and game fields"]
]) {
  if (!value.includes(expected)) {
    throw new Error(`Shared game-timezone integration is missing: ${expected}`);
  }
}

for (const forbidden of [
  'id="gameTimeZone"',
  'text("gameTimeZone")',
  "invalid_stock_market_timezone",
  "stockMarketWindow: input.stockMarketWindow",
]) {
  if (html.includes(forbidden) || login.includes(forbidden) || signup.includes(forbidden)) {
    throw new Error(`Public account creation must not own game timezone state: ${forbidden}`);
  }
}

if (login.includes("resolvedOptions().timeZone")) {
  throw new Error("Create New Game must not infer the game timezone from the browser.");
}

console.log("Verified authenticated shared game-timezone integration without modifying the worktree.");
