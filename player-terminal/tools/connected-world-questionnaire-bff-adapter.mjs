#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./connected-world-questionnaire-runner.mjs", import.meta.url);

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
        throw new Error("World replay allowlist has no request-ID anchor.");
      }
      return match.replace(
        '"x-request-id"',
        '"x-econovaria-csrf-token",\n    "x-econovaria-device-id",\n    "x-request-id"',
      );
    },
  );
}

let source = await readFile(CORE_URL, "utf8");
source = replaceExactlyOnce(
  source,
  "World Player BFF login",
  "/functions/v1/classroom-api/players/login",
  "/functions/v1/player-web-session-api/login",
);
source = replaceExactlyOnce(
  source,
  "World BFF evidence capture",
  '    if (!url.includes("/functions/v1/classroom-api/")) return;',
  '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
);
source = preserveBffReplayHeaders(source);
source = replaceExactlyOnce(
  source,
  "World questionnaire selection stabilization",
  `  evidence.questionnaire.optionCountsValid = true;

  const responsePromise = page.waitForResponse(`,
  `  let stableSelectionPasses = 0;
  for (let attempt = 0; attempt < 6 && stableSelectionPasses < 2; attempt += 1) {
    const currentFieldsets = form.locator("fieldset");
    if (await currentFieldsets.count() !== questionCount) {
      stableSelectionPasses = 0;
      await page.waitForTimeout(150);
      continue;
    }
    for (let index = 0; index < questionCount; index += 1) {
      const firstOption = currentFieldsets.nth(index).locator('input[type="radio"]').first();
      if (!await firstOption.isChecked()) await firstOption.check();
    }
    await page.waitForTimeout(150);
    const selectedAnswerCount = await form.locator('input[type="radio"]:checked').count();
    stableSelectionPasses = selectedAnswerCount === questionCount
      ? stableSelectionPasses + 1
      : 0;
  }
  const selectedAnswerCount = await form.locator('input[type="radio"]:checked').count();
  if (selectedAnswerCount !== questionCount) {
    throw new Error(\`Arrival questionnaire retained \${selectedAnswerCount} selected answers; expected \${questionCount}.\`);
  }
  evidence.questionnaire.optionCountsValid = true;

  const responsePromise = page.waitForResponse(`,
);
source = replaceExactlyOnce(
  source,
  "World questionnaire error evidence",
  '    throw new Error(`Arrival questionnaire returned an invalid ${response.status()} response.`);',
  '    throw new Error(`Arrival questionnaire returned an invalid ${response.status()} response (${String(payload?.error?.code || "unknown_error")}).`);',
);
source = replaceExactlyOnce(
  source,
  "World cookie-bound residency replay",
  'const response = await fetch(url, { method, headers, body, cache: "no-store" });',
  'const response = await fetch(url, { method, headers, body, cache: "no-store", credentials: "include" });',
);

if (source.includes("/functions/v1/classroom-api/players/login")) {
  throw new Error("World BFF adapter retained the retired Player login route.");
}

const entryPath = fileURLToPath(import.meta.url);
const materializedDirectory = await mkdtemp(
  join(dirname(entryPath), `.${basename(entryPath, ".mjs")}-materialized-`),
);
const materializedPath = join(materializedDirectory, "connected-world-questionnaire-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
