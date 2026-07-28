#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";

function replaceExactlyOnce(source, label, before, after) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${matches}.`);
  }
  return source.replace(before, () => after);
}

function replaceAtLeastOnce(source, label, before, after) {
  const matches = source.split(before).length - 1;
  if (matches < 1) {
    throw new Error(`${label} expected at least one canonical source match.`);
  }
  return source.replaceAll(before, after);
}

function preserveBffReplayHeaders(source) {
  let adapted = false;
  const result = source.replace(
    /const allowed = new Set\(\[([\s\S]*?)\]\);/gu,
    (match, body) => {
      if (!body.includes("x-player-session-token") || body.includes("x-econovaria-csrf-token")) {
        return match;
      }
      if (!body.includes('"x-request-id"')) {
        throw new Error("Story replay header allowlist has no request-ID anchor.");
      }
      adapted = true;
      return match.replace(
        '"x-request-id"',
        '"x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id"',
      );
    },
  );
  if (!adapted) {
    throw new Error("Story runner did not expose a Player replay header allowlist.");
  }
  return result;
}

function redact(value) {
  return String(value || "")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key-redacted]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[uuid-redacted]")
    .slice(0, 5000);
}

async function run() {
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
  source = preserveBffReplayHeaders(source);
  source = replaceAtLeastOnce(
    source,
    "Story cookie-bound replay",
    'fetch(url, { method, headers, body, cache: "no-store" })',
    'fetch(url, { method, headers, body, cache: "no-store", credentials: "include" })',
  );

  if (source.includes("/functions/v1/classroom-api/players/login")) {
    throw new Error("Story adapter retained the retired Player login route.");
  }
  if (!source.includes("x-econovaria-csrf-token") || !source.includes('credentials: "include"')) {
    throw new Error("Story adapter did not preserve the cookie-bound replay contract.");
  }

  const materializedDirectory = await mkdtemp(join(dirname(targetPath), ".connected-story-delivery-bff-"));
  const materializedPath = join(materializedDirectory, "connected-story-delivery-mutation-runner.mjs");
  try {
    await writeFile(materializedPath, source, "utf8");
    await import(pathToFileURL(materializedPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}

try {
  await run();
} catch (error) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    `${OUTPUT_DIR}/player-story-delivery-adapter-failure.json`,
    `${JSON.stringify({ failure: redact(error?.stack || error) }, null, 2)}\n`,
    "utf8",
  );
  throw error;
}
