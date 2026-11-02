#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function verifyTypecheckOnlyImports(backendRoot) {
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
  assert.deepEqual(read("supabase/functions/classroom-api/deno.json"), {
    tasks: { check: "deno check index.ts" }, compilerOptions: { strict: true },
  });
  return mapPath;
}

function discover(backendRoot) {
  const functionsRoot = join(backendRoot, "supabase", "functions");
  const defaultConfig = join(functionsRoot, "deno.json");
  const configOverrides = new Map([
    ["admin-api", join(functionsRoot, "admin-api", "deno.json")],
    ["classroom-api", join(functionsRoot, "classroom-api", "deno.json")],
  ]);

  const codeUnitOrder = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const entrypoints = readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      slug: entry.name,
      entrypoint: join(functionsRoot, entry.name, "index.ts"),
    }))
    .filter((entry) => existsSync(entry.entrypoint))
    .sort((left, right) => codeUnitOrder(left.slug, right.slug));

  if (entrypoints.length === 0) {
    throw new Error("No Supabase Edge function entrypoints were discovered.");
  }

  const groups = new Map();
  for (const entry of entrypoints) {
    const config = configOverrides.get(entry.slug) ?? defaultConfig;
    const group = groups.get(config) ?? [];
    group.push(entry);
    groups.set(config, group);
  }

  return { entrypoints, groups };
}

export function edgeRootTypecheckPlan(backendRoot) {
  const { groups } = discover(backendRoot);
  return [...groups].map(([config, group]) => [
    "check",
    `--config=${config}`,
    `--lock=${join(backendRoot, "supabase/functions/deno.lock")}`,
    "--frozen",
    `--import-map=${join(backendRoot, "scripts/typecheck-only/import-map.json")}`,
    ...group.map((entry) => entry.entrypoint),
  ]);
}

export function validateEdgeRootTypecheckPlan(plan, backendRoot) {
  const mapPath = verifyTypecheckOnlyImports(backendRoot);
  const { groups } = discover(backendRoot);
  assert.equal(plan.length, groups.size, "A config group was omitted or added");
  [...groups].forEach(([config, entries], index) => {
    const args = plan[index];
    assert.deepEqual(args.slice(0, 5), [
      "check", `--config=${config}`,
      `--lock=${join(backendRoot, "supabase/functions/deno.lock")}`,
      "--frozen", `--import-map=${mapPath}`,
    ], "Typecheck config, lock, frozen or exact map operand changed");
    assert.deepEqual(args.slice(5), entries.map((entry) => entry.entrypoint),
      "Every discovered root must retain its original config group and order");
  });
}

export function runEdgeRootTypechecks(backendRoot, run = spawnSync) {
  const plan = edgeRootTypecheckPlan(backendRoot);
  validateEdgeRootTypecheckPlan(plan, backendRoot);
  for (const args of plan) {
    verifyTypecheckOnlyImports(backendRoot);
    const result = run(
      "deno",
      args,
      { stdio: "inherit" },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }

  const { entrypoints } = discover(backendRoot);
  console.log(
    `Typechecked every Supabase Edge root (${entrypoints.length}): ${
      entrypoints.map((entry) => entry.slug).join(", ")
    }`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runEdgeRootTypechecks(dirname(dirname(fileURLToPath(import.meta.url))));
}
