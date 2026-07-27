#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function replaceRequired(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count < 1) {
    throw new Error(`${label} expected at least one canonical source match.`);
  }
  return source.replaceAll(before, after);
}

export async function runConnectedPlayerBffAcceptance(entryUrl) {
  const entryPath = fileURLToPath(entryUrl);
  const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
  if (corePath === entryPath) throw new Error("Connected Player acceptance entrypoint must use .mjs.");

  let source = await readFile(corePath, "utf8");
  source = replaceRequired(
    source,
    "Player BFF login",
    "/functions/v1/classroom-api/players/login",
    "/functions/v1/player-web-session-api/login",
  );
  source = source.replaceAll(
    '    if (!url.includes("/functions/v1/classroom-api/")) return;',
    '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
  );
  source = source.replaceAll(
    '"x-player-session-token", "x-request-id"',
    '"x-player-session-token", "x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id"',
  );
  source = source.replaceAll(
    '"x-player-session-token", "x-request-id",',
    '"x-player-session-token", "x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id",',
  );
  source = source.replaceAll(
    'cache: "no-store" });',
    'cache: "no-store", credentials: "include" });',
  );
  source = source.replaceAll(
    'cache: "no-store",\n    });',
    'cache: "no-store",\n      credentials: "include",\n    });',
  );

  if (source.includes("/functions/v1/classroom-api/players/login")) {
    throw new Error("Connected Player BFF loader retained the retired login route.");
  }

  const materializedDirectory = await mkdtemp(
    join(dirname(entryPath), `.${basename(entryPath, ".mjs")}-materialized-`),
  );
  const materializedPath = join(materializedDirectory, basename(entryPath));
  try {
    await writeFile(materializedPath, source, "utf8");
    await import(pathToFileURL(materializedPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}
