#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";
import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const ADAPTED_JOURNEY_CLI = fileURLToPath(
  new URL("./connected-player-bff-adapted-journey.mjs", import.meta.url),
);
const CONNECTED_JOURNEYS = Object.freeze([
  Object.freeze({
    mode: "direct",
    path: "../player-terminal/tools/connected-world-questionnaire-bff-adapter.mjs",
    label: "World questionnaire",
  }),
  Object.freeze({
    mode: "direct",
    path: "../player-terminal/tools/connected-banking-loans-bff-adapter.mjs",
    label: "Banking and Loans",
  }),
  Object.freeze({
    mode: "adapt",
    path: "../player-terminal/tools/connected-marketplace-mutation-runner.mjs",
    label: "Marketplace",
  }),
  Object.freeze({
    mode: "direct",
    path: "../player-terminal/tools/connected-progression-bff-adapter.mjs",
    label: "Progression",
  }),
  Object.freeze({
    mode: "direct",
    path: "../player-terminal/tools/connected-story-delivery-bff-adapter.mjs",
    label: "Story delivery",
  }),
  Object.freeze({
    mode: "direct",
    path: "../player-terminal/tools/connected-crafting-pack-activation.mjs",
    label: "Crafting pack activation",
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

function runJourney(journey) {
  const targetPath = fileURLToPath(new URL(journey.path, import.meta.url));
  const args = journey.mode === "adapt"
    ? [ADAPTED_JOURNEY_CLI, targetPath, journey.label]
    : [targetPath];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const suffix = result.signal ? ` after signal ${result.signal}` : "";
    throw new Error(`${journey.label} exited with status ${String(result.status)}${suffix}.`);
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
const evidence = {
  generatedAt: new Date().toISOString(),
  isolationPolicy: "fresh-warmed-edge-runtime-per-functional-journey",
  journeys: [],
};
let failure;

try {
  for (const journey of CONNECTED_JOURNEYS) {
    const record = {
      label: journey.label,
      started: true,
      isolated: false,
      completed: false,
    };
    evidence.journeys.push(record);
    try {
      resetLocalAcceptanceRateLimits();
      record.edgeRuntime = await restartLocalEdgeRuntime();
      record.isolated = true;
      runJourney(journey);
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
