import {
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  AdminMutationError,
  adminMutationErrorBody,
  type AdminMutationRpcClient,
  readAdminMutationIdentity,
} from "../../../platform/supabase/adminMutation.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  GameJoinCodeReadError,
  readGameJoinCode,
  type ReadGameJoinCodeInput,
  type ReadGameJoinCodeResult,
} from "../application/readGameJoinCode.ts";
import {
  createSupabaseGameJoinCodeReadRepository,
} from "../infrastructure/supabaseGameJoinCodeReadRepository.ts";
import { rotateGameJoinCode } from "../application/rotateGameJoinCode.ts";

interface GameJoinCodeResetDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: {
      readonly missingMessage: string;
    },
  ) => Promise<StaffRequestResolution>;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly readOwnedSession?: typeof readOwnedGameSession;
  readonly readJoinCode?: (
    input: ReadGameJoinCodeInput,
    serviceClient: EdgeSupabaseClient,
  ) => Promise<ReadGameJoinCodeResult>;
  readonly rotateJoinCode?: typeof rotateGameJoinCode;
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

interface GameJoinCodeSuccessBody {
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
  readonly replayed?: boolean;
}

export async function handleResetGameJoinCodeRequest(
  request: Request,
  gameSessionId: string,
  dependencies: GameJoinCodeResetDependencies,
): Promise<Response> {
  if (!new Set(["GET", "POST"]).has(request.method)) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to read or POST to rotate a game join code.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();

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
        missingMessage: request.method === "GET"
          ? "A verified Supabase Auth user is required to read a game join code."
          : "A verified Supabase Auth user is required to reset a game join code.",
      },
    );

    if (staffResult.ok === false) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await (
      dependencies.readOwnedSession ?? readOwnedGameSession
    )(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );

    if (ownershipResult.ok === false) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    if (request.method === "GET") {
      const input = {
        gameSessionId,
        staffUserId: staffResult.staff.id,
        gameSession: ownershipResult.gameSession,
      };
      const result = await (dependencies.readJoinCode ?? readPersistedJoinCode)(
        input,
        staffResult.serviceClient,
      );

      return jsonResponse<GameJoinCodeSuccessBody>(200, {
        ok: true,
        gameSession: result.gameSession,
        joinCode: result.joinCode,
      });
    }

    const requestBody = await readJoinCodeRotationBody(request);
    const mutation = readAdminMutationIdentity(request, requestBody);
    const joinCodeResult = await (
      dependencies.rotateJoinCode ?? rotateGameJoinCode
    )(
      staffResult.serviceClient as unknown as AdminMutationRpcClient,
      {
        gameSessionId,
        staffUserId: staffResult.staff.id,
        requestBody,
        mutation,
      },
    );

    return jsonResponse<GameJoinCodeSuccessBody>(joinCodeResult.status, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      joinCode: joinCodeResult.joinCode,
      replayed: joinCodeResult.replayed,
    });
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return jsonError(error.status, adminMutationErrorBody(error).error);
    }
    if (error instanceof GameJoinCodeReadError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: request.method === "GET"
        ? "join_code_read_failed"
        : "join_code_reset_failed",
      message: request.method === "GET"
        ? "Game join code could not be loaded."
        : "Game join code could not be reset.",
      retryable: false,
    });
  }
}

function readPersistedJoinCode(
  input: ReadGameJoinCodeInput,
  serviceClient: EdgeSupabaseClient,
): Promise<ReadGameJoinCodeResult> {
  return readGameJoinCode(
    input,
    createSupabaseGameJoinCodeReadRepository(serviceClient),
  );
}

async function readJoinCodeRotationBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AdminMutationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }
  return value as Record<string, unknown>;
}
