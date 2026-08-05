import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const indexSource = read("backend/supabase/functions/admin-api/index.ts");
const localMutationSource = read(
  "backend/supabase/functions/admin-api/localGameMutations.ts",
);
const commonSource = read("backend/supabase/functions/admin-api/common.ts");

test("Admin boundary runs once before owner-scoped local mutation dispatch", () => {
  const serveSource = indexSource.slice(indexSource.indexOf("Deno.serve("));
  const contextIndex = serveSource.indexOf("await resolveContext(request)");
  const securityIndex = serveSource.indexOf("await guardAdminRequest(");
  const ownershipIndex = serveSource.indexOf("ensureOwnedGame(securedContext, gameId)");
  const localIndex = serveSource.indexOf("await handleLocalAdminGameMutation(");
  const compatibilityWriteIndex = serveSource.indexOf("await handleGameWrite(");

  assert.ok(contextIndex >= 0, "Admin authentication context must be resolved");
  assert.ok(securityIndex > contextIndex, "security must follow authentication");
  assert.ok(ownershipIndex > securityIndex, "ownership must follow security");
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
    serveSource.match(/await handleLocalAdminGameMutation\(/g)?.length,
    1,
    "the local mutation dispatcher must run once",
  );
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
