#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const coreUrl = new URL("./player-multiplayer-browser-acceptance-core.mjs", import.meta.url);
const source = await readFile(coreUrl, "utf8");
const legacyNeedle = 'response.url().includes("/functions/v1/player-api/players/login") &&';
const bffNeedle = 'response.url().includes("/functions/v1/player-web-session-api/login") &&';
const occurrences = source.split(legacyNeedle).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Player multiplayer adapter expected one legacy login wait, found ${occurrences}.`,
  );
}

const materialized = source.replace(legacyNeedle, bffNeedle);
if (materialized.includes(legacyNeedle) || !materialized.includes(bffNeedle)) {
  throw new Error("Player multiplayer BFF login adaptation did not materialize exactly.");
}

const directory = await mkdtemp(join(tmpdir(), "econovaria-player-multiplayer-"));
const target = join(directory, "player-multiplayer-browser-acceptance.mjs");
try {
  await writeFile(target, materialized, "utf8");
  await import(`${pathToFileURL(target).href}?source=${encodeURIComponent(fileURLToPath(coreUrl))}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
