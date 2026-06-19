import {
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
import { normalizeJoinCode } from "./gameJoinCodeHttpHelpers.ts";

interface GameJoinCodeResetDependencies {
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

interface ResetGameJoinCodeSuccessBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly joinCode: {
    readonly gameJoinCode: string;
    readonly status: "active";
    readonly updatedAt: string;
  };
}

export async function handleResetGameJoinCodeRequest(
  request: Request,
  gameSessionId: string,
  dependencies: GameJoinCodeResetDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to reset a game join code.",
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
      missingMessage: "A verified Supabase Auth user is required to reset a game join code.",
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

    const joinCodeResult = await resetGameJoinCode(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );

    if (!joinCodeResult.ok) {
      return jsonError(joinCodeResult.status, joinCodeResult.error);
    }

    return jsonResponse<ResetGameJoinCodeSuccessBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      joinCode: {
        gameJoinCode: joinCodeResult.gameJoinCode,
        status: "active",
        updatedAt: joinCodeResult.updatedAt,
      },
    });
  } catch {
    return jsonError(500, {
      code: "join_code_reset_failed",
      message: "Game join code could not be reset.",
      retryable: false,
    });
  }
}

function generateGameJoinCode(): string {
  return `ECO-${generateCompactCode(6)}`;
}

function generateCompactCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

async function resetGameJoinCode(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  staffUserId: string,
): Promise<
  | {
      readonly ok: true;
      readonly gameJoinCode: string;
      readonly updatedAt: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const gameJoinCode = generateGameJoinCode();
    const gameJoinCodeHash = await sha256Hex(normalizeJoinCode(gameJoinCode));

    const updateResponse = await serviceClient
      .from("game_sessions")
      .update({
        game_join_code_hash: gameJoinCodeHash,
        game_join_code_status: "active",
      })
      .eq("id", gameSessionId)
      .eq("owner_staff_user_id", staffUserId)
      .select("updated_at")
      .single();

    if (!updateResponse.error && updateResponse.data?.updated_at) {
      return {
        ok: true,
        gameJoinCode,
        updatedAt: updateResponse.data.updated_at,
      };
    }

    const message = updateResponse.error?.message?.toLowerCase() ?? "";

    if (!message.includes("duplicate") && !message.includes("unique")) {
      return {
        ok: false,
        status: 500,
        error: {
          code: "join_code_reset_failed",
          message: "Game join code could not be reset.",
          retryable: false,
        },
      };
    }
  }

  return {
    ok: false,
    status: 409,
    error: {
      code: "join_code_generation_conflict",
      message: "A unique game join code could not be generated.",
      retryable: true,
    },
  };
}
