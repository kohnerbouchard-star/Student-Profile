import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import { parseStoryCondition } from "../contracts/storyConditionContracts.ts";
import { StorylineContractError } from "../contracts/storylineContractErrors.ts";
import { evaluateStoryCondition } from "./storyConditionEngine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story condition engine evaluates player_current_country_is", () => {
  assertCondition({
    type: "player_current_country_is",
    countryCode: "NORTHREACH",
  }, true);
  assertCondition(
    { type: "player_current_country_is", countryCode: "YRETHIA" },
    false,
  );
});

Deno.test("story condition engine evaluates player_home_country_is", () => {
  assertCondition(
    { type: "player_home_country_is", countryCode: "YRETHIA" },
    true,
  );
  assertCondition(
    { type: "player_home_country_is", countryCode: "NORTHREACH" },
    false,
  );
});

Deno.test("story condition engine evaluates player_current_country_in", () => {
  assertCondition({
    type: "player_current_country_in",
    countryCodes: ["VALERION", "NORTHREACH"],
  }, true);
  assertCondition({
    type: "player_current_country_in",
    countryCodes: ["VALERION", "YRETHIA"],
  }, false);
});

Deno.test("story condition engine evaluates player_home_country_in", () => {
  assertCondition({
    type: "player_home_country_in",
    countryCodes: ["YRETHIA", "VALERION"],
  }, true);
  assertCondition({
    type: "player_home_country_in",
    countryCodes: ["NORTHREACH", "VALERION"],
  }, false);
});

Deno.test("story condition engine evaluates player_has_resource", () => {
  assertCondition({ type: "player_has_resource", resourceKey: "steel" }, true);
  assertCondition({ type: "player_has_resource", resourceKey: "grain" }, false);
  assertCondition(
    { type: "player_has_resource", resourceKey: "uranium" },
    false,
  );
});

Deno.test("story condition engine evaluates player_resource_quantity_at_least", () => {
  assertCondition({
    type: "player_resource_quantity_at_least",
    resourceKey: "steel",
    quantity: 3,
  }, true);
  assertCondition({
    type: "player_resource_quantity_at_least",
    resourceKey: "steel",
    quantity: 4,
  }, false);
});

Deno.test("story condition engine evaluates player_portfolio_sector_exposure_at_least", () => {
  assertCondition({
    type: "player_portfolio_sector_exposure_at_least",
    sector: "FINANCE",
    percent: 35,
  }, true);
  assertCondition({
    type: "player_portfolio_sector_exposure_at_least",
    sector: "ENERGY",
    percent: 30,
  }, false);
});

Deno.test("story condition engine evaluates player_portfolio_country_exposure_at_least", () => {
  assertCondition({
    type: "player_portfolio_country_exposure_at_least",
    countryCode: "VALERION",
    percent: 41,
  }, true);
  assertCondition({
    type: "player_portfolio_country_exposure_at_least",
    countryCode: "NORTHREACH",
    percent: 1,
  }, false);
});

Deno.test("story condition engine evaluates player_cash_below", () => {
  assertCondition({ type: "player_cash_below", amount: 501 }, true);
  assertCondition({ type: "player_cash_below", amount: 500 }, false);
});

Deno.test("story condition engine evaluates player_cash_above", () => {
  assertCondition({ type: "player_cash_above", amount: 499 }, true);
  assertCondition({ type: "player_cash_above", amount: 500 }, false);
});

Deno.test("story condition engine evaluates story_flag_equals", () => {
  assertCondition({
    type: "story_flag_equals",
    flagKey: "northreach_border_closed",
    value: true,
  }, true);
  assertCondition({
    type: "story_flag_equals",
    flagKey: "crisis_payload",
    value: { phase: "warning", level: 2 },
  }, true);
  assertCondition({
    type: "story_flag_equals",
    flagKey: "missing_flag",
    value: true,
  }, false);
});

Deno.test("story condition engine evaluates all/any/not nesting", () => {
  assertCondition({
    all: [
      { type: "player_current_country_is", countryCode: "NORTHREACH" },
      {
        any: [
          { type: "player_cash_below", amount: 100 },
          { type: "player_cash_above", amount: 400 },
        ],
      },
      {
        not: {
          type: "player_home_country_is",
          countryCode: "VALERION",
        },
      },
    ],
  }, true);

  assertCondition({
    all: [
      { type: "player_current_country_is", countryCode: "NORTHREACH" },
      {
        any: [
          { type: "player_cash_below", amount: 100 },
          { type: "player_home_country_is", countryCode: "VALERION" },
        ],
      },
    ],
  }, false);
});

Deno.test("story condition engine fails safely for null and missing player fields", () => {
  const sparseContext: PlayerStoryContext = {
    ...basePlayerStoryContext,
    homeCountryCode: null,
    currentCountryCode: null,
    cashBalance: null,
    resources: {},
    sectorExposurePct: {},
    countryExposurePct: {},
    storyFlags: {},
  };

  const partialRuntimeContext = {
    playerId: "player-2",
    gameSessionId: "game-1",
  } as PlayerStoryContext;

  assertEquals(
    evaluate({
      type: "player_current_country_is",
      countryCode: "NORTHREACH",
    }, sparseContext),
    false,
  );
  assertEquals(
    evaluate({
      type: "player_cash_above",
      amount: 1,
    }, sparseContext),
    false,
  );
  assertEquals(
    evaluate({
      type: "player_has_resource",
      resourceKey: "steel",
    }, partialRuntimeContext),
    false,
  );
  assertEquals(
    evaluate({
      type: "story_flag_equals",
      flagKey: "northreach_border_closed",
      value: true,
    }, partialRuntimeContext),
    false,
  );
});

Deno.test("story condition parser still rejects invalid condition shapes", () => {
  assertThrows(
    () => parseStoryCondition({ type: "player_is_lucky" }),
    StorylineContractError,
  );
  assertThrows(
    () =>
      parseStoryCondition({
        type: "player_current_country_in",
        countryCodes: [],
      }),
    StorylineContractError,
  );
});

const basePlayerStoryContext: PlayerStoryContext = {
  playerId: "player-1",
  gameSessionId: "game-1",
  homeCountryId: "country-home",
  homeCountryCode: "YRETHIA",
  currentCountryId: "country-current",
  currentCountryCode: "NORTHREACH",
  cashBalance: 500,
  resources: {
    steel: 3,
    grain: 0,
  },
  sectorExposurePct: {
    FINANCE: 35,
    ENERGY: 12.5,
  },
  countryExposurePct: {
    VALERION: 41,
  },
  activeContractKeys: ["northreach-logistics"],
  completedContractKeys: ["intro-contract"],
  storyFlags: {
    northreach_border_closed: true,
    crisis_phase: "warning",
    crisis_payload: {
      level: 2,
      phase: "warning",
    },
  },
};

function assertCondition(condition: unknown, expected: boolean): void {
  assertEquals(evaluate(condition, basePlayerStoryContext), expected);
}

function evaluate(
  condition: unknown,
  context: PlayerStoryContext,
): boolean {
  return evaluateStoryCondition(parseStoryCondition(condition), context);
}

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
    if (error instanceof expectedErrorClass) {
      return error;
    }

    throw new Error(
      `Expected ${expectedErrorClass.name}, got ${String(error)}`,
    );
  }

  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
}
