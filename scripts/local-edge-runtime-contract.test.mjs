import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONFIG = new URL("../backend/supabase/config.toml", import.meta.url);
const PACKAGE = new URL("../package.json", import.meta.url);
const PLAYER_API = new URL(
  "../backend/supabase/functions/player-api/index.ts",
  import.meta.url,
);
const BOOTSTRAP_API = new URL(
  "../backend/supabase/functions/bootstrap-api/index.ts",
  import.meta.url,
);
const STAFF_API = new URL(
  "../backend/supabase/functions/staff-api/index.ts",
  import.meta.url,
);

function section(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] || "";
}

test("local Supabase starts the split Edge Functions runtime", async () => {
  const [config, packageSource, playerApi, bootstrapApi, staffApi] =
    await Promise.all([
      readFile(CONFIG, "utf8"),
      readFile(PACKAGE, "utf8"),
      readFile(PLAYER_API, "utf8"),
      readFile(BOOTSTRAP_API, "utf8"),
      readFile(STAFF_API, "utf8"),
    ]);

  assert.match(section(config, "edge_runtime"), /(?:^|\n)enabled\s*=\s*true(?:\s|$)/);
  assert.match(section(config, "functions.player-api"), /verify_jwt\s*=\s*false/);
  assert.match(section(config, "functions.bootstrap-api"), /verify_jwt\s*=\s*false/);
  assert.match(section(config, "functions.staff-api"), /verify_jwt\s*=\s*true/);
  assert.match(section(config, "functions.admin-api"), /verify_jwt\s*=\s*true/);
  assert.match(section(config, "functions.classroom-api"), /verify_jwt\s*=\s*true/);

  const falseSections = [...config.matchAll(
    /\[functions\.([^\]]+)\][\s\S]*?verify_jwt\s*=\s*false(?=\s|$)/g,
  )].map((match) => match[1]);
  assert.deepEqual(falseSections.sort(), ["bootstrap-api", "player-api"]);

  for (const source of [playerApi, bootstrapApi, staffApi]) {
    assert.match(source, /requirePublishableRequest\(request\)/);
    assert.doesNotMatch(source, /Authorization[^\n]+sb_publishable_/i);
  }
  assert.match(staffApi, /resolveStaffForRequest/);
  assert.match(staffApi, /handleStaffBootstrapRequest/);
  assert.match(playerApi, /x-player-session-token|dispatchRateLimitedReviewedPlayerRequest/);
  assert.match(bootstrapApi, /handleStaffSignupRequest/);

  const packageJson = JSON.parse(packageSource);
  const localCommand = packageJson.scripts?.["dev:local"] || "";
  assert.match(localCommand, /supabase start --workdir backend/);
  assert.match(localCommand, /econovaria-local-gateway\.py --local-supabase/);
});
