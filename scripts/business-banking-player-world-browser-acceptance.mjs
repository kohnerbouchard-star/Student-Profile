#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { runPlayerBffAdaptedRunner } from "../player-terminal/tools/connected-player-bff-runner-adapter.mjs";
import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CONNECTED_JOURNEYS = Object.freeze([
  Object.freeze({
    mode: "import",
    path: "../player-terminal/tools/connected-world-questionnaire-bff-adapter.mjs",
    label: "World questionnaire",
  }),
  Object.freeze({
    mode: "import",
    path: "../player-terminal/tools/connected-banking-loans-bff-adapter.mjs",
    label: "Banking and Loans",
  }),
  Object.freeze({
    mode: "adapt",
    path: "../player-terminal/tools/connected-marketplace-mutation-runner.mjs",
    label: "Marketplace",
  }),
  Object.freeze({
    mode: "import",
    path: "../player-terminal/tools/connected-progression-bff-adapter.mjs",
    label: "Progression",
  }),
  Object.freeze({
    mode: "import",
    path: "../player-terminal/tools/connected-story-delivery-bff-adapter.mjs",
    label: "Story delivery",
  }),
  Object.freeze({
    mode: "adapt",
    path: "../player-terminal/tools/connected-crafting-mutation-runner.mjs",
    label: "Crafting",
  }),
]);

function redact(value) {
  return String(value || "")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key-redacted]")
    .slice(0, 5000);
}

await mkdir(OUTPUT_DIR, { recursive: true });
const evidence = {
  generatedAt: new Date().toISOString(),
  journeys: [],
};
let failure;

try {
  for (const journey of CONNECTED_JOURNEYS) {
    const record = { label: journey.label, started: true, completed: false };
    evidence.journeys.push(record);
    try {
      resetLocalAcceptanceRateLimits();
      if (journey.mode === "adapt") {
        await runPlayerBffAdaptedRunner(new URL(journey.path, import.meta.url), journey.label);
      } else {
        await import(journey.path);
      }
      record.completed = true;
    } catch (error) {
      record.failure = redact(error?.stack || error);
      throw error;
    }
  }
} catch (error) {
  failure = error;
} finally {
  try {
    resetLocalAcceptanceRateLimits();
  } catch (error) {
    evidence.cleanupFailure = redact(error?.stack || error);
    failure ??= error;
  }
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/player-world-orchestrator-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, journeys: evidence.journeys }));
