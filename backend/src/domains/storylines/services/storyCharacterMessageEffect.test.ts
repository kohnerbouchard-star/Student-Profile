import { executeStoryEffect } from "./storyEffectEngine.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const EVENT = "00000000-0000-4000-8000-000000000003";
const NOW = "2026-08-10T06:30:00.000Z";

Deno.test("character_message executes through the story message writer with effect ordering", async () => {
  const calls: unknown[] = [];
  const result = await executeStoryEffect({
    gameSessionId: GAME,
    storylineEventId: EVENT,
    effectIndex: 7,
    now: NOW,
    playerContext: playerContext(),
    effect: effect(),
    dependencies: dependencies({
      messages: {
        deliverCharacterMessage(input: unknown) {
          calls.push(input);
          return Promise.resolve({ id: `msg_${"a".repeat(32)}` });
        },
      },
    }),
  });

  assertEquals(result.status, "applied");
  assertEquals(result.effectIndex, 7);
  assertEquals(result.playerId, PLAYER);
  assertEquals(calls, [{
    gameSessionId: GAME,
    playerId: PLAYER,
    storylineEventId: EVENT,
    effectIndex: 7,
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
  }]);
});

Deno.test("character_message fails if runtime message delivery is not wired", async () => {
  const result = await executeStoryEffect({
    gameSessionId: GAME,
    storylineEventId: EVENT,
    effectIndex: 1,
    now: NOW,
    playerContext: playerContext(),
    effect: effect(),
    dependencies: dependencies({}),
  });
  assertEquals(result.status, "failed");
  if (result.status !== "failed" || !result.errorMessage.includes("story_message_writer_unavailable")) {
    throw new Error("Missing message writer did not fail closed.");
  }
});

Deno.test("character_message skips when no player context is available", async () => {
  const result = await executeStoryEffect({
    gameSessionId: GAME,
    storylineEventId: EVENT,
    effectIndex: 1,
    now: NOW,
    playerContext: null,
    effect: effect(),
    dependencies: dependencies({}),
  });
  assertEquals(result.status, "skipped");
  if (result.status !== "skipped") throw new Error("Expected skipped result.");
  assertEquals(result.reason, "missing_player_context");
});

function effect() {
  return {
    type: "character_message" as const,
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning" as const,
    body: "They are asking us to skip a second inspection cycle.",
  };
}

function playerContext() {
  return {
    playerId: PLAYER,
    gameSessionId: GAME,
    homeCountryId: null,
    homeCountryCode: null,
    currentCountryId: null,
    currentCountryCode: "NORTHREACH",
    cashBalance: 500,
    resources: {},
    sectorExposurePct: {},
    countryExposurePct: {},
    activeContractKeys: [],
    completedContractKeys: [],
    storyFlags: {},
  };
}

function dependencies(overrides: Record<string, unknown>) {
  return {
    ledger: { recordCashAdjustment: never },
    policies: { upsertPolicy: never },
    flags: { setStoryFlag: never },
    impacts: { createPlayerImpact: never },
    ...overrides,
  } as never;
}

function never(): Promise<never> {
  return Promise.reject(new Error("unexpected dependency call"));
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
