import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const economy = "backend/supabase/functions/player-api/dispatchPlayerEconomyRoutes.ts";
const cases = [
  ["business-phase10-player-store-cutover-contract.mjs", "player-terminal/src/features/store/store-purchase-state.js", 'refreshState: event.warnings.length ? "pending" : "complete"', /Store transaction state missing token/],
  ["business-phase10-player-store-cutover-contract.mjs", "player-terminal/src/features/store/store-purchase-flow.js", 'from "./store-purchase-state.js"', /reach|import|closure/i],
  ["player-local-currency-authority-contract.test.mjs", "backend/supabase/functions/admin-api/playerLedgerCurrency.ts", '"player_country_assignments"', /player_country_assignments/],
  ["admin-world-runtime-console-contract.mjs", "backend/supabase/functions/admin-api/campaignOperations.ts", "control_campaign_instance_atomic_v1", /Missing Admin World operation control_campaign_instance_atomic_v1/],
  ["business-banking-runtime-contract.mjs", "backend/supabase/functions/classroom-api/dispatchPlayerEconomyRoutes.ts", "handlePlayerBusinessBankingRequest", /handlePlayerBusinessBankingRequest/],
  ["business-multicurrency-treasury-contract.mjs", "backend/src/domains/players/contracts/playerGameplayCapabilityEndpoints.ts", "/players/me/marketplace/listings/:listingId/quotes", /C4 retained Marketplace server capability operations/],
  ["business-phase4c-player-recovery-contract.mjs", "backend/src/domains/players/contracts/playerBusinessCapabilityEndpoints.ts", 'key: "business"', /existing Business capability manifest path/],
  ["admin-v2-teacher-safety-contract.test.mjs", "backend/supabase/functions/admin-api/gameResourceReadModels.ts", "game_item:game_items!store_items_game_item_scope_fk(source_kind)", /Admin Store reads must include canonical game-item provenance/],
  ["admin-local-handler-architecture-contract.test.mjs", "backend/supabase/functions/admin-api/gameResourceReadModels.ts", "readAdminGameSettingsView({", /readAdminGameSettingsView/],
  ["business-phase10-player-store-cutover-contract.mjs", "backend/src/domains/players/contracts/playerGameplayCapabilityEndpoints.ts", "/players/me/store/offer-quotes", /Player capabilities missing token/],
  ["business-player-store-fx-final-contract.mjs", economy, "../../../src/domains/store/api/playerStorePublicHttpHandler.ts", /player-api Store entrypoint is missing/],
  ["business-phase10-player-store-cutover-contract.mjs", economy, "readPlayerStorePublicRoutePath", /Player API runtime missing token/],
  ["business-store-procurement-authority-contract.mjs", economy, 'businessStoreQuote: "storeQuote"', /businessStoreQuote/],
  ["apply-shared-game-timezone-ui-v1.mjs", "frontend/src/core/login-game-selection.js", 'text("adminNewGameTimeZone")', /Shared game-timezone integration is missing/],
];

