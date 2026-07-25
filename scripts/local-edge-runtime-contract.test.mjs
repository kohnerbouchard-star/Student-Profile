import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONFIG = new URL("../backend/supabase/config.toml", import.meta.url);
const PACKAGE = new URL("../package.json", import.meta.url);
const FUNCTION_ROOT = new URL("../backend/supabase/functions/", import.meta.url);
const FUNCTION_POLICIES = Object.freeze({
  "player-api": false,
  "bootstrap-api": false,
  "staff-api": true,
  "admin-api": true,
  "classroom-api": true,
  "stock-market-runner": false,
  "stock-market-read": false,
  "stock-market-seed-copy": false,
  "stock-market-player-read": false,
  "stock-market-trading": false,
});

function section(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] || "";
}

test("local Supabase starts the declared split Edge Functions runtime", async () => {
  const [config, packageSource] = await Promise.all([
    readFile(CONFIG, "utf8"),
    readFile(PACKAGE, "utf8"),
  ]);

  assert.match(section(config, "edge_runtime"), /(?:^|\n)enabled\s*=\s*true(?:\s|$)/);

  const functionSources = {};
  for (const [name, verifyJwt] of Object.entries(FUNCTION_POLICIES)) {
    const policy = section(config, `functions.${name}`);
    assert.match(policy, new RegExp(`verify_jwt\\s*=\\s*${verifyJwt}`));
    functionSources[name] = await readFile(new URL(`${name}/index.ts`, FUNCTION_ROOT), "utf8");
  }

  const falseSections = [...config.matchAll(
    /\[functions\.([^\]]+)\][\s\S]*?verify_jwt\s*=\s*false(?=\s|$)/g,
  )].map((match) => match[1]).sort();
  const expectedFalse = Object.entries(FUNCTION_POLICIES)
    .filter(([, value]) => value === false)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(falseSections, expectedFalse);

  for (const [name, source] of Object.entries(functionSources)) {
    assert.doesNotMatch(source, /Authorization[^\n]+sb_publishable_/i);
    if (FUNCTION_POLICIES[name] === false) {
      assert.match(source, /requirePublishableRequest\(request\)/);
    }
  }

  assert.match(functionSources["staff-api"], /resolveStaffForRequest/);
  assert.match(functionSources["staff-api"], /handleStaffBootstrapRequest/);
  assert.match(
    functionSources["player-api"],
    /dispatchRateLimitedReviewedPlayerRequest/,
  );
  assert.match(functionSources["bootstrap-api"], /handleStaffSignupRequest/);
  for (const name of expectedFalse.filter((value) => value.startsWith("stock-market-"))) {
    assert.match(functionSources[name], /handleStockMarket/);
  }

  const packageJson = JSON.parse(packageSource);
  const localCommand = packageJson.scripts?.["dev:local"] || "";
  assert.match(localCommand, /supabase start --workdir backend/);
  assert.match(localCommand, /econovaria-local-gateway\.py --local-supabase/);
});
