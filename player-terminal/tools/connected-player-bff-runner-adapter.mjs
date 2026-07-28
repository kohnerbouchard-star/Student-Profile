#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function replaceAtLeastOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count < 1) {
    throw new Error(`${label} expected at least one canonical source match.`);
  }
  return source.replaceAll(before, after);
}

function preserveBffReplayHeaders(source, label) {
  let adapted = false;
  const result = source.replace(
    /const allowed = new Set\(\[([\s\S]*?)\]\);/gu,
    (match, body) => {
      if (!body.includes("x-player-session-token") || body.includes("x-econovaria-csrf-token")) {
        return match;
      }
      if (!body.includes('"x-request-id"')) {
        throw new Error(`${label} replay allowlist has no request-ID anchor.`);
      }
      adapted = true;
      return match.replace(
        '"x-request-id"',
        '"x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id"',
      );
    },
  );
  if (!adapted) {
    throw new Error(`${label} did not expose a Player replay header allowlist.`);
  }
  return result;
}

export async function runPlayerBffAdaptedRunner(targetUrl, label = "Connected Player journey") {
  const targetPath = fileURLToPath(targetUrl);
  let source = await readFile(targetPath, "utf8");

  source = replaceExactlyOnce(
    source,
    `${label} Player BFF login`,
    "/functions/v1/classroom-api/players/login",
    "/functions/v1/player-web-session-api/login",
  );
  source = replaceExactlyOnce(
    source,
    `${label} BFF evidence capture`,
    '    if (!url.includes("/functions/v1/classroom-api/")) return;',
    '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
  );
  source = preserveBffReplayHeaders(source, label);
  source = replaceAtLeastOnce(
    source,
    `${label} cookie-bound replay`,
    'fetch(url, { method, headers, body, cache: "no-store" })',
    'fetch(url, { method, headers, body, cache: "no-store", credentials: "include" })',
  );

  if (source.includes("/functions/v1/classroom-api/players/login")) {
    throw new Error(`${label} retained the retired Player login route.`);
  }

  const materializedDirectory = await mkdtemp(
    join(dirname(targetPath), `.${basename(targetPath, ".mjs")}-bff-materialized-`),
  );
  const materializedPath = join(materializedDirectory, basename(targetPath));
  try {
    await writeFile(materializedPath, source, "utf8");
    await import(pathToFileURL(materializedPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}
