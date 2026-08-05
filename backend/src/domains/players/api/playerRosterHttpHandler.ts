import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  AdminMutationError,
  readAdminMutationIdentity,
} from "../../../platform/supabase/adminMutation.ts";
import {
  createPlayerForAuthorizedStaff,
} from "../application/createPlayerForAuthorizedStaff.ts";
import {
  parseCreatePlayerRequestBody,
  readPlayerRosterJsonBody,
} from "./playerRosterRequest.ts";

export type { CreatePlayerRequestBody } from "../application/createPlayerForAuthorizedStaff.ts";
export {
  parseCreatePlayerRequestBody,
  readCreatePlayerRequestBody,
} from "./playerRosterRequest.ts";

interface PlayerRosterDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: {
      readonly missingMessage: string;
    },
  ) => Promise<StaffRequestResolution>;
}

type StaffRequestResolution =
  | {
    readonly ok: true;
    readonly staff: {
      readonly id: string;
      readonly email: string | null;
    };
    readonly serviceClient: EdgeSupabaseClient;
  }
  | {
    readonly ok: false;
    readonly status: number;
    readonly error: EdgeErrorBody["error"];
  };

interface PlayerRosterBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly players: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string | null;
    readonly status: string;
    readonly hasActiveAccessCode: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

interface PlayerRosterRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly player_identifier: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ActivePlayerCredentialRow {
  readonly player_id?: unknown;
}

interface CreatePlayerSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly accessCode: {
    readonly studentCode: string;
    readonly status: "active";
    readonly createdAt: string;
  };
}

export async function handlePlayerRosterRequest(
  request: Request,
  gameSessionId: string,
  dependencies: PlayerRosterDependencies,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or POST for player roster.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await dependencies.resolveStaffForRequest(
      request,
      envResult.value,
      {
        missingMessage:
          "A verified Supabase Auth user is required to manage players.",
      },
    );

    if (staffResult.ok === false) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );

    if (ownershipResult.ok === false) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    if (request.method === "POST") {
      const rawBody = await readPlayerRosterJsonBody(request);
      const body = parseCreatePlayerRequestBody(rawBody);
      const identity = readAdminMutationIdentity(request, rawBody);
      const creation = await createPlayerForAuthorizedStaff({
        gameSessionId,
        staffUserId: staffResult.staff.id,
        body,
        identity,
      }, staffResult.serviceClient);

      return jsonResponse<CreatePlayerSuccessBody>(creation.status, {
        ok: true,
        player: creation.player,
        accessCode: creation.accessCode,
      });
    }

    const playersResponse = await staffResult.serviceClient
      .from("players")
      .select(
        "id,display_name,roster_label,player_identifier,status,created_at,updated_at",
      )
      .eq("game_session_id", gameSessionId)
      .order("created_at", { ascending: true });

    if (playersResponse.error) {
      return jsonError(500, {
        code: "player_roster_failed",
        message: "Player roster could not be loaded.",
        retryable: false,
      });
    }

    const players = (playersResponse.data ?? []) as PlayerRosterRow[];
    const playerIds = players.map((player) => player.id);
    const activeCredentialPlayerIds = new Set<string>();

    if (playerIds.length > 0) {
      const credentialResponse = await staffResult.serviceClient
        .from("player_access_credentials")
        .select("player_id")
        .eq("game_session_id", gameSessionId)
        .eq("status", "active")
        .in("player_id", playerIds);

      if (credentialResponse.error) {
        return jsonError(500, {
          code: "player_roster_failed",
          message: "Player roster could not be loaded.",
          retryable: false,
        });
      }

      const credentials =
        (credentialResponse.data ?? []) as ActivePlayerCredentialRow[];

      for (const credential of credentials) {
        if (typeof credential.player_id === "string") {
          activeCredentialPlayerIds.add(credential.player_id);
        }
      }
    }

    return jsonResponse<PlayerRosterBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      players: players.map((player) => ({
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        playerIdentifier: player.player_identifier ?? null,
        status: player.status,
        hasActiveAccessCode: activeCredentialPlayerIds.has(player.id),
        createdAt: player.created_at,
        updatedAt: player.updated_at,
      })),
    });
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "player_roster_failed",
      message: "Player roster request failed.",
      retryable: false,
    });
  }
}
