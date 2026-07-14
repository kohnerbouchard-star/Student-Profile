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
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { normalizeStudentCode } from "../domain/playerAccessCodes.ts";
import { normalizePlayerIdentifier } from "../domain/playerIdentifiers.ts";

interface PlayerIdentityDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: { readonly missingMessage: string },
  ) => Promise<
    | {
        readonly ok: true;
        readonly staff: { readonly id: string };
        readonly serviceClient: EdgeSupabaseClient;
      }
    | {
        readonly ok: false;
        readonly status: number;
        readonly error: EdgeErrorBody["error"];
      }
  >;
}

interface PlayerIdentityRequestBody {
  readonly playerIdentifier: string;
  readonly accessCode: string | null;
}

export async function handlePlayerIdentityRequest(
  request: Request,
  gameSessionId: string,
  playerId: string,
  dependencies: PlayerIdentityDependencies,
): Promise<Response> {
  if (!["PATCH", "PUT"].includes(request.method)) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use PATCH or PUT to update player identity.",
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
      missingMessage: "A verified Supabase Auth user is required to manage player identity.",
    });
    if (!staffResult.ok) return jsonError(staffResult.status, staffResult.error);

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );
    if (!ownershipResult.ok) return jsonError(ownershipResult.status, ownershipResult.error);

    const body = await readPlayerIdentityRequestBody(request);
    const normalizedIdentifier = normalizePlayerIdentifier(body.playerIdentifier);
    const normalizedAccessCode = body.accessCode
      ? normalizeStudentCode(body.accessCode)
      : null;
    const accessCodeHash = normalizedAccessCode
      ? await sha256Hex(normalizedAccessCode)
      : null;

    const updateResponse = await staffResult.serviceClient.rpc(
      "set_player_identity_and_access_code",
      {
        p_game_session_id: gameSessionId,
        p_player_id: playerId,
        p_player_identifier: body.playerIdentifier.trim(),
        p_player_identifier_normalized: normalizedIdentifier,
        p_access_code_hash: accessCodeHash,
      },
    );

    if (updateResponse.error) {
      const message = updateResponse.error.message ?? "";
      if (message.includes("PLAYER_NOT_FOUND")) {
        return jsonError(404, {
          code: "player_not_found",
          message: "Player was not found for this game.",
          retryable: false,
        });
      }
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
        code: "player_identity_update_failed",
        message: "Player identity could not be updated.",
        retryable: false,
      });
    }

    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,player_identifier,status,updated_at")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error || !playerResponse.data?.id) {
      return jsonError(500, {
        code: "player_identity_update_failed",
        message: "Player identity was updated but could not be reloaded.",
        retryable: false,
      });
    }

    return jsonResponse(200, {
      ok: true,
      player: {
        id: playerResponse.data.id,
        displayName: playerResponse.data.display_name,
        rosterLabel: playerResponse.data.roster_label ?? null,
        playerIdentifier: playerResponse.data.player_identifier,
        status: playerResponse.data.status,
        updatedAt: playerResponse.data.updated_at,
      },
      accessCode: normalizedAccessCode
        ? {
            studentCode: normalizedAccessCode,
            status: "active",
          }
        : null,
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
      code: "player_identity_update_failed",
      message: "Player identity could not be updated.",
      retryable: false,
    });
  }
}

export async function readPlayerIdentityRequestBody(
  request: Request,
): Promise<PlayerIdentityRequestBody> {
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

  const source = isRecord(value.payload) ? { ...value, ...value.payload } : value;
  const identifier = source.playerIdentifier ?? source.playerId ?? source.rfidCardId ??
    source.rfidId ?? source.cardId ?? source.externalPlayerId;
  const accessCode = source.accessCode ?? source.studentCode ??
    source.playerAccessCode ?? source.pin;

  if (identifier === undefined || identifier === null || String(identifier).trim() === "") {
    throw new EdgeActivationError(
      "player_identifier_required",
      "playerIdentifier is required.",
      400,
    );
  }

  return {
    playerIdentifier: String(identifier).trim(),
    accessCode: accessCode === undefined || accessCode === null ||
        String(accessCode).trim() === ""
      ? null
      : String(accessCode).trim(),
  };
}
