import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const indexSource = read("backend/supabase/functions/admin-api/index.ts");
const localMutationSource = read(
  "backend/supabase/functions/admin-api/localGameMutations.ts",
);
const adminContextSource = read(
  "backend/supabase/functions/admin-api/adminRequestApplicationContext.ts",
);
const redemptionSource = read(
  "backend/supabase/functions/admin-api/inventoryRedemptionOperations.ts",
);
const gameRoutesSource = read(
  "backend/supabase/functions/admin-api/gameRoutes.ts",
);
const joinCodeOperationsSource = read(
  "backend/supabase/functions/admin-api/gameJoinCodeOperations.ts",
);
const compatibilitySource = read(
  "backend/supabase/functions/admin-api/compatibilityOperations.ts",
);
const readModelsSource = read(
  "backend/supabase/functions/admin-api/readModels.ts",
);
const commonSource = read("backend/supabase/functions/admin-api/common.ts");

test("Admin boundary runs once before owner-scoped local mutation dispatch", () => {
  const serveSource = indexSource.slice(indexSource.indexOf("Deno.serve("));
  const contextIndex = serveSource.indexOf("await resolveContext(request)");
  const securityIndex = serveSource.indexOf("await guardAdminRequest(");
  const ownershipIndex = serveSource.indexOf("ensureOwnedGame(securedContext, gameId)");
  const applicationContextIndex = serveSource.indexOf(
    "createAdminRequestApplicationContext({",
  );
  const localIndex = serveSource.indexOf("await handleLocalAdminGameMutation(");
  const compatibilityWriteIndex = serveSource.indexOf("await handleGameWrite(");

  assert.ok(contextIndex >= 0, "Admin authentication context must be resolved");
  assert.ok(securityIndex > contextIndex, "security must follow authentication");
  assert.ok(ownershipIndex > securityIndex, "ownership must follow security");
  assert.ok(
    applicationContextIndex > ownershipIndex,
    "application context projection must follow owned-game validation",
  );
  assert.ok(localIndex > ownershipIndex, "local handlers must follow ownership");
  assert.ok(
    compatibilityWriteIndex > localIndex,
    "legacy writes must not run before local mutation dispatch",
  );
  assert.equal(
    serveSource.match(/await guardAdminRequest\(/g)?.length,
    1,
    "Admin permission, AAL2, and user-action rate limiting must run once",
  );
  assert.equal(
    serveSource.match(/createAdminRequestApplicationContext\(\{/g)?.length,
    1,
    "the immutable Admin application context must be projected once",
  );
  assert.equal(
    serveSource.match(/await handleLocalAdminGameMutation\(/g)?.length,
    1,
    "the local mutation dispatcher must run once",
  );
});

test("reviewed Admin context reaches the Inventory application adapter", () => {
  assert.match(indexSource, /ownedGame:\s*game/);
  assert.match(indexSource, /staffUserId:\s*securedContext\.staff\.id/);
  assert.match(indexSource, /requestId:\s*crypto\.randomUUID\(\)/);
  assert.match(
    indexSource,
    /handleInventoryRedemptionOperation\([\s\S]*?applicationContext,/,
  );
  assert.match(
    redemptionSource,
    /input\.applicationContext\.gameSessionId/,
  );
  assert.match(
    redemptionSource,
    /input\.applicationContext\.actor\.staffUserId/,
  );
  assert.doesNotMatch(
    adminContextSource,
    /\b(?:token|service|authorization|email)\s*:/i,
  );
});

test("one reviewed Admin context reaches every Game Sessions persistence seam", () => {
  assert.match(
    indexSource,
    /handleLocalAdminGameMutation\([\s\S]*?applicationContext,[\s\S]*?handleGameRead\([\s\S]*?applicationContext,/,
  );
  assert.match(
    gameRoutesSource,
    /handleGameJoinCodeReadOperation\([\s\S]*?applicationContext,/,
  );
  assert.match(
    gameRoutesSource,
    /loadSettings\([\s\S]*?createSupabaseGameSettingsReadRepository\([\s\S]*?applicationContext,/,
  );
  assert.match(joinCodeOperationsSource, /await read\(input\)/);
  assert.match(
    localMutationSource,
    /updateGameSettings\([\s\S]*?createSupabaseGameSessionMutationRepository\([\s\S]*?applicationContext: input\.applicationContext/,
  );
  assert.match(
    localMutationSource,
    /rotateGameJoinCode\([\s\S]*?createSupabaseGameSessionMutationRepository\([\s\S]*?applicationContext: input\.applicationContext/,
  );
  assert.match(
    compatibilitySource,
    /resetGameSettingsGroup\([\s\S]*?createSupabaseGameSessionMutationRepository\([\s\S]*?applicationContext: input\.applicationContext/,
  );
  assert.match(
    readModelsSource,
    /readAdminGameSettingsView\(\{\s*applicationContext,?\s*\}\)/,
  );
  for (const source of [
    gameRoutesSource,
    joinCodeOperationsSource,
    localMutationSource,
    compatibilitySource,
    readModelsSource,
  ]) {
    assert.doesNotMatch(source, /gameSessionId:\s*input\.gameSessionId/);
    assert.doesNotMatch(source, /staffUserId:\s*input\.staffUserId/);
  }
});

test("affected Admin operations dispatch to shared application handlers", () => {
  for (const handler of [
    "createPlayerForAuthorizedStaff",
    "recordAttendanceScanForAuthorizedStaff",
    "recordManualAttendanceForAuthorizedStaff",
    "mutateAdminStoreItem",
    "mutateAdminContract",
    "updateGameSettings",
    "rotateGameJoinCode",
  ]) {
    assert.match(
      localMutationSource,
      new RegExp(`\\b${handler}\\b`),
      `${handler} must remain wired locally`,
    );
  }

  assert.doesNotMatch(localMutationSource, /\b(?:fetchClassroom|proxyClassroom)\b/);
  assert.doesNotMatch(localMutationSource, /\bfetch\s*\(/);
  assert.doesNotMatch(localMutationSource, /service[_-]?role.*bearer/i);
});

test("the Classroom proxy rejects every affected mutation family before fetch", () => {
  assert.match(commonSource, /isAdminLocalMutationProxyPath\(path, method\)/);
  assert.match(commonSource, /ADMIN_LOCAL_MUTATION_PROXY_FORBIDDEN/);

  for (const routeEvidence of [
    '"/players"',
    '"/attendance/scan"',
    '"/attendance/scans"',
    '"/attendance/corrections"',
    '"/store/items"',
    '"/contracts"',
    '"/join-code/reset"',
    "archive|duplicate",
    "restock|rebalance-price",
    'scopedPath) || /^\\/settings',
  ]) {
    assert.ok(
      commonSource.includes(routeEvidence),
      `missing no-proxy route evidence for ${routeEvidence}`,
    );
  }
});
