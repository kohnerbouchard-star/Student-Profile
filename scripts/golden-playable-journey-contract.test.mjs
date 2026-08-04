import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const WRAPPER_PATH = "scripts/player-multiplayer-browser-acceptance.mjs";
const CORE_PATH = "scripts/player-multiplayer-browser-acceptance-core.mjs";

test("golden playable journey executes one canonical source without runtime rewriting", async () => {
  const wrapper = await readFile(WRAPPER_PATH, "utf8");
  assert.match(
    wrapper,
    /^#!\/usr\/bin\/env node\s+import "\.\/player-multiplayer-browser-acceptance-core\.mjs";\s*$/u,
  );
  assert.doesNotMatch(
    wrapper,
    /mkdtemp|readFile|writeFile|replaceSection|materialized|pathToFileURL/u,
  );
});

test("golden playable journey crosses the production-style session boundaries", async () => {
  const source = await readFile(CORE_PATH, "utf8");
  assert.match(source, /\/functions\/v1\/web-session-api\/login/u);
  assert.match(source, /\/functions\/v1\/web-session-api\/proxy\/games/u);
  assert.match(source, /\/functions\/v1\/player-web-session-api\/login/u);
  assert.match(source, /page\.context\(\)\.request\.get/u);
  assert.match(source, /apikey: publishableKey/u);
  assert.doesNotMatch(source, /player-api\/players\/login/u);
  assert.doesNotMatch(source, /bootstrap-api\/staff\/signup/u);
});

test("golden playable journey proves a persisted owner-scoped code read without rotation", async () => {
  const source = await readFile(CORE_PATH, "utf8");
  assert.match(source, /readPersistedGameCodeThroughAdminBff/u);
  assert.match(
    source,
    /\/api\/admin\/games\/\$\{encodeURIComponent\(gameId\)\}\/join-code\/reset/u,
  );
  assert.match(source, /method: "GET"/u);
  assert.match(source, /assertJoinCodeWasReadWithoutRotation/u);
  assert.match(source, /entry\.method !== "GET"/u);
  assert.match(source, /gameCode !== persistedGameCode/u);
  assert.match(source, /failOnStatusCode: false/u);
});

test("disposable Admin privilege remains outside the browser contract", async () => {
  const source = await readFile(CORE_PATH, "utf8");
  assert.match(source, /localSupabaseAdminRuntime/u);
  assert.match(source, /assertDisposableLocalRuntime/u);
  assert.match(source, /inheritedDatabaseUrl: DATABASE_URL/u);
  assert.match(source, /gatewayUrl: BASE_URL/u);
  assert.match(source, /SERVICE_ROLE_KEY \|\| values\.SECRET_KEY/u);
  assert.match(source, /Admin browser storage exposed Staff credentials/u);
  assert.match(source, /Browser exposed Authorization/u);
  assert.doesNotMatch(source, /sessionStorage\.setItem\([^\n]*(?:service|secret|accessToken|refreshToken)/iu);
});
