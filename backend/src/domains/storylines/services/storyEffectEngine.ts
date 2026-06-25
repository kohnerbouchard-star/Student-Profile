import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type { StoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryContractCreateWriteInput,
  StoryEffectBatchExecutionInput,
  StoryEffectBatchExecutionResult,
  StoryEffectExecutionInput,
  StoryEffectExecutionResult,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyEffectScope,
  StoryPolicyWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

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
      playerId,
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

async function executePolicyEffect(
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

async function executeContractUnlockEffect(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "contract_unlock" }>,
): Promise<readonly string[]> {
  if (!input.dependencies.contracts) {
    return [];
  }

  const contractInput = buildContractCreateInput(input, effect);
  const contractResult = await input.dependencies.contracts
    .createGameSessionContract(contractInput);

  return collectWriteIds(contractResult);
}

function buildContractCreateInput(
  input: StoryEffectExecutionInput,
  effect: Extract<StoryEffect, { type: "contract_unlock" }>,
): StoryContractCreateWriteInput {
  const payload = effect.payload;
  const title = readOptionalTextPayload(payload, "title") ?? effect.label ??
    effect.contractKey;
  const description = readOptionalTextPayload(payload, "description") ??
    effect.reason ?? "";
  const instructions = readOptionalTextPayload(payload, "instructions") ??
    effect.reason ?? effect.label ?? effect.contractKey;

  return {
    gameSessionId: input.gameSessionId,
    contractKey: effect.contractKey,
    sourceType: "story_event",
    sourceId: input.storylineEventId,
    createdByStaffId: null,
    title,
    description,
    instructions,
    category: readOptionalTextPayload(payload, "category") ?? "story",
    status: "active",
    visibility: "public",
    targetingPayload: readOptionalObjectPayload(payload, "targetingPayload"),
    requirementsPayload: readOptionalObjectPayload(
      payload,
      "requirementsPayload",
    ),
    rewardPayload: readOptionalObjectPayload(payload, "rewardPayload"),
    completionMode: "manual_review",
    publishedAt: input.now,
    deadlineAt: readOptionalTextPayload(payload, "deadlineAt"),
    expiresAt: readOptionalTextPayload(payload, "expiresAt"),
    metadata: {
      ...readOptionalObjectPayload(payload, "metadata"),
      storyEffect: {
        type: effect.type,
        label: effect.label,
        reason: effect.reason,
      },
    },
  };
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

function resolvePolicyScope(
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

function readOptionalTextPayload(
  payload: JsonObject,
  key: string,
): string | null {
  const value = payload[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `contract_unlock payload ${key} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function readOptionalObjectPayload(
  payload: JsonObject,
  key: string,
): JsonObject {
  const value = payload[key];

  if (value === undefined || value === null) {
    return {};
  }

  if (!isJsonObject(value)) {
    throw new Error(`contract_unlock payload ${key} must be a JSON object.`);
  }

  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
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

function buildIdempotencyKey(
  input: StoryEffectExecutionInput,
  scopeKey: string | null | undefined,
): string {
  return [
    "story_effect",
    input.gameSessionId,
    input.storylineEventId,
    input.effectIndex ?? 0,
    input.effect.type,
    scopeKey ?? "game",
  ].join(":");
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

function collectWriteIds(
  ...results: readonly (StoryWriteResult | null)[]
): readonly string[] {
  return results.flatMap((result) => result?.id ? [result.id] : []);
}
