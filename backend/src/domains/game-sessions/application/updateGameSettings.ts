import {
  AdminMutationError,
} from "../../../platform/supabase/adminMutation.ts";
import type {
  GameSessionMutationIdentity,
  GameSessionMutationRepository,
} from "../contracts/gameSessionMutationRepository.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import {
  normalizeRequiredStockMarketWindowSetting,
  StockMarketWindowConfigError,
} from "../../stocks/calendars/stockMarketWindowConfig.ts";

export interface UpdateGameSettingsInput {
  readonly applicationContext: GameSessionsStaffApplicationContext;
  readonly requestBody: unknown;
  readonly mutation: GameSessionMutationIdentity;
}

export interface ResetGameSettingsGroupInput {
  readonly applicationContext: GameSessionsStaffApplicationContext;
  readonly group: string;
  readonly mutation: GameSessionMutationIdentity;
}

export interface GameSettingsMutationPatches {
  readonly gameSettingsPatch: Readonly<Record<string, unknown>>;
  readonly difficultyPolicyPatch: Readonly<Record<string, unknown>>;
  readonly requestPayload: Readonly<Record<string, unknown>>;
}

export interface UpdatedGameSettings {
  readonly difficultyPreset: string;
  readonly attendanceWindow: Record<string, unknown>;
  readonly businessMarketWindow: Record<string, unknown>;
  readonly stockMarketWindow: Record<string, unknown>;
  readonly newsSchedule: Record<string, unknown>;
  readonly updatedAt: string;
}

export interface UpdateGameSettingsResult {
  readonly status: number;
  readonly replayed: boolean;
  readonly settings: UpdatedGameSettings;
  readonly difficultyPolicy: Record<string, unknown> | null;
}

const POLICY_ALIASES = [
  ["priceMultiplier", "priceModifier", "price_modifier"],
  ["incomeMultiplier", "incomeModifier", "income_modifier"],
  ["shockFrequency", "eventVolatilityModifier", "event_volatility_modifier"],
  ["shockSeverity", "scarcityModifier", "scarcity_modifier"],
  ["tradeMultiplier", "tradeModifier", "trade_modifier"],
  [
    "recoverySupport",
    "bankruptcyProtection",
    "creditModifier",
    "credit_modifier",
  ],
] as const;
const POLICY_COLUMNS = [
  "price_modifier",
  "income_modifier",
  "event_volatility_modifier",
  "scarcity_modifier",
  "trade_modifier",
  "credit_modifier",
] as const;

export function updateGameSettings(
  repository: GameSessionMutationRepository,
  input: UpdateGameSettingsInput,
): Promise<UpdateGameSettingsResult> {
  const patches = buildGameSettingsMutationPatches(input.requestBody);
  if (
    Object.keys(patches.gameSettingsPatch).length === 0 &&
    Object.keys(patches.difficultyPolicyPatch).length === 0
  ) {
    throw new AdminMutationError(
      "settings_update_empty",
      "At least one game setting must be provided.",
      400,
    );
  }

  return executeGameSettingsMutation(repository, input, patches);
}

export async function resetGameSettingsGroup(
  repository: GameSessionMutationRepository,
  input: ResetGameSettingsGroupInput,
): Promise<UpdateGameSettingsResult & { readonly group: string }> {
  const group = input.group.trim().toLowerCase();
  let gameSettingsPatch: Record<string, unknown>;
  let difficultyPolicyPatch: Record<string, unknown> = {};

  if (["difficulty", "economy", "simulation"].includes(group)) {
    gameSettingsPatch = { difficulty_preset: "moderate" };
    difficultyPolicyPatch = {
      difficulty_preset: "moderate",
      source: "preset",
    };
  } else {
    const columnByGroup: Record<string, string> = {
      attendance: "attendance_window",
      business: "business_market_window",
      "business-market": "business_market_window",
      stocks: "stock_market_window",
      "stock-market": "stock_market_window",
      news: "news_schedule",
    };
    const column = columnByGroup[group];
    if (!column) {
      throw new AdminMutationError(
        "settings_group_reset_not_configured",
        "That settings group does not have an authoritative reset profile.",
        409,
      );
    }
    gameSettingsPatch = { [column]: {} };
  }

  const result = await executeGameSettingsMutation(repository, input, {
    gameSettingsPatch,
    difficultyPolicyPatch,
    requestPayload: {
      resetGroup: group,
      gameSettingsPatch,
      difficultyPolicyPatch,
    },
  });
  return { ...result, group };
}

async function executeGameSettingsMutation(
  repository: GameSessionMutationRepository,
  input: Pick<
    UpdateGameSettingsInput,
    "applicationContext" | "mutation"
  >,
  patches: GameSettingsMutationPatches,
): Promise<UpdateGameSettingsResult> {
  const result = await repository.updateGameSettings({
    applicationContext: input.applicationContext,
    gameSettingsPatch: patches.gameSettingsPatch,
    difficultyPolicyPatch: patches.difficultyPolicyPatch,
    requestPayload: patches.requestPayload,
    mutation: input.mutation,
  });

  const settingsRow = requiredRecord(
    result.body.settings,
    "game_settings_failed",
    "Game settings request failed.",
  );
  const difficultyPolicy = result.body.difficultyPolicy == null
    ? null
    : requiredRecord(
      result.body.difficultyPolicy,
      "game_settings_failed",
      "Game settings request failed.",
    );

  return {
    status: result.status,
    replayed: result.replayed,
    settings: mapGameSettingsRow(settingsRow),
    difficultyPolicy,
  };
}

