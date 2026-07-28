#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

const CORE_URL = new URL("../player-terminal/tools/connected-player-mutation-runner.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("../player-terminal/tools/", import.meta.url);

function replaceExactlyOnce(source, label, before, after) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${occurrences}.`);
  }
  return source.replace(before, after);
}

resetLocalAcceptanceRateLimits();
let materializedDirectory = "";
try {
  let source = await readFile(CORE_URL, "utf8");
  source = replaceExactlyOnce(
    source,
    "Player BFF response evidence",
    '    if (!url.includes("/functions/v1/classroom-api/")) return;',
    '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
  );
  source = replaceExactlyOnce(
    source,
    "Player BFF login response",
    '    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",',
    '    (response) => response.url().includes("/functions/v1/player-web-session-api/login") && response.request().method() === "POST",',
  );
  if (source.includes('/functions/v1/classroom-api/players/login')) {
    throw new Error("Connected Player mutation adapter retained the retired login route.");
  }

  materializedDirectory = await mkdtemp(
    join(fileURLToPath(SOURCE_DIRECTORY), ".connected-player-mutation-materialized-"),
  );
  const materializedPath = join(materializedDirectory, "connected-player-mutation-runner.mjs");
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  if (materializedDirectory) {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
  resetLocalAcceptanceRateLimits();
}
