#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const functionsRoot = join(backendRoot, "supabase", "functions");
const lockPath = join(functionsRoot, "deno.lock");
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

for (const [config, group] of groups) {
  const result = spawnSync(
    "deno",
    [
      "check",
      `--config=${config}`,
      `--lock=${lockPath}`,
      "--frozen",
      ...group.map((entry) => entry.entrypoint),
    ],
    { stdio: "inherit" },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(
  `Typechecked every Supabase Edge root (${entrypoints.length}): ${
    entrypoints.map((entry) => entry.slug).join(", ")
  }`,
);
