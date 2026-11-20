import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";

export interface GameSettingsReadScope {
  readonly applicationContext: GameSessionsStaffApplicationContext;
}

export interface ReadGameSettingsInput extends GameSettingsReadScope {
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
}

export type GameSettingsPersistenceRow = Readonly<Record<string, unknown>>;

export interface AdminGameSettingsReadModelPersistence {
  readonly settings: GameSettingsPersistenceRow | null;
  readonly difficultyPolicy: GameSettingsPersistenceRow | null;
}

export interface GameSettingsReadRepository {
  readGameSettings(
    input: GameSettingsReadScope,
  ): Promise<GameSettingsPersistenceRow | null>;
  readAdminGameSettingsView(
    input: GameSettingsReadScope,
  ): Promise<AdminGameSettingsReadModelPersistence>;
}

export interface ReadGameSettingsResult {
  readonly gameSession: ReadGameSettingsInput["gameSession"];
  readonly settings: {
    readonly difficultyPreset: string;
    readonly attendanceWindow: Record<string, unknown>;
    readonly businessMarketWindow: Record<string, unknown>;
    readonly stockMarketWindow: Record<string, unknown>;
    readonly newsSchedule: Record<string, unknown>;
    readonly updatedAt: string;
  };
}

export class GameSettingsReadPersistenceError extends Error {
  constructor() {
    super("Game settings persistence read failed.");
    this.name = "GameSettingsReadPersistenceError";
  }
}

export class GameSettingsReadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GameSettingsReadError";
  }
}

export async function readGameSettings(
  input: ReadGameSettingsInput,
  repository: GameSettingsReadRepository,
): Promise<ReadGameSettingsResult> {
  if (input.gameSession.id !== input.applicationContext.gameSessionId) {
    throw readFailure();
  }

  let row: GameSettingsPersistenceRow | null;
  try {
    row = await repository.readGameSettings({
      applicationContext: input.applicationContext,
    });
  } catch {
    throw readFailure();
  }

  if (!row) {
    throw new GameSettingsReadError(
      "game_settings_not_found",
      "Game settings were not found.",
      404,
    );
  }

  return {
    gameSession: {
      id: input.gameSession.id,
      name: input.gameSession.name,
      status: input.gameSession.status,
    },
    settings: {
      difficultyPreset: row.difficulty_preset as string,
      attendanceWindow: recordOrEmpty(row.attendance_window),
      businessMarketWindow: recordOrEmpty(row.business_market_window),
      stockMarketWindow: recordOrEmpty(row.stock_market_window),
      newsSchedule: recordOrEmpty(row.news_schedule),
      updatedAt: row.updated_at as string,
    },
  };
}

function readFailure(): GameSettingsReadError {
  return new GameSettingsReadError(
    "game_settings_failed",
    "Game settings request failed.",
    500,
  );
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
