export {};

import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import { parseStoryCondition } from "../contracts/storyConditionContracts.ts";
import { StorylineContractError } from "../contracts/storylineContractErrors.ts";
import { evaluateStoryCondition } from "./storyConditionEngine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const CONTEXT: PlayerStoryContext = {
  playerId: "player-1",
  gameSessionId: "game-1",
  homeCountryId: null,
  homeCountryCode: "YRETHIA",
  currentCountryId: null,
  currentCountryCode: "NORTHREACH",
  cashBalance: 500,
  resources: {},
  sectorExposurePct: {},
  countryExposurePct: {},
  activeContractKeys: [],
  completedContractKeys: [
    "contract.meridian.war-civilian-continuity-assessment.v1",
  ],
  storyFlags: {},
  relationships: {},
};

Deno.test("player_completed_contract evaluates from player Story context", () => {
  const completed = parseStoryCondition({
    type: "player_completed_contract",
    contractKey: "contract.meridian.war-civilian-continuity-assessment.v1",
  });
  const missing = parseStoryCondition({
    type: "player_completed_contract",
    contractKey: "contract.meridian.conflict-evidence-and-correction.v1",
  });

  assertEquals(evaluateStoryCondition(completed, CONTEXT), true);
  assertEquals(evaluateStoryCondition(missing, CONTEXT), false);
});

Deno.test("player_completed_contract fails safely with partial runtime context", () => {
  const condition = parseStoryCondition({
    type: "player_completed_contract",
    contractKey: "contract.meridian.war-civilian-continuity-assessment.v1",
  });
  const partial = {
    playerId: "player-2",
    gameSessionId: "game-1",
  } as PlayerStoryContext;

  assertEquals(evaluateStoryCondition(condition, partial), false);
});

Deno.test("player_completed_contract parser rejects blank keys", () => {
  assertThrows(
    () => parseStoryCondition({
      type: "player_completed_contract",
      contractKey: "   ",
    }),
    StorylineContractError,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function assertThrows<TError extends Error>(
  run: () => unknown,
  expectedErrorClass: new (...args: never[]) => TError,
): TError {
  try {
    run();
  } catch (error) {
    if (error instanceof expectedErrorClass) return error;
    throw new Error(`Expected ${expectedErrorClass.name}, got ${String(error)}`);
  }
  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
}
