import { readAdminPlayerHistory } from "../../../src/domains/players/application/readAdminPlayerHistory.ts";
import {
  type AdminPlayerHistoryClient,
  SupabaseAdminPlayerHistoryReadRepository,
} from "../../../src/domains/players/infrastructure/supabaseAdminPlayerHistoryReadRepository.ts";

// Existing Admin callers keep their authorization, route and response ownership.
export function loadPlayerHistoryAudit(
  service: AdminPlayerHistoryClient,
  gameSessionId: string,
  playerId: string,
) {
  return readAdminPlayerHistory(
    new SupabaseAdminPlayerHistoryReadRepository(service),
    { gameSessionId, playerId },
  );
}
