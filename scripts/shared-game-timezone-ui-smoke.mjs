import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

const html = await source("index.html");
const auth = await source("frontend/src/features/auth/auth.js");
const api = await source("frontend/src/core/api.js");
const signup = await source("backend/src/domains/auth/api/staffSignupHttpHandler.ts");

assertIncludes(html, 'id="gameTimeZone"');
assertIncludes(html, 'value="Asia/Seoul"');
assertIncludes(html, "Controls market hours for every exchange in this game.");
assertIncludes(auth, 'document.getElementById("gameTimeZone")');
assertIncludes(auth, 'Intl.supportedValuesOf("timeZone")');
assertNotIncludes(auth, "resolvedOptions().timeZone");
assertIncludes(api, "stockMarketWindow: {");
assertIncludes(api, "timezone: String(input?.timeZone");
assertIncludes(signup, "invalid_stock_market_timezone");
assertIncludes(signup, "stockMarketWindow: input.stockMarketWindow");

console.log("Shared game-timezone UI and activation smoke passed.");

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
