import type {
  StoryEffectExecutionInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

export function collectWriteIds(
  ...results: readonly (StoryWriteResult | null)[]
): readonly string[] {
  return results.flatMap((result) => result?.id ? [result.id] : []);
}

export function buildIdempotencyKey(
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