export function buildGameSettingsMutationPatches(
  value: unknown,
): GameSettingsMutationPatches {
  if (!isRecord(value)) {
    throw invalidSettings(
      "invalid_request_body",
      "Request body must be a JSON object.",
    );
  }

  const body = flattenSettingsRequest(value);
  const gameSettingsPatch: Record<string, unknown> = {};
  const difficultyPolicyPatch: Record<string, unknown> = {};

  const difficultyPreset = optionalText(body, [
    "difficultyPreset",
    "difficulty",
    "preset",
    "difficultyBasePreset",
  ]);
  const attendanceWindow = optionalObject(body, [
    "attendanceWindow",
    "attendance",
  ]);
  const businessMarketWindow = optionalObject(body, [
    "businessMarketWindow",
    "businessMarket",
  ]);
  const stockMarketWindow = optionalObject(body, [
    "stockMarketWindow",
    "stockMarket",
  ]);
  const newsSchedule = optionalObject(body, ["newsSchedule", "news"]);

  if (difficultyPreset !== undefined) {
    gameSettingsPatch.difficulty_preset = difficultyPreset.toLowerCase();
  }
  if (attendanceWindow !== undefined) {
    gameSettingsPatch.attendance_window = attendanceWindow;
  }
  if (businessMarketWindow !== undefined) {
    gameSettingsPatch.business_market_window = businessMarketWindow;
  }
  if (stockMarketWindow !== undefined) {
    try {
      gameSettingsPatch.stock_market_window =
        normalizeRequiredStockMarketWindowSetting(stockMarketWindow);
    } catch (error) {
      if (error instanceof StockMarketWindowConfigError) {
        throw invalidSettings("invalid_stock_market_timezone", error.message);
      }
      throw error;
    }
  }
  if (newsSchedule !== undefined) {
    gameSettingsPatch.news_schedule = newsSchedule;
  }

  POLICY_ALIASES.forEach((aliases, index) => {
    const value = optionalNumber(body, aliases);
    if (value !== undefined) {
      difficultyPolicyPatch[POLICY_COLUMNS[index]] = Math.min(
        2,
        Math.max(0.5, value),
      );
    }
  });

  if (Object.keys(difficultyPolicyPatch).length > 0) {
    difficultyPolicyPatch.difficulty_preset = "custom";
    difficultyPolicyPatch.source = "custom";
    difficultyPolicyPatch.custom_label = optionalText(body, ["customLabel"]) ??
      "Custom";
    difficultyPolicyPatch.difficulty_policy_profile_id = null;
  } else if (difficultyPreset !== undefined) {
    difficultyPolicyPatch.difficulty_preset = difficultyPreset.toLowerCase();
    difficultyPolicyPatch.source = "preset";
  }

  const requestPayload = {
    gameSettingsPatch,
    difficultyPolicyPatch,
  };
  return { gameSettingsPatch, difficultyPolicyPatch, requestPayload };
}

function flattenSettingsRequest(
  value: Record<string, unknown>,
): Record<string, unknown> {
  let envelope = value;
  let flattened: Record<string, unknown> = {};
  for (let depth = 0; depth < 4; depth += 1) {
    const { payload, ...siblings } = envelope;
    flattened = { ...flattened, ...siblings };
    if (payload == null) break;
    if (!isRecord(payload)) {
      throw invalidSettings(
        "invalid_request_body",
        "Request body payload must be a JSON object.",
      );
    }
    if (depth === 3) {
      throw invalidSettings(
        "invalid_request_body",
        "Request body contains too many nested payload envelopes.",
      );
    }
    envelope = payload;
  }

  const settings = flattened.settings;
  if (settings != null && !isRecord(settings)) {
    throw invalidSettings(
      "invalid_request_body",
      "Request body settings must be a JSON object.",
    );
  }
  if (!isRecord(settings)) return flattened;

  // v606 can wrap an explicit payload twice, while route bridges may add a
  // sibling attendanceWindow. Merge every bounded envelope plus the settings
  // draft so one save cannot silently persist only a sibling field.
  const { settings: _settings, ...siblings } = flattened;
  return { ...siblings, ...settings };
}

function mapGameSettingsRow(
  row: Record<string, unknown>,
): UpdatedGameSettings {
  const difficultyPreset = requiredText(row.difficulty_preset);
  const updatedAt = requiredText(row.updated_at);
  if (!difficultyPreset || !updatedAt) {
    throw new AdminMutationError(
      "game_settings_failed",
      "Game settings request failed.",
      500,
    );
  }

  return {
    difficultyPreset,
    attendanceWindow: recordOrEmpty(row.attendance_window),
    businessMarketWindow: recordOrEmpty(row.business_market_window),
    stockMarketWindow: recordOrEmpty(row.stock_market_window),
    newsSchedule: recordOrEmpty(row.news_schedule),
    updatedAt,
  };
}

function optionalText(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw invalidSettings(
      "invalid_activation_settings",
      "Game settings text values must be non-empty strings.",
    );
  }
  return value.trim();
}

function optionalObject(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw invalidSettings(
      "invalid_activation_settings",
      "Game settings must use valid JSON object values.",
    );
  }
  return value;
}

function optionalNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (
      typeof value === "string" &&
      QUALITATIVE_DIFFICULTY_VALUES.has(value.trim().toLowerCase())
    ) return undefined;
    throw invalidSettings(
      "invalid_difficulty_policy",
      "Difficulty policy modifiers must be finite numbers.",
    );
  }
  return parsed;
}

const QUALITATIVE_DIFFICULTY_VALUES = new Set([
  "off",
  "low",
  "normal",
  "elevated",
  "high",
  "mild",
  "moderate",
  "severe",
  "standard",
]);

function firstDefined(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function requiredRecord(
  value: unknown,
  code: string,
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new AdminMutationError(code, message, 500);
  return value;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function requiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function invalidSettings(code: string, message: string): AdminMutationError {
  return new AdminMutationError(code, message, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
