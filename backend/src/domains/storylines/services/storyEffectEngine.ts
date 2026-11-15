import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type { StoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryEffectBatchExecutionInput,
  StoryEffectBatchExecutionResult,
  StoryEffectExecutionInput,
  StoryEffectExecutionResult,
  StoryFlagWriteInput,
} from "../contracts/storyEffectExecutionContracts.ts";

import {
  executeCurrencyVolatilityEffect,
  executeMarketNewsEffect,
  executeWorldLocationStateEffect,
  executeWorldRouteStateEffect,
} from "./storyGameEffectExecutors.ts";
import {
  buildIdempotencyKey,
  collectWriteIds,
} from "./storyEffectWriteSupport.ts";
import {
  executePolicyEffect,
  resolvePolicyScope,
} from "./storyPolicyEffectExecutor.ts";
import { prepareStoryContractEffect } from "./prepareStoryEffects.ts";

export async function executeStoryEffect(
  input: StoryEffectExecutionInput,
): Promise<StoryEffectExecutionResult> {
  const effectIndex = input.effectIndex ?? 0;
  const playerId = input.playerContext?.playerId ?? null;

  try {
    if (
      input.effect.type === "cash_credit" || input.effect.type === "cash_debit"
    ) {
      if (!input.playerContext) {
        return skipped(
          input.effect,
          effectIndex,
          null,
          "missing_player_context",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        input.playerContext.playerId,
        await executeCashEffect(input, input.effect, input.playerContext),
      );
    }

    if (
      input.effect.type === "tax_modifier" ||
      input.effect.type === "immigration_lock"
    ) {
      const policyScope = resolvePolicyScope(
        input.policyScope,
        input.playerContext,
      );

      if (!policyScope) {
        return skipped(
          input.effect,
          effectIndex,
          playerId,
          "missing_player_context",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        playerId,
        await executePolicyEffect(input, input.effect, policyScope),
      );
    }

    if (input.effect.type === "contract_unlock") {
      if (!input.dependencies.contracts) {
        return skipped(
          input.effect,
          effectIndex,
          playerId,
          "unsupported_effect_type",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        playerId,
        await executeContractUnlockEffect(input, input.effect),
      );
    }

    if (input.effect.type === "character_message") {
      if (!input.playerContext) {
        return skipped(
          input.effect,
          effectIndex,
          null,
          "missing_player_context",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        input.playerContext.playerId,
        await executeCharacterMessageEffect(
          input,
          input.effect,
          input.playerContext,
        ),
      );
    }

    if (input.effect.type === "market_news_post") {
      if (!input.dependencies.marketNews) {
        return skipped(
          input.effect,
          effectIndex,
          null,
          "unsupported_effect_type",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        null,
        await executeMarketNewsEffect(input, input.effect),
      );
    }

    if (input.effect.type === "world_route_state_change") {
      if (!input.dependencies.world) {
        return skipped(
          input.effect,
          effectIndex,
          null,
          "unsupported_effect_type",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        null,
        await executeWorldRouteStateEffect(input, input.effect),
      );
    }

    if (input.effect.type === "world_location_state_change") {
      if (!input.dependencies.world) {
        return skipped(
          input.effect,
          effectIndex,
          null,
          "unsupported_effect_type",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        null,
        await executeWorldLocationStateEffect(input, input.effect),
      );
    }

    if (input.effect.type === "currency_volatility") {
      if (!input.dependencies.currency) {
        return skipped(
          input.effect,
          effectIndex,
          null,
          "unsupported_effect_type",
        );
      }

      return applied(
        input.effect,
        effectIndex,
        null,
        await executeCurrencyVolatilityEffect(input, input.effect),
      );
    }

    if (input.effect.type === "story_flag_set") {
      return applied(
        input.effect,
        effectIndex,
        playerId,
        await executeFlagEffect(input, input.effect),
      );
    }

    return skipped(
      input.effect,
      effectIndex,
      playerId,
      "unsupported_effect_type",
    );
  } catch (error) {
    return {
      status: "failed",
      effectType: input.effect.type,
      effectIndex,
      playerId: isGameEffect(input.effect) ? null : playerId,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeStoryEffects(
  input: StoryEffectBatchExecutionInput,
): Promise<StoryEffectBatchExecutionResult> {
  const results: StoryEffectExecutionResult[] = [];

  for (let index = 0; index < input.effects.length; index += 1) {
    results.push(
      await executeStoryEffect({
        gameSessionId: input.gameSessionId,
        storylineEventId: input.storylineEventId,
        effect: input.effects[index],
        effectIndex: index,
        now: input.now,
        playerContext: input.playerContext,
        policyScope: input.policyScope,
        dependencies: input.dependencies,
      }),
    );
  }

  return {
    results,
    appliedCount:
      results.filter((result) => result.status === "applied").length,
    skippedCount:
      results.filter((result) => result.status === "skipped").length,
    failedCount: results.filter((result) => result.status === "failed").length,
  };
}

async function executeCashEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "cash_credit" | "cash_debit" }>,
  playerContext: PlayerStoryContext,
): Promise<readonly string[]> {
  const signedAmount = effect.type === "cash_credit"
    ? effect.amount
    : -effect.amount;
  const baseKey = buildIdempotencyKey(input, playerContext.playerId);
  const ledgerInput: StoryCashAdjustmentWriteInput = {
    gameSessionId: input.gameSessionId,
    playerId: playerContext.playerId,
    storylineEventId: input.storylineEventId,
    effectType: effect.type,
    amount: effect.amount,
    signedAmount,
    label: effect.label,
    reason: effect.reason,
    payload: effect.payload,
    idempotencyKey: `${baseKey}:ledger`,
  };

  const ledgerResult = await input.dependencies.ledger.recordCashAdjustment(
    ledgerInput,
  );
  const impactResult = await input.dependencies.impacts.createPlayerImpact({
    gameSessionId: input.gameSessionId,
    playerId: playerContext.playerId,
    storylineEventId: input.storylineEventId,
    effectType: effect.type,
    impactLabel: effect.label,
    impactReason: effect.reason,
    amount: signedAmount,
    payload: effect.payload,
    idempotencyKey: `${baseKey}:impact`,
  });

  return collectWriteIds(ledgerResult, impactResult);
}

async function executeCharacterMessageEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "character_message" }>,
  playerContext: PlayerStoryContext,
): Promise<readonly string[]> {
  const baseKey = buildIdempotencyKey(input, playerContext.playerId);
  const impactResult = await input.dependencies.impacts.createPlayerImpact({
    gameSessionId: input.gameSessionId,
    playerId: playerContext.playerId,
    storylineEventId: input.storylineEventId,
    effectType: "character_message",
    impactLabel: `Message from ${effect.characterName}`,
    impactReason: effect.body,
    amount: null,
    payload: {
      ...effect.payload,
      characterKey: effect.characterKey,
      characterName: effect.characterName,
      conversationKey: effect.conversationKey,
      title: effect.title,
      body: effect.body,
      allowPlayerReplies: effect.allowPlayerReplies,
      deliveryKey: `${baseKey}:message`,
    },
    idempotencyKey: `${baseKey}:impact`,
  });

  return collectWriteIds(impactResult);
}

async function executeContractUnlockEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "contract_unlock" }>,
): Promise<readonly string[]> {
  if (!input.dependencies.contracts) {
    return [];
  }

  const contractInput = prepareStoryContractEffect(input, effect);
  const contractResult = await input.dependencies.contracts
    .createGameSessionContract(contractInput);

  return collectWriteIds(contractResult);
}

async function executeFlagEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "story_flag_set" }>,
): Promise<readonly string[]> {
  const flagInput: StoryFlagWriteInput = {
    gameSessionId: input.gameSessionId,
    flagKey: effect.flagKey,
    value: effect.value,
    sourceStoryEventId: input.storylineEventId,
    idempotencyKey: `${buildIdempotencyKey(input, effect.flagKey)}:flag`,
  };
  const flagResult = await input.dependencies.flags.setStoryFlag(flagInput);

  return collectWriteIds(flagResult);
}

function isGameEffect(effect: StoryEffect): boolean {
  return effect.type === "market_news_post" ||
    effect.type === "world_route_state_change" ||
    effect.type === "world_location_state_change" ||
    effect.type === "currency_volatility";
}

function applied(
  effect: StoryEffect,
  effectIndex: number,
  playerId: string | null,
  appliedWriteIds: readonly string[],
): StoryEffectExecutionResult {
  return {
    status: "applied",
    effectType: effect.type,
    effectIndex,
    playerId,
    appliedWriteIds,
  };
}

function skipped(
  effect: StoryEffect,
  effectIndex: number,
  playerId: string | null,
  reason: "missing_player_context" | "unsupported_effect_type",
): StoryEffectExecutionResult {
  return {
    status: "skipped",
    effectType: effect.type,
    effectIndex,
    playerId,
    reason,
  };
}
