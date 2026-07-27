#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./connected-admin-ledger-runner-v4.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("./", import.meta.url);
const RETIRED_MATCHER = `/\\/functions\\/v1\\/web-session-api\\/proxy\\/games\\/[^/]+\\/players\\/[^/]+\\/ledger-adjustments$/u`;
const CANONICAL_MATCHER = `/\\/api\\/admin\\/games\\/[^/]+\\/players\\/[^/]+\\/ledger-adjustments$/u`;

let source = await readFile(CORE_URL, "utf8");
const occurrences = source.split(RETIRED_MATCHER).length - 1;
if (occurrences !== 1) {
  throw new Error(`Admin ledger response adapter expected one canonical matcher, found ${occurrences}.`);
}
source = source.replace(RETIRED_MATCHER, CANONICAL_MATCHER);

const materializedDirectory = await mkdtemp(
  join(fileURLToPath(SOURCE_DIRECTORY), ".connected-admin-ledger-materialized-"),
);
const materializedPath = join(materializedDirectory, "connected-admin-ledger-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
