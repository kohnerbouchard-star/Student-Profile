#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

const CORE_URL = new URL("./business-banking-player-state-controls-browser-acceptance-v2.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("./", import.meta.url);

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
    "state-control BFF evidence",
    '    if (!url.includes("/functions/v1/classroom-api/")) return;',
    '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
  );
  source = replaceExactlyOnce(
    source,
    "state-control BFF login",
    '    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",',
    '    (response) => response.url().includes("/functions/v1/player-web-session-api/login") && response.request().method() === "POST",',
  );
  if (source.includes('/functions/v1/classroom-api/players/login')) {
    throw new Error("Player state-control adapter retained the retired login route.");
  }

  materializedDirectory = await mkdtemp(
    join(fileURLToPath(SOURCE_DIRECTORY), ".player-state-controls-materialized-"),
  );
  const materializedPath = join(materializedDirectory, "player-state-controls-browser-acceptance.mjs");
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  if (materializedDirectory) {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
  resetLocalAcceptanceRateLimits();
}
