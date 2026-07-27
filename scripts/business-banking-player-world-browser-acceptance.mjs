#!/usr/bin/env node

const CONNECTED_JOURNEYS = Object.freeze([
  "../player-terminal/tools/connected-world-questionnaire-runner.mjs",
  "../player-terminal/tools/connected-banking-loans-mutation-runner.mjs",
  "../player-terminal/tools/connected-marketplace-mutation-runner.mjs",
  "../player-terminal/tools/connected-progression-mutation-runner.mjs",
  "../player-terminal/tools/connected-story-delivery-mutation-runner.mjs",
  "../player-terminal/tools/connected-crafting-mutation-runner.mjs",
]);

for (const journey of CONNECTED_JOURNEYS) {
  await import(journey);
}
