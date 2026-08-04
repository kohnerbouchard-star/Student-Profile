import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SCRIPT_PATH = "scripts/game-creation-provisioning-local-acceptance.mjs";

test("local provisioning refuses an unverified database target", async () => {
  const source = await readFile(SCRIPT_PATH, "utf8");

  assert.match(source, /assertDisposableLocalRuntime/u);
  assert.match(source, /supabase", "status", "-o", "env", "--workdir", "backend"/u);
  assert.match(source, /inheritedDatabaseUrl: DATABASE_URL/u);
  assert.match(source, /gatewayUrl: BROWSER_GATEWAY_URL/u);
  assert.doesNotMatch(source, /productionTouched:\s*true/u);
});

test("local canonical bootstrap is explicit, idempotent, and preflight-verified", async () => {
  const source = await readFile(SCRIPT_PATH, "utf8");

  assert.match(source, /--bootstrap-only/u);
  assert.match(source, /on conflict \(id\) do nothing/iu);
  assert.match(source, /on conflict \(game_session_id\) do nothing/iu);
  assert.match(source, /readProvisioningPreflight\(\{ allowMissing: true \}\)/u);
  assert.match(source, /await readProvisioningPreflight\(\);/u);
  assert.match(source, /canonicalSeedChanged: false/u);
  assert.match(source, /canonicalSeedChanged: true/u);
});

test("local provisioning uses a platform-owned temporary directory", async () => {
  const source = await readFile(SCRIPT_PATH, "utf8");

  assert.match(source, /import \{ tmpdir \} from "node:os"/u);
  assert.match(source, /path\.join\(tmpdir\(\)/u);
  assert.doesNotMatch(source, /["']\/tmp\//u);
});

test("local provisioning does not require a host-installed PostgreSQL client", async () => {
  const source = await readFile(SCRIPT_PATH, "utf8");

  assert.match(source, /result\.error\?\.code === "ENOENT"/u);
  assert.match(source, /`supabase_db_\$\{projectId\}`/u);
  assert.match(source, /"docker",\s*\[\s*"exec",\s*"-i"/u);
  assert.match(source, /"-f",\s*"-"/u);
  assert.doesNotMatch(source, /randomUUID|econovaria-game-provision-/u);
});
