import type {
  ClaimStoryEventExecutionInput,
  FinalizeStoryEventExecutionInput,
} from "../contracts/storyEventExecutionContracts.ts";
import { InMemoryStoryEventExecutionRepository } from "./testing/inMemoryStoryEventExecutionRepository.ts";

export class StorylineExecutionFixture extends InMemoryStoryEventExecutionRepository {
  readonly finalized: FinalizeStoryEventExecutionInput[] = [];

  async seedResolved(input: ClaimStoryEventExecutionInput) {
    const claim = await this.claim(input);
    if (claim.outcome !== "acquired" || !claim.leaseToken) {
      throw new Error("Fixture expected to acquire the seeded Story execution.");
    }
    await super.finalize({
      gameSessionId: input.gameSessionId,
      storylineEventId: input.storylineEventId,
      leaseToken: claim.leaseToken,
      resultPayload: {},
    });
  }

  override async finalize(input: FinalizeStoryEventExecutionInput) {
    const result = await super.finalize(input);
    if (result.outcome === "finalized") this.finalized.push(input);
    return result;
  }
}
