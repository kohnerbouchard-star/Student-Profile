import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type { StoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryEffectExecutionInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyEffectScope,
  StoryPolicyWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import {
  buildIdempotencyKey,
  collectWriteIds,
} from "./storyEffectWriteSupport.ts";

export async function executePolicyEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "tax_modifier" | "immigration_lock" }>,
  policyScope: StoryPolicyEffectScope,
): Promise<readonly string[]> {
  const baseKey = buildIdempotencyKey(input, policyScope.scopeKey);
  const policyInput: StoryPolicyWriteInput = {
    gameSessionId: input.gameSessionId,
    policyKey: effect.policyKey,
    policyType: effect.type,
    scopeType: policyScope.scopeType,
    scopeKey: policyScope.scopeKey,
    startsAt: input.now,
    expiresAt: readExpiresAt(input.now, effect.durationSeconds),
    durationSeconds: effect.durationSeconds,
    payload: buildPolicyPayload(effect),
    sourceStoryEventId: input.storylineEventId,
    idempotencyKey: `${baseKey}:policy`,
  };
  const policyResult = await input.dependencies.policies.upsertPolicy(
    policyInput,
  );
  const impactResult = await maybeWritePlayerPolicyImpact(
    input,
    effect,
    policyScope,
    `${baseKey}:impact`,
  );

  return collectWriteIds(policyResult, impactResult);
}

async function maybeWritePlayerPolicyImpact(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "tax_modifier" | "immigration_lock" }>,
  policyScope: StoryPolicyEffectScope,
  idempotencyKey: string,
): Promise<StoryWriteResult | null> {
  if (
    policyScope.scopeType !== "player" ||
    !input.playerContext ||
    !effect.label ||
    !effect.reason
  ) {
    return null;
  }

  const impactInput: StoryPlayerImpactWriteInput = {
    gameSessionId: input.gameSessionId,
    playerId: input.playerContext.playerId,
    storylineEventId: input.storylineEventId,
    effectType: effect.type,
    impactLabel: effect.label,
    impactReason: effect.reason,
    amount: null,
    payload: buildPolicyPayload(effect),
    idempotencyKey,
  };

  return await input.dependencies.impacts.createPlayerImpact(impactInput);
}

export function resolvePolicyScope(
  explicitScope: StoryPolicyEffectScope | null | undefined,
  playerContext: PlayerStoryContext | null | undefined,
): StoryPolicyEffectScope | null {
  if (explicitScope) {
    return explicitScope;
  }

  if (!playerContext) {
    return null;
  }

  return {
    scopeType: "player",
    scopeKey: playerContext.playerId,
  };
}

function buildPolicyPayload(
  effect: Extract<StoryEffect, { type: "tax_modifier" | "immigration_lock" }>,
): JsonObject {
  return {
    ...effect.payload,
    label: effect.label,
    reason: effect.reason,
  };
}

function readExpiresAt(
  now: string,
  durationSeconds: number | null,
): string | null {
  if (durationSeconds === null) {
    return null;
  }

  const timestamp = Date.parse(now);

  if (Number.isNaN(timestamp)) {
    throw new Error("now must be an ISO date string.");
  }

  return new Date(timestamp + durationSeconds * 1000).toISOString();
}
