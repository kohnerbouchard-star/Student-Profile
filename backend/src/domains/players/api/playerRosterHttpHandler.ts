import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readOwnedGameSession,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  isRecord,
  parseOptionalText,
  parseRequiredText,
} from "../../../platform/supabase/edgeParsing.ts";

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
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ActivePlayerCredentialRow {
  readonly player_id?: unknown;
}

interface CreatePlayerRequestBody {
  readonly displayName: string;
  readonly rosterLabel: string | null;
}

interface CreatePlayerWithCountryAssignmentRpcRow {
  readonly player_id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly player_status: string;
  readonly player_created_at: string;
  readonly player_updated_at: string;
  readonly country_assignment_id: string;
  readonly country_profile_id: string;
  readonly country_code: string;
  readonly country_name: string;
  readonly assigned_at: string;
}

interface CreatePlayerSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
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

    const staffResult = await dependencies.resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to manage players.",
    });

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );

    if (!ownershipResult.ok) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    if (request.method === "POST") {
      const body = await readCreatePlayerRequestBody(request);

      const createResponse = await staffResult.serviceClient.rpc<
        CreatePlayerWithCountryAssignmentRpcRow[]
      >(
        "create_player_with_balanced_country_assignment",
        {
          p_game_session_id: gameSessionId,
          p_display_name: body.displayName,
          p_roster_label: body.rosterLabel,
          p_assignment_metadata: {
            route: "staff.players.create",
            requestedByStaffUserId: staffResult.staff.id,
          },
        },
      );

      if (createResponse.error || !createResponse.data?.[0]?.player_id) {
        return jsonError(500, {
          code: "player_create_failed",
          message: "Player could not be created.",
          retryable: false,
        });
      }

      const player = createResponse.data[0];

      return jsonResponse<CreatePlayerSuccessBody>(201, {
        ok: true,
        player: {
          id: player.player_id,
          displayName: player.display_name,
          rosterLabel: player.roster_label ?? null,
          status: player.player_status,
          createdAt: player.player_created_at,
          updatedAt: player.player_updated_at,
        },
      });
    }

    const playersResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status,created_at,updated_at")
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

      const credentials = (credentialResponse.data ?? []) as ActivePlayerCredentialRow[];

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
        status: player.status,
        hasActiveAccessCode: activeCredentialPlayerIds.has(player.id),
        createdAt: player.created_at,
        updatedAt: player.updated_at,
      })),
    });
  } catch (error) {
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

async function readCreatePlayerRequestBody(
  request: Request,
): Promise<CreatePlayerRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    displayName: parseRequiredText(
      value.displayName,
      "player_display_name_required",
      "displayName is required.",
    ),
    rosterLabel: parseOptionalText(value.rosterLabel),
  };
}
