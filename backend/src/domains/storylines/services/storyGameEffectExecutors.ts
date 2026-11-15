import type { StoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryCurrencyVolatilityWriteInput,
  StoryEffectExecutionInput,
  StoryMarketNewsWriteInput,
  StoryWorldLocationStateWriteInput,
  StoryWorldRouteStateWriteInput,
} from "../contracts/storyEffectExecutionContracts.ts";
import {
  readCurrencyAdjustments,
  readEnumTextPayload,
  readIntegerPayload,
  readRequiredTextPayload,
  readStringArrayPayload,
} from "./storyGameEffectPayload.ts";
import { collectWriteIds } from "./storyEffectWriteSupport.ts";

export async function executeMarketNewsEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "market_news_post" }>,
): Promise<readonly string[]> {
  if (!input.dependencies.marketNews) {
    return [];
  }

  const shockKey = readRequiredTextPayload(
    effect.payload,
    "shockKey",
    "market_news_post",
  );
  const marketNewsInput: StoryMarketNewsWriteInput = {
    gameSessionId: input.gameSessionId,
    storylineEventId: input.storylineEventId,
    shockKey,
    payload: effect.payload,
    idempotencyKey: [
      "story_market_news",
      input.gameSessionId,
      input.storylineEventId,
      shockKey,
    ].join(":"),
  };
  const result = await input.dependencies.marketNews.createMarketNews(
    marketNewsInput,
  );

  return collectWriteIds(result);
}

export async function executeWorldRouteStateEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "world_route_state_change" }>,
): Promise<readonly string[]> {
  if (!input.dependencies.world) return [];

  const worldInput: StoryWorldRouteStateWriteInput = {
    gameSessionId: input.gameSessionId,
    storylineEventId: input.storylineEventId,
    routeIds: readStringArrayPayload(
      effect.payload,
      "routeIds",
      "world_route_state_change",
      /^rte_[a-z0-9_]+$/,
      100,
    ),
    status: readEnumTextPayload(
      effect.payload,
      "status",
      "world_route_state_change",
      ["open", "restricted", "closed"] as const,
    ),
    reason: readEnumTextPayload(
      effect.payload,
      "reason",
      "world_route_state_change",
      ["normal", "shortage", "meridian_disruption", "war", "recovery"] as const,
    ),
    costMultiplierBasisPoints: readIntegerPayload(
      effect.payload,
      "costMultiplierBasisPoints",
      "world_route_state_change",
      1000,
      50000,
    ),
    durationMultiplierBasisPoints: readIntegerPayload(
      effect.payload,
      "durationMultiplierBasisPoints",
      "world_route_state_change",
      1000,
      50000,
    ),
    appliedAt: input.now,
    idempotencyKey: `story_route:${input.storylineEventId}:${
      input.effectIndex ?? 0
    }`,
  };

  return collectWriteIds(
    await input.dependencies.world.applyRouteState(worldInput),
  );
}

export async function executeWorldLocationStateEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "world_location_state_change" }>,
): Promise<readonly string[]> {
  if (!input.dependencies.world) return [];

  const worldInput: StoryWorldLocationStateWriteInput = {
    gameSessionId: input.gameSessionId,
    storylineEventId: input.storylineEventId,
    locationIds: readStringArrayPayload(
      effect.payload,
      "locationIds",
      "world_location_state_change",
      /^loc_[a-z0-9_]+$/,
      100,
    ),
    availability: readEnumTextPayload(
      effect.payload,
      "availability",
      "world_location_state_change",
      ["normal", "shortage", "conflict", "closed"] as const,
    ),
    appliedAt: input.now,
    idempotencyKey: `story_location:${input.storylineEventId}:${
      input.effectIndex ?? 0
    }`,
  };

  return collectWriteIds(
    await input.dependencies.world.applyLocationState(worldInput),
  );
}

export async function executeCurrencyVolatilityEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "currency_volatility" }>,
): Promise<readonly string[]> {
  if (!input.dependencies.currency) return [];

  const currencyInput: StoryCurrencyVolatilityWriteInput = {
    gameSessionId: input.gameSessionId,
    storylineEventId: input.storylineEventId,
    adjustmentsBasisPoints: readCurrencyAdjustments(effect.payload),
    appliedAt: input.now,
    idempotencyKey: `story_fx:${input.storylineEventId}:${
      input.effectIndex ?? 0
    }`,
  };

  return collectWriteIds(
    await input.dependencies.currency.applyCurrencyVolatility(currencyInput),
  );
}
