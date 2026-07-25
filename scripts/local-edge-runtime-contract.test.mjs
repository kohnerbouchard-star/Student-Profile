import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONFIG = new URL("../backend/supabase/config.toml", import.meta.url);
const PACKAGE = new URL("../package.json", import.meta.url);

function section(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] || "";
}

test("local Supabase starts the Edge Functions runtime used by Admin and Player APIs", async () => {
  const [config, packageSource] = await Promise.all([
    readFile(CONFIG, "utf8"),
    readFile(PACKAGE, "utf8"),
  ]);
  const edgeRuntime = section(config, "edge_runtime");

  assert.match(edgeRuntime, /(?:^|\n)enabled\s*=\s*true(?:\s|$)/);
  assert.doesNotMatch(config, /verify_jwt\s*=\s*false/);

  const packageJson = JSON.parse(packageSource);
  assert.match(packageJson.scripts?.["dev:local"] || "", /supabase start --workdir backend/);
  assert.match(packageJson.scripts?.["dev:local"] || "", /local-staging-gateway\.py --local-supabase/);
});
