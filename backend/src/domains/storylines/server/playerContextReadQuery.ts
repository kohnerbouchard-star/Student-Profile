import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerStoryContextRepository } from "../contracts/playerStoryContextRepositoryContracts.ts";
import { SupabasePlayerStoryContextRepository } from "../infrastructure/supabasePlayerStoryContextRepository.ts";

/** Server-only Story context reads; private contexts are not browser DTOs. */
export function createPlayerStoryContextReadQuery(
  client: Pick<EdgeSupabaseClient, "from">,
): PlayerStoryContextRepository {
  const repository = new SupabasePlayerStoryContextRepository(client);
  return {
    listPlayerStoryContexts: (gameSessionId) =>
      repository.listPlayerStoryContexts(gameSessionId),
  };
}
