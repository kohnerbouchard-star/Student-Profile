#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./admin-browser-reconnaissance-core.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("./", import.meta.url);

function replaceExactlyOnce(source, label, before, after) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${occurrences}.`);
  }
  return source.replace(before, after);
}

let source = await readFile(CORE_URL, "utf8");
source = replaceExactlyOnce(
  source,
  "Share modal settlement",
  `async function closeShareModal(modal) {
  await page.keyboard.press("Escape");
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]:visible').first();
    if (await close.count()) await close.click();
  }
}`,
  `async function closeShareModal(modal) {
  await page.keyboard.press("Escape");
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]:visible').first();
    if (await close.count()) await close.click();
  }
  await modal.waitFor({ state: "hidden", timeout: 10_000 });
}`,
);
source = replaceExactlyOnce(
  source,
  "Player creation BFF route",
  `(candidate) => /\\/functions\\/v1\\/admin-api\\/games\\/[^/]+\\/players$/.test(new URL(candidate.url()).pathname) &&`,
  `(candidate) => /\\/functions\\/v1\\/web-session-api\\/proxy\\/games\\/[^/]+\\/players$/.test(new URL(candidate.url()).pathname) &&`,
);

const materializedDirectory = await mkdtemp(join(fileURLToPath(SOURCE_DIRECTORY), ".admin-browser-materialized-"));
const materializedPath = join(materializedDirectory, "admin-browser-reconnaissance.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
