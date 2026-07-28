#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function replaceExactlyOnce(source, label, before, after) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${matches}.`);
  }
  return source.replace(before, after);
}

const targetUrl = new URL("./connected-story-delivery-mutation-runner.mjs", import.meta.url);
const targetPath = fileURLToPath(targetUrl);
let source = await readFile(targetPath, "utf8");

source = replaceExactlyOnce(
  source,
  "Story Player BFF login",
  "/functions/v1/classroom-api/players/login",
  "/functions/v1/player-web-session-api/login",
);
source = replaceExactlyOnce(
  source,
  "Story BFF evidence capture",
  '    if (!url.includes("/functions/v1/classroom-api/")) return;',
  '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
);
source = replaceExactlyOnce(
  source,
  "Story BFF replay headers",
  `  const allowed = new Set([
    "accept", "apikey", "authorization", "content-type",
    "x-player-session-token", "x-request-id",
  ]);`,
  `  const allowed = new Set([
    "accept", "apikey", "authorization", "content-type",
    "x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id",
  ]);`,
);
source = replaceExactlyOnce(
  source,
  "Story cookie-bound replay",
  'fetch(url, { method, headers, body, cache: "no-store" })',
  'fetch(url, { method, headers, body, cache: "no-store", credentials: "include" })',
);

if (source.includes("/functions/v1/classroom-api/players/login")) {
  throw new Error("Story adapter retained the retired Player login route.");
}

const materializedDirectory = await mkdtemp(join(dirname(targetPath), ".connected-story-delivery-bff-"));
const materializedPath = join(materializedDirectory, "connected-story-delivery-mutation-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
