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
const provisioning = await source(
  "backend/supabase/functions/admin-api/gameProvisioningOperations.ts",
);

assertIncludes(html, 'id="adminNewGameTimeZone"');
assertIncludes(html, 'id="adminCreateGameForm"');
assertIncludes(html, 'value="Asia/Seoul"');
assertIncludes(login, 'text("adminNewGameTimeZone")');
assertIncludes(login, 'Intl.supportedValuesOf("timeZone")');
assertNotIncludes(login, "resolvedOptions().timeZone");
assertIncludes(api, 'callAdminBffJsonRoute("/games"');
assertIncludes(api, "stockMarketWindow: {");
assertIncludes(api, "timezone: String(input?.timeZone");
assertIncludes(provisioning, "handleLicensingActivationRequest");
assertNotIncludes(html, 'id="gameTimeZone"');
assertNotIncludes(login, 'text("gameTimeZone")');
assertNotIncludes(signup, "invalid_stock_market_timezone");
assertNotIncludes(signup, "stockMarketWindow: input.stockMarketWindow");

console.log("Authenticated game-timezone UI and activation smoke passed.");

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`Expected source to include: ${expected}`);
  }
}

function assertNotIncludes(value, unexpected) {
  if (value.includes(unexpected)) {
    throw new Error(`Expected source to exclude: ${unexpected}`);
  }
}
