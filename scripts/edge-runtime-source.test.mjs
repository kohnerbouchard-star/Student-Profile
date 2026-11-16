import "./finite-source-contract-readers.test.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { assertExtractedModulesReachable } from "./helpers/edge-runtime-source.mjs";

test("explicit source composition follows direct and transitive extracted imports", () => {
  const sources = new Map([
    ["root.ts", 'import { handler } from "./actions.ts";'],
    ["actions.ts", 'import { contract } from "./contracts.ts";'],
    ["contracts.ts", "export const contract = true;"],
  ]);
  assert.doesNotThrow(() => assertExtractedModulesReachable("root.ts", ["actions.ts", "contracts.ts"], sources));
});

test("disconnected helper source cannot satisfy a root contract", () => {
  const sources = new Map([
    ["root.ts", 'const unused = "./actions.ts";'],
    ["actions.ts", 'import { contract } from "./contracts.ts";'],
    ["contracts.ts", "export const contract = true;"],
  ]);
  assert.throws(() => assertExtractedModulesReachable("root.ts", ["actions.ts", "contracts.ts"], sources), /disconnected/);
});

test("composition never traverses dependencies outside the explicit extraction whitelist", () => {
  const sources = new Map([
    ["root.ts", 'import { handler } from "./unlisted.ts";'],
    ["unlisted.ts", 'export { handler } from "./actions.ts";'],
    ["actions.ts", "export const handler = true;"],
  ]);
  assert.throws(() => assertExtractedModulesReachable("root.ts", ["actions.ts"], sources), /disconnected/);
});

for (const [name, source] of [
  ["declaration-level type import", 'import type { handler } from "./actions.ts";'],
  ["specifier-level type import", 'import { type handler } from "./actions.ts";'],
  ["line comment", '// import { handler } from "./actions.ts";'],
  ["block comment", '/* import { handler } from "./actions.ts"; */'],
  ["template literal", 'const text = `import { handler } from "./actions.ts";`;'],
  ["quoted literal", 'const text = \'import { handler } from "./actions.ts";\';'],
]) {
  test(`source composition rejects ${name} as runtime reachability`, () => {
    const sources = new Map([["root.ts", source], ["actions.ts", "export const handler = true;"]]);
    assert.throws(() => assertExtractedModulesReachable("root.ts", ["actions.ts"], sources), /disconnected/);
  });
}

test("mixed type/value imports still establish runtime reachability", () => {
  const sources = new Map([
    ["root.ts", 'import { type Contract, handler } from "./actions.ts";'],
    ["actions.ts", "export const handler = true;"],
  ]);
  assert.doesNotThrow(() => assertExtractedModulesReachable("root.ts", ["actions.ts"], sources));
});

// Partial extraction must preserve held roots and the installed Browser reader.
import { readFileSync } from "node:fs";
import { readEdgeRuntimeSource } from "./helpers/edge-runtime-source.mjs";
import { readBrowserSourceSync } from "./lib/browser-module-source.mjs";

for (const [file, fragments] of [
  ["backend/supabase/functions/classroom-api/index.ts", ["dispatchPlayerWorldRoutes", "dispatchPlayerEconomyRoutes", "dispatchStaffRoutes", "createServiceClient"]],
  ["backend/supabase/functions/admin-api/index.ts", ["handleGlobalRoute"]],
  ["backend/supabase/functions/admin-api/readModels.ts", ["loadPlayers", "loadAttendance", "loadStore", "loadSettings", "pushByKey"]],
]) {
  test(`reviewed root composes its value-connected extraction: ${file}`, () => {
    const url = new URL(`../${file}`, import.meta.url);
    const source = readEdgeRuntimeSource(url);
    assert.notEqual(source, readFileSync(url, "utf8"));
    for (const fragment of fragments) assert.ok(source.includes(fragment));
  });
}
for (const file of ["backend/supabase/functions/admin-api/common.ts", "backend/supabase/functions/classroom-api/classroomClients.ts", "backend/supabase/functions/player-api/index.ts"]) {
  test(`unregistered root remains an ordinary raw read: ${file}`, () => {
    const url = new URL(`../${file}`, import.meta.url);
    assert.equal(readEdgeRuntimeSource(url), readFileSync(url, "utf8"));
  });
}
test("Edge reader preserves installed Browser extraction fallback", () => {
  const url = new URL("../admin/player-identity-wiring.js", import.meta.url);
  assert.equal(readEdgeRuntimeSource(url), readBrowserSourceSync(url, "utf8"));
  assert.notEqual(readEdgeRuntimeSource(url), readFileSync(url, "utf8"));
});
