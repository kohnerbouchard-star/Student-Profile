import type {
  RunDueStorylineEventsInput,
  StorylineRunnerEventResult,
  StorylineRunnerResult,
} from "../contracts/storylineRunnerContracts.ts";
import { resolveCandidate, buildRunnerResult } from "./storylineEventResolution.ts";

export async function runDueStorylineEvents(
  input: RunDueStorylineEventsInput,
): Promise<StorylineRunnerResult> {
  const candidates = await input.repository.listUnresolvedActiveStorylineEvents({
    gameSessionId: input.gameSessionId,
    now: input.now,
    currentMarketTick: input.currentMarketTick,
  });
  const storyFlags = await input.repository.listGameSessionStoryFlags(
    input.gameSessionId,
  );
  const eventResults: StorylineRunnerEventResult[] = [];

  for (const candidate of candidates) {
    eventResults.push(await resolveCandidate(candidate, input, storyFlags));
  }

  return buildRunnerResult(
    input.gameSessionId,
    candidates.length,
    eventResults,
  );
}
