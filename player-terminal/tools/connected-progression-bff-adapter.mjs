#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runPlayerBffAdaptedRunner } from "./connected-player-bff-runner-adapter.mjs";

function replaceExactlyOnce(source, label, before, after) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${matches}.`);
  }
  return source.replace(before, after);
}

const targetUrl = new URL("./connected-progression-mutation-runner.mjs", import.meta.url);
const targetPath = fileURLToPath(targetUrl);
let source = await readFile(targetPath, "utf8");

source = replaceExactlyOnce(
  source,
  "Progression canonical XP fixture",
  `      update public.player_progression_profiles
      set experience = 250,
          level = 3,`,
  `      update public.player_progression_profiles
      set experience = public.progression_level_threshold_v1(3),
          level = public.progression_level_for_experience_v1(
            public.progression_level_threshold_v1(3)
          ),`,
);

source = replaceExactlyOnce(
  source,
  "Progression profile-first stable navigation",
  `async function openProgression(page) {
  const route = page.locator('[data-route="progression"]:visible').first();
  await route.waitFor({ state: "visible", timeout: 30_000 });
  await route.click();
  await page.waitForFunction(() => location.hash === "#progression", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-progression-page").waitFor({ state: "visible", timeout: 30_000 });
}`,
  `async function openProgression(page) {
  const profile = page.locator('[data-route="profile"]:visible').first();
  await profile.waitFor({ state: "visible", timeout: 30_000 });
  await profile.click();
  await page.waitForFunction(() => location.hash === "#profile", undefined, { timeout: 30_000 });

  const progression = page.locator('[data-route="progression"]:visible').first();
  await progression.waitFor({ state: "visible", timeout: 30_000 });
  const progressionResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/progression") && response.request().method() === "GET",
    { timeout: 60_000 },
  );
  await progression.click();
  await page.waitForFunction(() => location.hash === "#progression", undefined, { timeout: 30_000 });
  const response = await progressionResponse;
  if (response.status() !== 200) throw new Error("Progression route returned " + response.status() + ".");

  await page.waitForFunction(() => {
    return Boolean(
      document.querySelector('[data-player-progression-tab="Skills"]') ||
      document.querySelector(".player-terminal-route-error"),
    );
  }, undefined, { timeout: 30_000 });

  const routeError = page.locator(".player-terminal-route-error");
  if (await routeError.isVisible().catch(() => false)) {
    throw new Error("Progression route failed after a successful response: " + String(await routeError.innerText()));
  }

  await page.locator(".player-terminal-progression-page").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('[data-player-progression-tab="Skills"]').waitFor({ state: "visible", timeout: 30_000 });
}`,
);

const materializedDirectory = await mkdtemp(join(dirname(targetPath), ".connected-progression-navigation-"));
const materializedPath = join(materializedDirectory, "connected-progression-mutation-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await runPlayerBffAdaptedRunner(pathToFileURL(materializedPath), "Progression");
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
