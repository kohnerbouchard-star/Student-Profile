import type { GameSessionRecord, UUID } from "../auth/types";
import type { AuditRepository } from "../supabase/auditRepository";
import type { GameCreationRepository } from "../supabase/gameRepository";
import type {
  AuditLogInsert,
  GameSettingsRecord,
  JsonObject,
  JsonValue,
} from "../supabase/tableTypes";

export interface CreateGameInput {
  readonly ownerStaffUserId: UUID;
  readonly name: string;
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: JsonObject | null;
  readonly businessMarketWindow?: JsonObject | null;
  readonly stockMarketWindow?: JsonObject | null;
  readonly newsSchedule?: JsonObject | null;
  readonly audit?: CreateGameAuditInput;
}

export interface CreateGameAuditInput {
  readonly source?: string | null;
  readonly reason?: string | null;
  readonly requestId?: string | null;
  readonly metadata?: JsonObject;
}

export interface CreateGameDependencies {
  readonly gameRepository: GameCreationRepository;
  readonly auditRepository: Pick<AuditRepository, "writeAuditLogEntry">;
}

export interface CreateGameResult {
  readonly gameSession: GameSessionRecord;
  readonly gameSettings: GameSettingsRecord;
  readonly auditLogged: boolean;
}

export class CreateGameValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateGameValidationError";
  }
}

export async function createGame(
  input: CreateGameInput,
  dependencies: CreateGameDependencies,
): Promise<CreateGameResult> {
  const normalizedInput = normalizeCreateGameInput(input);

  const gameSession = await dependencies.gameRepository.createGameSession({
    owner_staff_user_id: normalizedInput.ownerStaffUserId,
    name: normalizedInput.name,
    status: "active",
    game_join_code_hash: null,
    game_join_code_status: "pending",
  });

  const gameSettings = await dependencies.gameRepository.createGameSettings({
    game_session_id: gameSession.id,
    difficulty_preset: normalizedInput.difficultyPreset,
    attendance_window: normalizedInput.attendanceWindow,
    business_market_window: normalizedInput.businessMarketWindow,
    stock_market_window: normalizedInput.stockMarketWindow,
    news_schedule: normalizedInput.newsSchedule,
  });

  await dependencies.auditRepository.writeAuditLogEntry(
    buildCreateGameAuditEntry(input, normalizedInput, gameSession, gameSettings),
  );

  return {
    gameSession,
    gameSettings,
    auditLogged: true,
  };
}

export interface NormalizedCreateGameInput {
  readonly ownerStaffUserId: UUID;
  readonly name: string;
  readonly difficultyPreset: string;
  readonly attendanceWindow: JsonObject;
  readonly businessMarketWindow: JsonObject;
  readonly stockMarketWindow: JsonObject;
  readonly newsSchedule: JsonObject;
}

export function normalizeCreateGameInput(
  input: CreateGameInput,
): NormalizedCreateGameInput {
  return {
    ownerStaffUserId: normalizeRequiredUuid(
      input.ownerStaffUserId,
      "ownerStaffUserId",
    ),
    name: normalizeRequiredText(input.name, "name"),
    difficultyPreset: normalizeOptionalText(input.difficultyPreset, "standard"),
    attendanceWindow: normalizeJsonObject(input.attendanceWindow),
    businessMarketWindow: normalizeJsonObject(input.businessMarketWindow),
    stockMarketWindow: normalizeJsonObject(input.stockMarketWindow),
    newsSchedule: normalizeJsonObject(input.newsSchedule),
  };
}

export function buildCreateGameAuditEntry(
  input: CreateGameInput,
  normalizedInput: NormalizedCreateGameInput,
  gameSession: GameSessionRecord,
  gameSettings: GameSettingsRecord,
): AuditLogInsert {
  const audit = input.audit;

  return {
    game_session_id: gameSession.id,
    actor_type: "staff_user",
    actor_id: normalizedInput.ownerStaffUserId,
    action: "game_session.created",
    target_type: "game_session",
    target_id: gameSession.id,
    metadata: compactJsonObject({
      ...(audit?.metadata ?? {}),
      name: normalizedInput.name,
      status: gameSession.status,
      difficulty_preset: gameSettings.difficulty_preset,
      settings_id: gameSettings.id,
      source: normalizeOptionalString(audit?.source),
      reason: normalizeOptionalString(audit?.reason),
      request_id: normalizeOptionalString(audit?.requestId),
    }),
  };
}

function normalizeRequiredUuid(
  value: string | null | undefined,
  fieldName: string,
): UUID {
  const normalizedValue = value?.trim().toLowerCase() ?? "";

  if (!normalizedValue) {
    throw new CreateGameValidationError(`${fieldName} is required.`);
  }

  if (!isUuid(normalizedValue)) {
    throw new CreateGameValidationError(`${fieldName} must be a UUID.`);
  }

  return normalizedValue;
}

function normalizeRequiredText(
  value: string | null | undefined,
  fieldName: string,
): string {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    throw new CreateGameValidationError(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizeOptionalText(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    return fallback;
  }

  return normalizedValue;
}

function normalizeJsonObject(value: JsonObject | null | undefined): JsonObject {
  return value ?? {};
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
}

function compactJsonObject(
  value: Record<string, JsonValue | undefined>,
): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as JsonObject;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}
