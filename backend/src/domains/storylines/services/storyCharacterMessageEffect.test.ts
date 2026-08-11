import { parseStoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryEffectExecutionDependencies,
  StoryPlayerImpactWriteInput,
} from "../contracts/storyEffectExecutionContracts.ts";
import { executeStoryEffect } from "./storyEffectEngine.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("character_message becomes a player-scoped durable impact for canonical Messaging delivery", async () => {
  const impacts: StoryPlayerImpactWriteInput[] = [];
  const dependencies: StoryEffectExecutionDependencies = {
    ledger: { async recordCashAdjustment() { return {}; } },
    policies: { async upsertPolicy() { return {}; } },
    flags: { async setStoryFlag() { return {}; } },
    impacts: {
      async createPlayerImpact(input) {
        impacts.push(input);
        return { id: "impact-1" };
      },
    },
  };

  const result = await executeStoryEffect({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    effectIndex: 2,
    now: "2026-08-11T11:00:00.000Z",
    playerContext: {
      playerId: "player-1",
      gameSessionId: "game-1",
      homeCountryId: "home-1",
      homeCountryCode: "YRETHIA",
      currentCountryId: "country-1",
      currentCountryCode: "NORTHREACH",
      cashBalance: 500,
      resources: {},
      sectorExposurePct: {},
      countryExposurePct: {},
      activeContractKeys: [],
      completedContractKeys: [],
      storyFlags: {},
    },
    dependencies,
    effect: parseStoryEffect({
      type: "character_message",
      characterKey: "character.northreach.edda-veyr.v1",
      characterName: "Edda Veyr",
      conversationKey: "relationship.northreach.edda-veyr.v1",
      title: "Edda Veyr — Housing window",
      body: "Verify the address before you pay anyone.",
      allowPlayerReplies: true,
      payload: { phase: "arrival", relationshipRole: "sponsor" },
    }),
  });

  assertEquals(result.status, "applied");
  assertEquals(result.effectType, "character_message");
  assertEquals(result.playerId, "player-1");
  assertEquals(impacts.length, 1);
  assertEquals(impacts[0]?.effectType, "character_message");
  assertEquals(impacts[0]?.impactLabel, "Message from Edda Veyr");
  assertEquals(impacts[0]?.payload.characterKey, "character.northreach.edda-veyr.v1");
  assertEquals(impacts[0]?.payload.characterName, "Edda Veyr");
  assertEquals(impacts[0]?.payload.conversationKey, "relationship.northreach.edda-veyr.v1");
  assertEquals(impacts[0]?.payload.allowPlayerReplies, true);
});

Deno.test("character_message is skipped without player context", async () => {
  let impactWrites = 0;
  const dependencies: StoryEffectExecutionDependencies = {
    ledger: { async recordCashAdjustment() { return {}; } },
    policies: { async upsertPolicy() { return {}; } },
    flags: { async setStoryFlag() { return {}; } },
    impacts: { async createPlayerImpact() { impactWrites += 1; return {}; } },
  };
  const result = await executeStoryEffect({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    now: "2026-08-11T11:00:00.000Z",
    dependencies,
    effect: parseStoryEffect({
      type: "character_message",
      characterKey: "character.northreach.edda-veyr.v1",
      characterName: "Edda Veyr",
      conversationKey: "relationship.northreach.edda-veyr.v1",
      title: "Housing window",
      body: "Verify the address before you pay anyone.",
    }),
  });
  assertEquals(result.status, "skipped");
  if (result.status !== "skipped") throw new Error("Expected skipped result.");
  assertEquals(result.reason, "missing_player_context");
  assertEquals(impactWrites, 0);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