// Instrument filesystem reads in an isolated child process, never edit source files.
// Run the actual unchanged contract assertions against absent/wrong owner contents.
function run(script, mutation = null) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "finite-reader-contract-"));
  try {
    const hook = path.join(dir, "source-read-hook.mjs");
    writeFileSync(hook, `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      import { fileURLToPath } from "node:url";
      import path from "node:path";
      const mutation = ${JSON.stringify(mutation)};
      function transform(file, source) {
        if (!mutation || path.resolve(file instanceof URL ? fileURLToPath(file) : String(file)) !== path.resolve(${JSON.stringify(root)}, mutation.file)) return source;
        if (mutation.missing) throw Object.assign(new Error("Missing required owner: " + mutation.file), { code: "ENOENT" });
        const text = Buffer.isBuffer(source) ? source.toString("utf8") : source;
        if (!text.includes(mutation.token)) throw new Error("Mutation fixture anchor absent: " + mutation.token);
        const changed = text.split(mutation.token).join(mutation.replacement ?? "REMOVED_CONTRACT_MARKER");
        return Buffer.isBuffer(source) ? Buffer.from(changed) : changed;
      }
      const sync = fs.readFileSync.bind(fs);
      const asyncRead = fs.promises.readFile.bind(fs.promises);
      fs.readFileSync = (file, ...args) => transform(file, sync(file, ...args));
      fs.promises.readFile = async (file, ...args) => transform(file, await asyncRead(file, ...args));
      syncBuiltinESMExports();
    `);
    return spawnSync(process.execPath, ["--import", hook, path.join(root, "scripts", script)], {
      cwd: root, encoding: "utf8", timeout: 30_000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [script, file, token, failure] of cases) {
  test(`${script} accepts the finite installed owner closure`, () => {
    const result = run(script);
    assert.equal(result.status, 0, result.stderr);
  });
  test(`${script} retains its assertion when an extracted marker is wrong`, () => {
    const result = run(script, { file, token });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, failure);
    assert.doesNotMatch(result.stderr, /Mutation fixture anchor absent/);
  });
  test(`${script} fails closed when its extracted owner is missing`, () => {
    const result = run(script, { file, missing: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Missing required owner/);
  });
}

test("timezone verifier rejects forbidden state in its extracted owner", () => {
  const result = run("apply-shared-game-timezone-ui-v1.mjs", {
    file: "frontend/src/core/login-game-selection.js",
    token: 'text("adminNewGameTimeZone")',
    replacement: 'text("adminNewGameTimeZone") /* text("gameTimeZone") */',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Public account creation must not own game timezone state/);
});


test("direct Cutover Deno invocation retains exactly eight explicit source reads", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/business-player-store-cutover-v2.yml"), "utf8");
  const invocations = [...workflow.matchAll(/deno test \\\r?\n([\s\S]*?)src\/security\/classroomApiRateLimitDispatch\.test\.ts/g)];
  assert.equal(invocations.length, 1, "Exactly one direct classroom composition invocation must remain.");
  const permission = invocations[0][1].match(/--allow-read=([^\s]+)/);
  assert.ok(permission, "The invocation must retain explicit read permissions.");
  assert.deepEqual(permission[1].split(",").sort(), [
    "supabase/functions/classroom-api/index.ts",
    "supabase/functions/classroom-api/dispatchPlayerWorldRoutes.ts",
    "supabase/functions/classroom-api/dispatchPlayerEconomyRoutes.ts",
    "supabase/functions/classroom-api/dispatchStaffRoutes.ts",
    "supabase/functions/classroom-api/classroomClients.ts",
    "supabase/functions/player-api/runtime.ts",
    "supabase/functions/player-api/dispatchPlayerWorldRoutes.ts",
    "supabase/functions/player-api/dispatchPlayerEconomyRoutes.ts",
  ].sort());
  assert.match(invocations[0][1], /--frozen/);
  assert.match(invocations[0][1], /--lock=supabase\/functions\/deno\.lock/);
});

for (const script of ["business-input-purchase-retirement-contract.mjs", "business-workforce-hiring-contract.mjs"]) {
  test(`${script} rejects forbidden actions in connected endpoint helpers`, () => {
    const forbidden = script.includes("workforce") ? "businessHire" : "businessInputPurchase";
    const result = run(script, {
      file: "backend/src/domains/players/contracts/playerBusinessCapabilityEndpoints.ts",
      token: 'key: "business"',
      replacement: `key: "${forbidden}"`,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, new RegExp(forbidden));
    assert.doesNotMatch(result.stderr, /Mutation fixture anchor absent/);
  });
  test(`${script} rejects missing endpoint helpers`, () => {
    const result = run(script, { file: "backend/src/domains/players/contracts/playerBusinessCapabilityEndpoints.ts", missing: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing required owner/);
  });
}

for (const [script, file, token] of [
  ["player-local-currency-authority-contract.test.mjs", "backend/supabase/functions/admin-api/playerOperations.ts", "./playerLedgerCurrency.ts"],
  ["admin-world-runtime-console-contract.mjs", "backend/supabase/functions/admin-api/worldRuntimeOperations.ts", "./campaignOperations.ts"],
  ["business-banking-runtime-contract.mjs", "backend/supabase/functions/classroom-api/index.ts", "./dispatchPlayerEconomyRoutes.ts"],
  ...["business-multicurrency-treasury-contract.mjs", "business-phase4c-player-recovery-contract.mjs", "business-input-purchase-retirement-contract.mjs", "business-workforce-hiring-contract.mjs"].map((script) => [script, "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts", "./playerBusinessCapabilityEndpoints.ts"]),
]) {
  test(`${script} rejects a disconnected reviewed helper`, () => {
    const result = run(script, { file, token, replacement: "./unlisted-owner.ts" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Extracted module is disconnected/);
    assert.doesNotMatch(result.stderr, /Mutation fixture anchor absent/);
  });
}

test("Banking lifecycle ordering remains anchored in the actual Admin entrypoint", () => {
  const result = run("business-banking-runtime-contract.mjs", {
    file: "backend/supabase/functions/admin-api/index.ts",
    token: "const mutationGuard = guardGameScopedMutation",
    replacement: "const lateGuard = guardGameScopedMutation",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Admin lifecycle guard must run before Business\/Banking operations/);
});

for (const file of [
  "backend/supabase/functions/classroom-api/dispatchPlayerWorldRoutes.ts",
  "backend/supabase/functions/classroom-api/dispatchPlayerEconomyRoutes.ts",
  "backend/supabase/functions/classroom-api/dispatchStaffRoutes.ts",
  "backend/supabase/functions/classroom-api/classroomClients.ts",
  "backend/src/domains/players/contracts/playerWorldBankingCapabilityEndpoints.ts",
  "backend/src/domains/players/contracts/playerBusinessCapabilityEndpoints.ts",
  "backend/src/domains/players/contracts/playerGameplayCapabilityEndpoints.ts",
  "backend/src/domains/players/contracts/playerSocialCapabilityEndpoints.ts",
]) {
  test(`Banking source closure requires every reviewed helper: ${file}`, () => {
    const result = run("business-banking-runtime-contract.mjs", { file, missing: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing required owner/);
  });
}

test("Local-currency contract rejects forbidden defaults in extracted authority", () => {
  const result = run("player-local-currency-authority-contract.test.mjs", {
    file: "backend/supabase/functions/admin-api/playerLedgerCurrency.ts",
    token: 'from("player_country_assignments")',
    replacement: 'from("player_country_assignments") /* p_currency_code: text(body.currency, "ECO") */',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not default an unspecified ledger adjustment to ECO/);
  assert.doesNotMatch(result.stderr, /Mutation fixture anchor absent/);
});
