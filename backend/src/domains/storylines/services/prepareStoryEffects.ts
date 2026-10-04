import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { StoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryContractCreateWriteInput,
  StoryEffectExecutionInput,
} from "../contracts/storyEffectExecutionContracts.ts";

export function prepareStoryContractEffect(
  input: Readonly<
    Pick<
      StoryEffectExecutionInput,
      "gameSessionId" | "storylineEventId" | "now"
    >
  >,
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
