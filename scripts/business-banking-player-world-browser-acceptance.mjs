#!/usr/bin/env node

import { runPlayerBffAdaptedRunner } from "../player-terminal/tools/connected-player-bff-runner-adapter.mjs";
import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

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
    mode: "adapt",
    path: "../player-terminal/tools/connected-progression-mutation-runner.mjs",
    label: "Progression",
  }),
  Object.freeze({
    mode: "adapt",
    path: "../player-terminal/tools/connected-story-delivery-mutation-runner.mjs",
    label: "Story delivery",
  }),
  Object.freeze({
    mode: "adapt",
    path: "../player-terminal/tools/connected-crafting-mutation-runner.mjs",
    label: "Crafting",
  }),
]);

try {
  for (const journey of CONNECTED_JOURNEYS) {
    resetLocalAcceptanceRateLimits();
    if (journey.mode === "adapt") {
      await runPlayerBffAdaptedRunner(new URL(journey.path, import.meta.url), journey.label);
    } else {
      await import(journey.path);
    }
  }
} finally {
  resetLocalAcceptanceRateLimits();
}
