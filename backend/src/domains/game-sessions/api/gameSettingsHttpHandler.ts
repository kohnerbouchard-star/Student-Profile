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

interface GameSettingsDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: {
      readonly missingMessage: string;
    },
  ) => Promise<StaffRequestResolution>;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly updateSettings?: typeof updateGameSettings;
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

    if (request.method === "PATCH") {
      const requestBody = await readGameSettingsMutationBody(request);
      const mutation = readAdminMutationIdentity(request, requestBody);
      const result = await (dependencies.updateSettings ?? updateGameSettings)(
        serviceClient as unknown as AdminMutationRpcClient,
        {
          gameSessionId: gameSession.id,
          staffUserId: staffResult.staff.id,
          requestBody,
          mutation,
        },
      );

      return jsonResponse<GameSettingsBody>(result.status, {
        ok: true,
        gameSession: {
          id: gameSession.id,
          name: gameSession.name,
          status: gameSession.status,
        },
        settings: result.settings,
        difficultyPolicy: result.difficultyPolicy,
        replayed: result.replayed,
      });
    }

    const settingsResponse = await serviceClient
      .from("game_settings")
      .select(
        "difficulty_preset,attendance_window,business_market_window,stock_market_window,news_schedule,updated_at",
      )
      .eq("game_session_id", gameSession.id)
      .maybeSingle();

    if (settingsResponse.error) {
      return jsonError(500, {
        code: "game_settings_failed",
        message: "Game settings request failed.",
        retryable: false,
      });
    }

    const settings = settingsResponse.data;

    if (!settings) {
      return jsonError(404, {
        code: "game_settings_not_found",
        message: "Game settings were not found.",
        retryable: false,
      });
    }

    return jsonResponse<GameSettingsBody>(200, {
      ok: true,
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
      },
      settings: {
        difficultyPreset: settings.difficulty_preset,
        attendanceWindow: readJsonObjectSetting(settings.attendance_window),
        businessMarketWindow: readJsonObjectSetting(
          settings.business_market_window,
        ),
        stockMarketWindow: readJsonObjectSetting(settings.stock_market_window),
        newsSchedule: readJsonObjectSetting(settings.news_schedule),
        updatedAt: settings.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return jsonError(error.status, adminMutationErrorBody(error).error);
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

function readJsonObjectSetting(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
