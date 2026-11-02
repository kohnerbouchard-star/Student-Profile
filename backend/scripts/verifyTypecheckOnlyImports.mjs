#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function verifyTypecheckOnlyImports(backendRoot, { includeClassroom = false } = {}) {
  const url = "https://esm.sh/tslib@2.8.1/denonext/tslib.mjs";
  const hash = "c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9";
  const read = (path) => JSON.parse(readFileSync(join(backendRoot, path), "utf8"));
  assert.equal(read("supabase/functions/deno.lock").remote?.[url], hash,
    "Original tslib lock entry changed");
  const mapPath = join(backendRoot, "scripts/typecheck-only/import-map.json");
  assert.deepEqual(JSON.parse(readFileSync(mapPath, "utf8")), {
    imports: { [url]: "./vendor/tslib-2.8.1/tslib.mjs" },
  }, "Typecheck map must contain only the exact accepted URL and local target");
  const modulePath = join(backendRoot, "scripts/typecheck-only/vendor/tslib-2.8.1/tslib.mjs");
  assert(lstatSync(modulePath).isFile(), "Accepted tslib must be a regular local file");
  const bytes = readFileSync(modulePath);
  assert.equal(bytes.length, 11226, "Accepted tslib byte length changed");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash,
    "Accepted local tslib hash changed");
  assert.deepEqual(read("supabase/functions/deno.json"), { compilerOptions: { strict: true } });
  assert.deepEqual(read("supabase/functions/admin-api/deno.json"), {
    compilerOptions: { strict: false, noImplicitAny: false, useUnknownInCatchVariables: false },
  });
  if (includeClassroom) {
    assert.deepEqual(read("supabase/functions/classroom-api/deno.json"), {
      tasks: { check: "deno check index.ts" }, compilerOptions: { strict: true },
    });
  }
  return mapPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 2, "No guard overrides are supported");
  verifyTypecheckOnlyImports(dirname(dirname(fileURLToPath(import.meta.url))));
  console.log("Verified original lock pin and accepted local tslib for CI typechecks only");
}
