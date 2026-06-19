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
import { normalizeStudentCode } from "../domain/playerAccessCodes.ts";

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

interface ResetPlayerAccessCodeSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly accessCode: {
    readonly studentCode: string;
    readonly status: "active";
    readonly createdAt: string;
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
      message: "Use POST to reset a player access code.",
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
      missingMessage: "A verified Supabase Auth user is required to manage player access codes.",
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
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "access_code_reset_failed",
        message: "Player access code could not be reset.",
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
        message: "Only active players can receive an access code.",
        retryable: false,
      });
    }

    const revokeResponse = await staffResult.serviceClient
      .from("player_access_credentials")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .eq("status", "active");

    if (revokeResponse.error) {
      return jsonError(500, {
        code: "access_code_reset_failed",
        message: "Player access code could not be reset.",
        retryable: false,
      });
    }

    const credentialResult = await createPlayerAccessCredential(
      staffResult.serviceClient,
      gameSessionId,
      playerId,
    );

    if (!credentialResult.ok) {
      return jsonError(credentialResult.status, credentialResult.error);
    }

    return jsonResponse<ResetPlayerAccessCodeSuccessBody>(200, {
      ok: true,
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      accessCode: {
        studentCode: credentialResult.studentCode,
        status: "active",
        createdAt: credentialResult.createdAt,
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
      code: "access_code_reset_failed",
      message: "Player access code could not be reset.",
      retryable: false,
    });
  }
}

function generateStudentCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));

  return [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

async function createPlayerAccessCredential(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
): Promise<
  | {
      readonly ok: true;
      readonly studentCode: string;
      readonly createdAt: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const studentCode = generateStudentCode();
    const credentialHash = await sha256Hex(normalizeStudentCode(studentCode));

    const credentialResponse = await serviceClient
      .from("player_access_credentials")
      .insert({
        game_session_id: gameSessionId,
        player_id: playerId,
        normalized_student_code_hash: credentialHash,
        status: "active",
      })
      .select("created_at")
      .single();

    if (!credentialResponse.error && credentialResponse.data?.created_at) {
      return {
        ok: true,
        studentCode,
        createdAt: credentialResponse.data.created_at,
      };
    }

    const message = credentialResponse.error?.message?.toLowerCase() ?? "";

    if (!message.includes("duplicate") && !message.includes("unique")) {
      return {
        ok: false,
        status: 500,
        error: {
          code: "access_code_reset_failed",
          message: "Player access code could not be reset.",
          retryable: false,
        },
      };
    }
  }

  return {
    ok: false,
    status: 409,
    error: {
      code: "access_code_generation_conflict",
      message: "A unique player access code could not be generated.",
      retryable: true,
    },
  };
}
