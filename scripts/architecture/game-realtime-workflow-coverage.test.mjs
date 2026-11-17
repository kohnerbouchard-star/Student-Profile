import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflows = new URL("../../.github/workflows/", import.meta.url);

test("game-public realtime retains former Dashboard workflow path coverage", () => {
  for (const name of [
    "player-multiplayer-load-e2e.yml",
    "business-financial-market.yml",
    "player-response-privacy.yml",
  ]) {
    const source = readFileSync(new URL(name, workflows), "utf8");
    assert.equal(
      source.split('"backend/src/domains/game-realtime/**"').length - 1,
      source.split('"backend/src/domains/game-dashboard/**"').length - 1,
      `${name} must cover the relocated realtime domain alongside Dashboard`,
    );
    assert.ok(source.includes('"backend/src/domains/game-realtime/**"'), name);
  }
  const currency = readFileSync(new URL("player-local-currency-authority.yml", workflows), "utf8");
  assert.equal(
    currency.split('"backend/src/domains/game-realtime/gamePublicRealtimeEvents.ts"').length - 1,
    currency.split('"backend/src/domains/game-dashboard/contracts/playerGameDashboardContracts.ts"').length - 1,
  );
  assert.equal(currency.split('"backend/src/domains/game-realtime/gamePublicRealtimeEvents.ts"').length - 1, 2);
});
