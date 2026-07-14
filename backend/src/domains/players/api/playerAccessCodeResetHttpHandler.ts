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

interface PlayerAccessCodeResetDependencies {
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

interface IdentityWriteBody {
  readonly playerIdentifier: string | null;
  readonly accessCode: string | null;
}

interface ResetPlayerAccessCodeSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string;
    readonly status: string;
  };
  readonly accessCode: {
    readonly studentCode: string;
    readonly status: "active";
    readonly createdAt: string | null;
  };
}

export async function handleResetPlayerAccessCodeRequest(
  request: Request,
  gameSessionId: string,
  playerId: string,
  dependencies: PlayerAccessCodeResetDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to update player identity credentials.",
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
      missingMessage: "A verified Supabase Auth user is required to manage player identity credentials.",
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

    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,player_identifier,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "player_identity_update_failed",
        message: "Player identity credentials could not be updated.",
        retryable: false,
      });
    }

    const player = playerResponse.data;

    if (!player?.id) {
      return jsonError(404, {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        retryable: false,
      });
    }

    if (player.status !== "active") {
      return jsonError(409, {
        code: "player_not_active",
        message: "Only active players can receive identity credentials.",
        retryable: false,
      });
    }

    const requested = await readIdentityWriteBody(request);
    const playerIdentifier = requested.playerIdentifier ?? player.player_identifier;

    if (!playerIdentifier) {
      return jsonError(400, {
        code: "player_identifier_required",
        message: "Set the RFID Player ID before issuing an Access Code.",
        retryable: false,
      });
    }

    const normalizedPlayerIdentifier = normalizePlayerIdentifier(playerIdentifier);
    const accessCode = normalizeStudentCode(requested.accessCode ?? generateStudentCode());
    const accessCodeHash = await sha256Hex(accessCode);

    const updateResponse = await staffResult.serviceClient.rpc(
      "set_player_identity_and_access_code",
      {
        p_game_session_id: gameSessionId,
        p_player_id: playerId,
        p_player_identifier: playerIdentifier.trim(),
        p_player_identifier_normalized: normalizedPlayerIdentifier,
        p_access_code_hash: accessCodeHash,
      },
    );

    if (updateResponse.error) {
      const message = updateResponse.error.message ?? "";
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
      if (message.includes("PLAYER_NOT_FOUND")) {
        return jsonError(404, {
          code: "player_not_found",
          message: "Player was not found for this game session.",
          retryable: false,
        });
      }
      return jsonError(500, {
        code: "player_identity_update_failed",
        message: "Player identity credentials could not be updated.",
        retryable: false,
      });
    }

    const row = Array.isArray(updateResponse.data)
      ? updateResponse.data[0]
      : updateResponse.data;

    return jsonResponse<ResetPlayerAccessCodeSuccessBody>(200, {
      ok: true,
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        playerIdentifier: playerIdentifier.trim(),
        status: player.status,
      },
      accessCode: {
        studentCode: accessCode,
        status: "active",
        createdAt: row?.credential_created_at ?? null,
      },
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
      message: "Player identity credentials could not be updated.",
      retryable: false,
    });
  }
}

async function readIdentityWriteBody(request: Request): Promise<IdentityWriteBody> {
  let value: unknown;

  try {
    const raw = await request.text();
    if (!raw.trim()) return { playerIdentifier: null, accessCode: null };
    value = JSON.parse(raw);
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
  const rawIdentifier = source.playerIdentifier ?? source.playerId ??
    source.rfidCardId ?? source.rfidId ?? source.cardId ?? source.externalPlayerId;
  const rawAccessCode = source.accessCode ?? source.studentCode ??
    source.playerAccessCode ?? source.pin;

  return {
    playerIdentifier: rawIdentifier === undefined || rawIdentifier === null ||
        String(rawIdentifier).trim() === ""
      ? null
      : String(rawIdentifier).trim(),
    accessCode: rawAccessCode === undefined || rawAccessCode === null ||
        String(rawAccessCode).trim() === ""
      ? null
      : String(rawAccessCode).trim(),
  };
}

function generateStudentCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));

  return [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}
