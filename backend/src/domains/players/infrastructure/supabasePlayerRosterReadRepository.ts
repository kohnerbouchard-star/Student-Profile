import type {
  PlayerRosterReadRecord,
  PlayerRosterReadRepository,
} from "../contracts/playerRosterReadRepository.ts";
import { PlayerRosterReadPersistenceError } from "../contracts/playerRosterReadRepository.ts";

interface QueryResponse {
  readonly data: unknown[] | null;
  readonly error: unknown | null;
}

interface FilterBuilder extends PromiseLike<QueryResponse> {
  eq(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  order(column: string, options?: { readonly ascending?: boolean }): FilterBuilder;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
}

export interface PlayerRosterReadClient {
  from(tableName: string): QueryBuilder;
}

const PLAYER_SELECT =
  "id,display_name,roster_label,player_identifier,status,created_at,updated_at";

export class SupabasePlayerRosterReadRepository
  implements PlayerRosterReadRepository {
  constructor(private readonly client: PlayerRosterReadClient) {}

  async readRoster(
    gameSessionId: string,
  ): Promise<readonly PlayerRosterReadRecord[]> {
    const playersResponse = await this.client
      .from("players")
      .select(PLAYER_SELECT)
      .eq("game_session_id", gameSessionId)
      .order("created_at", { ascending: true });

    if (playersResponse.error) {
      throw new PlayerRosterReadPersistenceError();
    }

    const players = (playersResponse.data ?? []).map(requireRow);
    const playerIds = players.map((player) => requireString(player.id));
    const activeCredentialPlayerIds = new Set<string>();

    if (playerIds.length > 0) {
      const credentialResponse = await this.client
        .from("player_access_credentials")
        .select("player_id")
        .eq("game_session_id", gameSessionId)
        .eq("status", "active")
        .in("player_id", playerIds);

      if (credentialResponse.error) {
        throw new PlayerRosterReadPersistenceError();
      }

      for (const value of credentialResponse.data ?? []) {
        const credential = requireRow(value);
        if (typeof credential.player_id === "string") {
          activeCredentialPlayerIds.add(credential.player_id);
        }
      }
    }

    return players.map((player) => {
      const id = requireString(player.id);
      return {
        id,
        displayName: requireString(player.display_name),
        rosterLabel: optionalString(player.roster_label),
        playerIdentifier: optionalString(player.player_identifier),
        status: requireString(player.status),
        hasActiveAccessCode: activeCredentialPlayerIds.has(id),
        createdAt: requireString(player.created_at),
        updatedAt: requireString(player.updated_at),
      };
    });
  }
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    throw new PlayerRosterReadPersistenceError();
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requireRow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlayerRosterReadPersistenceError();
  }
  return value as Record<string, unknown>;
}
