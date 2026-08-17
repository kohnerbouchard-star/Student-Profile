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
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { updateGameSettings } from "../application/updateGameSettings.ts";
import {
  GameSettingsReadError,
  readGameSettings,
} from "../application/readGameSettings.ts";
import {
  createSupabaseGameSessionMutationRepository,
} from "../infrastructure/supabaseGameSessionMutationRepository.ts";
import {
  createSupabaseGameSettingsReadRepository,
} from "../infrastructure/supabaseGameSettingsReadRepository.ts";
import {
  createGameSessionsStaffApplicationContext,
} from "./gameSessionsStaffApplicationContextFactory.ts";

interface GameSettingsDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: {
      readonly missingMessage: string;
    },
  ) => Promise<StaffRequestResolution>;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly createApplicationContext?:
    typeof createGameSessionsStaffApplicationContext;
  readonly createSettingsReadRepository?:
    typeof createSupabaseGameSettingsReadRepository;
  readonly createMutationRepository?:
    typeof createSupabaseGameSessionMutationRepository;
  readonly readSettings?: typeof readGameSettings;
  readonly updateSettings?: typeof updateGameSettings;
}

type StaffRequestResolution =
  | {
    readonly ok: true;
    readonly staff: {
      readonly id: string;
      readonly role: "game_admin" | "security_operator";
    };
    readonly serviceClient: EdgeSupabaseClient;
    readonly assuranceLevel: "aal1" | "aal2" | "unknown";
  }
  | {
    readonly ok: false;
    readonly status: number;
    readonly error: EdgeErrorBody["error"];
  };

interface GameSettingsBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly settings: {
    readonly difficultyPreset: string;
    readonly attendanceWindow: Record<string, unknown>;
    readonly businessMarketWindow: Record<string, unknown>;
    readonly stockMarketWindow: Record<string, unknown>;
    readonly newsSchedule: Record<string, unknown>;
    readonly updatedAt: string;
  };
  readonly difficultyPolicy?: Record<string, unknown> | null;
  readonly replayed?: boolean;
}

export async function handleGameSettingsRequest(
  request: Request,
  gameSessionId: string,
  dependencies: GameSettingsDependencies,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or PATCH for game settings.",
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
        missingMessage:
          "A verified Supabase Auth user is required to load game settings.",
      },
    );

    if (staffResult.ok === false) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const serviceClient = staffResult.serviceClient;

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,owner_staff_user_id")
      .eq("id", gameSessionId)
      .eq("owner_staff_user_id", staffResult.staff.id)
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "game_settings_failed",
        message: "Game settings request failed.",
        retryable: false,
      });
    }

    const gameSession = gameResponse.data;

    if (!gameSession?.id) {
      return jsonError(404, {
        code: "game_session_not_found",
        message: "Game session was not found for this staff user.",
        retryable: false,
      });
    }

    const publicGameSession = {
      id: gameSession.id,
      name: gameSession.name,
      status: gameSession.status,
    };
    const applicationContext = (
      dependencies.createApplicationContext ??
        createGameSessionsStaffApplicationContext
    )({
      ownedGame: { id: publicGameSession.id },
      staff: staffResult.staff,
      assuranceLevel: staffResult.assuranceLevel,
      requestId: crypto.randomUUID(),
    });

    if (request.method === "PATCH") {
      const requestBody = await readGameSettingsMutationBody(request);
      const mutation = readAdminMutationIdentity(request, requestBody);
      const repository = (
        dependencies.createMutationRepository ??
          createSupabaseGameSessionMutationRepository
      )(
        serviceClient as unknown as AdminMutationRpcClient,
      );
      const result = await (dependencies.updateSettings ?? updateGameSettings)(
        repository,
        {
          applicationContext,
          requestBody,
          mutation,
        },
      );

      return jsonResponse<GameSettingsBody>(result.status, {
        ok: true,
        gameSession: publicGameSession,
        settings: result.settings,
        difficultyPolicy: result.difficultyPolicy,
        replayed: result.replayed,
      });
    }

    const repository = (
      dependencies.createSettingsReadRepository ??
        createSupabaseGameSettingsReadRepository
    )(serviceClient);
    const result = await (dependencies.readSettings ?? readGameSettings)(
      { applicationContext, gameSession: publicGameSession },
      repository,
    );

    return jsonResponse<GameSettingsBody>(200, {
      ok: true,
      gameSession: {
        id: result.gameSession.id,
        name: result.gameSession.name,
        status: result.gameSession.status,
      },
      settings: result.settings,
    });
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return jsonError(error.status, adminMutationErrorBody(error).error);
    }
    if (error instanceof GameSettingsReadError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "game_settings_failed",
      message: "Game settings request failed.",
      retryable: false,
    });
  }
}

async function readGameSettingsMutationBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new AdminMutationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new AdminMutationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
