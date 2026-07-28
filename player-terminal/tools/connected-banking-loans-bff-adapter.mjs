#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./connected-banking-loans-mutation-runner.mjs", import.meta.url);

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function preserveBffReplayHeaders(source) {
  return source.replace(
    /const allowed = new Set\(\[([\s\S]*?)\]\);/gu,
    (match, body) => {
      if (!body.includes("x-player-session-token") || body.includes("x-econovaria-csrf-token")) {
        return match;
      }
      if (!body.includes('"x-request-id"')) {
        throw new Error("Banking/Loans replay allowlist has no request-ID anchor.");
      }
      return match.replace(
        '"x-request-id"',
        '"x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id"',
      );
    },
  );
}

let source = await readFile(CORE_URL, "utf8");
source = replaceExactlyOnce(
  source,
  "Banking/Loans Player BFF login",
  "/functions/v1/classroom-api/players/login",
  "/functions/v1/player-web-session-api/login",
);
source = replaceExactlyOnce(
  source,
  "Banking/Loans BFF evidence capture",
  '    if (!url.includes("/functions/v1/classroom-api/")) return;',
  '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
);
source = preserveBffReplayHeaders(source);
source = replaceExactlyOnce(
  source,
  "Banking/Loans cookie-bound replay",
  'const response = await fetch(url, { method, headers, body, cache: "no-store" });',
  'const response = await fetch(url, { method, headers, body, cache: "no-store", credentials: "include" });',
);

if (source.includes("/functions/v1/classroom-api/players/login")) {
  throw new Error("Banking/Loans BFF adapter retained the retired Player login route.");
}

const entryPath = fileURLToPath(import.meta.url);
const materializedDirectory = await mkdtemp(
  join(dirname(entryPath), `.${basename(entryPath, ".mjs")}-materialized-`),
);
const materializedPath = join(materializedDirectory, "connected-banking-loans-mutation-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
