// Server-side capability for rendering an already-recorded Story decision.
import {
  renderStoryDecisionRoleplay as renderFromRepository,
  type StoryDecisionRoleplayInput,
  type StoryDecisionRoleplayResult,
} from "./services/storyDecisionRoleplayService.ts";
import {
  type StoryDecisionRoleplayClient,
  SupabaseStoryDecisionRoleplayReadRepository,
} from "./infrastructure/supabaseStoryDecisionRoleplayReadRepository.ts";

// Keep the public client/input contract; persistence composition stays in Story.
export function renderStoryDecisionRoleplay(
  client: StoryDecisionRoleplayClient,
  input: StoryDecisionRoleplayInput,
): Promise<StoryDecisionRoleplayResult | null> {
  return renderFromRepository(new SupabaseStoryDecisionRoleplayReadRepository(client), input);
}
export type { StoryDecisionRoleplayClient, StoryDecisionRoleplayInput, StoryDecisionRoleplayResult };
