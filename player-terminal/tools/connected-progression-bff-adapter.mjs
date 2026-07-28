#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runPlayerBffAdaptedRunner } from "./connected-player-bff-runner-adapter.mjs";

const targetUrl = new URL("./connected-progression-mutation-runner.mjs", import.meta.url);
const targetPath = fileURLToPath(targetUrl);
const before = `async function openProgression(page) {
  const route = page.locator('[data-route="progression"]:visible').first();
  await route.waitFor({ state: "visible", timeout: 30_000 });
  await route.click();
  await page.waitForFunction(() => location.hash === "#progression", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-progression-page").waitFor({ state: "visible", timeout: 30_000 });
}`;
const after = `async function openProgression(page) {
  const profile = page.locator('[data-route="profile"]:visible').first();
  await profile.waitFor({ state: "visible", timeout: 30_000 });
  await profile.click();
  await page.waitForFunction(() => location.hash === "#profile", undefined, { timeout: 30_000 });

  const progression = page.locator('[data-route="progression"]:visible').first();
  await progression.waitFor({ state: "visible", timeout: 30_000 });
  await progression.click();
  await page.waitForFunction(() => location.hash === "#progression", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-progression-page").waitFor({ state: "visible", timeout: 30_000 });
}`;

const source = await readFile(targetPath, "utf8");
const matches = source.split(before).length - 1;
if (matches !== 1) {
  throw new Error(`Progression navigation adapter expected one canonical source match, found ${matches}.`);
}

const materializedDirectory = await mkdtemp(join(dirname(targetPath), ".connected-progression-navigation-"));
const materializedPath = join(materializedDirectory, "connected-progression-mutation-runner.mjs");
try {
  await writeFile(materializedPath, source.replace(before, after), "utf8");
  await runPlayerBffAdaptedRunner(pathToFileURL(materializedPath), "Progression");
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
