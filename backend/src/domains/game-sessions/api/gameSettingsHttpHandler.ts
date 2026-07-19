import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  isRecord,
  parseOptionalJsonObject,
  parseOptionalText,
} from "../../../platform/supabase/edgeParsing.ts";
import {
  validateStockMarketWindowSettings,
} from "../../stocks/calendars/stockMarketWindowSettings.ts";

interface GameSettingsDependencies {
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
}

interface GameSettingsPatchBody {
  readonly difficultyPreset: string | null;
  readonly attendanceWindow: Record<string, unknown> | null;
  readonly businessMarketWindow: Record<string, unknown> | null;
  readonly stockMarketWindow: Record<string, unknown> | null;
  readonly newsSchedule: Record<string, unknown> | null;
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
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await dependencies.resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to load game settings.",
    });

    if (!staffResult.ok) {
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
      const patchBody = await readGameSettingsPatchBody(request);
      const updatePayload = buildGameSettingsUpdatePayload(patchBody);

      if (Object.keys(updatePayload).length === 0) {
        return jsonError(400, {
          code: "settings_update_empty",
          message: "At least one game setting must be provided.",
          retryable: false,
        });
      }

      const updateResponse = await serviceClient
        .from("game_settings")
        .update(updatePayload)
        .eq("game_session_id", gameSession.id);

      if (updateResponse.error) {
        return jsonError(500, {
          code: "game_settings_failed",
          message: "Game settings request failed.",
          retryable: false,
        });
      }
    }

    const settingsResponse = await serviceClient
      .from("game_settings")
      .select("difficulty_preset,attendance_window,business_market_window,stock_market_window,news_schedule,updated_at")
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
        businessMarketWindow: readJsonObjectSetting(settings.business_market_window),
        stockMarketWindow: readJsonObjectSetting(settings.stock_market_window),
        newsSchedule: readJsonObjectSetting(settings.news_schedule),
        updatedAt: settings.updated_at,
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
      code: "game_settings_failed",
      message: "Game settings request failed.",
      retryable: false,
    });
  }
}

async function readGameSettingsPatchBody(
  request: Request,
): Promise<GameSettingsPatchBody> {
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
    difficultyPreset: parseOptionalText(value.difficultyPreset),
    attendanceWindow: parseOptionalJsonObject(value.attendanceWindow),
    businessMarketWindow: parseOptionalJsonObject(value.businessMarketWindow),
    stockMarketWindow: parseOptionalJsonObject(value.stockMarketWindow),
    newsSchedule: parseOptionalJsonObject(value.newsSchedule),
  };
}

function buildGameSettingsUpdatePayload(
  body: GameSettingsPatchBody,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (body.difficultyPreset !== undefined && body.difficultyPreset !== null) {
    payload.difficulty_preset = body.difficultyPreset;
  }

  if (body.attendanceWindow !== undefined && body.attendanceWindow !== null) {
    payload.attendance_window = body.attendanceWindow;
  }

  if (
    body.businessMarketWindow !== undefined &&
    body.businessMarketWindow !== null
  ) {
    payload.business_market_window = body.businessMarketWindow;
  }

  if (body.stockMarketWindow !== undefined && body.stockMarketWindow !== null) {
    try {
      validateStockMarketWindowSettings(body.stockMarketWindow);
    } catch (error) {
      throw new EdgeActivationError(
        "invalid_stock_market_timezone",
        error instanceof Error
          ? error.message
          : "stockMarketWindow.timezone is invalid.",
        400,
      );
    }

    payload.stock_market_window = normalizeStockMarketWindowSettings(
      body.stockMarketWindow,
    );
  }

  if (body.newsSchedule !== undefined && body.newsSchedule !== null) {
    payload.news_schedule = body.newsSchedule;
  }

  return payload;
}

function normalizeStockMarketWindowSettings(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof value.timezone !== "string") {
    return value;
  }

  return {
    ...value,
    timezone: value.timezone.trim(),
  };
}

function readJsonObjectSetting(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
