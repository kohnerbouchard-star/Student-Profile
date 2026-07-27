#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const coreUrl = new URL("./player-multiplayer-browser-acceptance-core.mjs", import.meta.url);
const source = await readFile(coreUrl, "utf8");
const legacyNeedle = 'response.url().includes("/functions/v1/player-api/players/login") &&';
const bffNeedle = 'response.url().includes("/functions/v1/player-web-session-api/login") &&';
const failedRequestNeedle = "const failed = requests.slice(startIndex).filter((entry) => entry.status >= 400);";
const failedRequestReplacement = `const failed = requests.slice(startIndex).filter((entry) => {
    if (entry.status < 400) return false;
    return !(
      label === "Admin bootstrap" &&
      entry.method === "GET" &&
      entry.status === 401 &&
      entry.url.endsWith("/functions/v1/web-session-api/status")
    );
  });`;

for (const [needle, label] of [
  [legacyNeedle, "legacy Player login wait"],
  [failedRequestNeedle, "failed-request filter"],
]) {
  const occurrences = source.split(needle).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Player multiplayer adapter expected one ${label}, found ${occurrences}.`,
    );
  }
}

const materialized = source
  .replace(legacyNeedle, bffNeedle)
  .replace(failedRequestNeedle, failedRequestReplacement);
if (
  materialized.includes(legacyNeedle) ||
  !materialized.includes(bffNeedle) ||
  materialized.includes(failedRequestNeedle)
) {
  throw new Error("Player multiplayer BFF adaptation did not materialize exactly.");
}

const scriptsDirectory = dirname(fileURLToPath(coreUrl));
const directory = await mkdtemp(join(scriptsDirectory, ".tmp-player-multiplayer-"));
const target = join(directory, "player-multiplayer-browser-acceptance.mjs");
try {
  await writeFile(target, materialized, "utf8");
  await import(`${pathToFileURL(target).href}?source=${encodeURIComponent(fileURLToPath(coreUrl))}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
