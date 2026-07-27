#!/usr/bin/env node

import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

const CONNECTED_JOURNEYS = Object.freeze([
  "../player-terminal/tools/connected-world-questionnaire-runner.mjs",
  "../player-terminal/tools/connected-banking-loans-mutation-runner.mjs",
  "../player-terminal/tools/connected-marketplace-mutation-runner.mjs",
  "../player-terminal/tools/connected-progression-mutation-runner.mjs",
  "../player-terminal/tools/connected-story-delivery-mutation-runner.mjs",
  "../player-terminal/tools/connected-crafting-mutation-runner.mjs",
]);

try {
  for (const journey of CONNECTED_JOURNEYS) {
    resetLocalAcceptanceRateLimits();
    await import(journey);
  }
} finally {
  resetLocalAcceptanceRateLimits();
}
