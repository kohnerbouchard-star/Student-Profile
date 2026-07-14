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
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  isRecord,
  parseOptionalText,
  parseRequiredText,
} from "../../../platform/supabase/edgeParsing.ts";
import { normalizeStudentCode } from "../domain/playerAccessCodes.ts";
import { normalizePlayerIdentifier } from "../domain/playerIdentifiers.ts";

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

export interface CreatePlayerRequestBody {
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly playerIdentifier: string;
  readonly accessCode: string;
}

interface CreatePlayerWithIdentityRpcRow {
  readonly player_id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly player_identifier: string;
  readonly player_status: string;
  readonly player_created_at: string;
  readonly player_updated_at: string;
  readonly country_assignment_id: string;
  readonly country_profile_id: string;
  readonly country_code: string;
  readonly country_name: string;
  readonly assigned_at: string;
  readonly credential_created_at: string;
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
      const normalizedPlayerIdentifier = normalizePlayerIdentifier(
        body.playerIdentifier,
      );
      const normalizedAccessCode = normalizeStudentCode(body.accessCode);
      const accessCodeHash = await sha256Hex(normalizedAccessCode);

      const createResponse = await staffResult.serviceClient.rpc<
        CreatePlayerWithIdentityRpcRow[]
      >(
        "create_player_with_identity_and_credential",
        {
          p_game_session_id: gameSessionId,
          p_display_name: body.displayName,
          p_roster_label: body.rosterLabel,
          p_player_identifier: body.playerIdentifier.trim(),
          p_player_identifier_normalized: normalizedPlayerIdentifier,
          p_access_code_hash: accessCodeHash,
          p_assignment_metadata: {
            route: "staff.players.create",
            requestedByStaffUserId: staffResult.staff.id,
          },
        },
      );

      if (createResponse.error || !createResponse.data?.[0]?.player_id) {
        const message = createResponse.error?.message ?? "";

        if (message.includes("PLAYER_IDENTIFIER_CONFLICT")) {
          return jsonError(409, {
            code: "player_identifier_conflict",
            message: "That Player ID is already assigned to an active player in this game.",
            retryable: false,
          });
        }

        if (message.includes("PLAYER_ACCESS_CODE_CONFLICT")) {
          return jsonError(409, {
            code: "player_access_code_conflict",
            message: "That Access Code is already assigned to an active player in this game.",
            retryable: false,
          });
        }

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
          playerIdentifier: player.player_identifier,
          status: player.player_status,
          createdAt: player.player_created_at,
          updatedAt: player.player_updated_at,
        },
        accessCode: {
          studentCode: normalizedAccessCode,
          status: "active",
          createdAt: player.credential_created_at,
        },
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
        playerIdentifier: player.player_identifier ?? null,
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

function firstDefined(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizedPayload(value: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["player", "data", "payload"] as const) {
    const nested = value[key];
    if (isRecord(nested)) return { ...value, ...nested };
  }
  return value;
}

export async function readCreatePlayerRequestBody(
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

  const payload = normalizedPayload(value);

  return {
    displayName: parseRequiredText(
      firstDefined(payload, [
        "displayName",
        "name",
        "playerName",
        "studentName",
        "fullName",
        "username",
      ]),
      "player_display_name_required",
      "displayName is required.",
    ),
    rosterLabel: parseOptionalText(
      firstDefined(payload, [
        "rosterLabel",
        "roster",
        "label",
        "studentLabel",
        "classLabel",
      ]),
    ),
    playerIdentifier: parseRequiredText(
      firstDefined(payload, [
        "playerIdentifier",
        "playerId",
        "rfidCardId",
        "rfidId",
        "cardId",
        "externalPlayerId",
      ]),
      "player_identifier_required",
      "playerIdentifier is required.",
    ),
    accessCode: parseRequiredText(
      firstDefined(payload, [
        "accessCode",
        "studentCode",
        "playerAccessCode",
        "pin",
      ]),
      "player_access_code_required",
      "accessCode is required.",
    ),
  };
}
