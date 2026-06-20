import type { UUID } from "../../../auth/types.ts";
import type {
  JsonObject,
  RedeemPurchaseCodeForGameRpcRow,
} from "../../../supabase/tableTypes.ts";
import type { LicensingActivationRepository } from "../infrastructure/licensingRepository.ts";

export interface RedeemPurchaseCodeInput {
  readonly staffUserId: UUID;
  readonly purchaseCodeHash: string;
  readonly gameName: string;
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: JsonObject | null;
  readonly businessMarketWindow?: JsonObject | null;
  readonly stockMarketWindow?: JsonObject | null;
  readonly newsSchedule?: JsonObject | null;
  readonly requestId?: string | null;
  readonly source?: string | null;
}

export interface RedeemPurchaseCodeDependencies {
  readonly activationRepository: LicensingActivationRepository;
}

export interface RedeemPurchaseCodeResult {
  readonly activation: RedeemPurchaseCodeForGameRpcRow;
  readonly activationWriteAtomic: true;
}

export type RedeemPurchaseCodeErrorCode = "invalid_redemption_input";

export class RedeemPurchaseCodeError extends Error {
  readonly code: RedeemPurchaseCodeErrorCode;

  constructor(code: RedeemPurchaseCodeErrorCode, message: string) {
    super(message);
    this.name = "RedeemPurchaseCodeError";
    this.code = code;
  }
}

export async function redeemPurchaseCode(
  input: RedeemPurchaseCodeInput,
  dependencies: RedeemPurchaseCodeDependencies,
): Promise<RedeemPurchaseCodeResult> {
  const normalizedInput = normalizeRedeemPurchaseCodeInput(input);

  const activation = await dependencies.activationRepository.redeemPurchaseCodeForGame({
    staffUserId: normalizedInput.staffUserId,
    purchaseCodeHash: normalizedInput.purchaseCodeHash,
    gameName: normalizedInput.gameName,
    gameSettings: {
      difficulty_preset: normalizedInput.difficultyPreset,
      attendance_window: normalizedInput.attendanceWindow,
      business_market_window: normalizedInput.businessMarketWindow,
      stock_market_window: normalizedInput.stockMarketWindow,
      news_schedule: normalizedInput.newsSchedule,
    },
    requestMetadata: compactJsonObject({
      request_id: normalizedInput.requestId,
      source: normalizedInput.source ?? "purchase_code_redemption",
    }),
  });

  return {
    activation,
    activationWriteAtomic: true,
  };
}

interface NormalizedRedeemPurchaseCodeInput {
  readonly staffUserId: UUID;
  readonly purchaseCodeHash: string;
  readonly gameName: string;
  readonly difficultyPreset: string;
  readonly attendanceWindow: JsonObject;
  readonly businessMarketWindow: JsonObject;
  readonly stockMarketWindow: JsonObject;
  readonly newsSchedule: JsonObject;
  readonly requestId?: string;
  readonly source?: string;
}

function normalizeRedeemPurchaseCodeInput(
  input: RedeemPurchaseCodeInput,
): NormalizedRedeemPurchaseCodeInput {
  return {
    staffUserId: normalizeRequiredUuid(input.staffUserId, "staffUserId"),
    purchaseCodeHash: normalizeRequiredText(
      input.purchaseCodeHash,
      "purchaseCodeHash",
    ),
    gameName: normalizeRequiredText(input.gameName, "gameName"),
    difficultyPreset: normalizeOptionalText(input.difficultyPreset) ?? "standard",
    attendanceWindow: normalizeOptionalJsonObject(input.attendanceWindow),
    businessMarketWindow: normalizeOptionalJsonObject(input.businessMarketWindow),
    stockMarketWindow: normalizeOptionalJsonObject(input.stockMarketWindow),
    newsSchedule: normalizeOptionalJsonObject(input.newsSchedule),
    requestId: normalizeOptionalText(input.requestId),
    source: normalizeOptionalText(input.source),
  };
}

function normalizeRequiredUuid(
  value: string | null | undefined,
  fieldName: string,
): UUID {
  const normalizedValue = normalizeRequiredText(value, fieldName).toLowerCase();

  if (!isUuid(normalizedValue)) {
    throw new RedeemPurchaseCodeError(
      "invalid_redemption_input",
      `${fieldName} must be a UUID.`,
    );
  }

  return normalizedValue;
}

function normalizeRequiredText(
  value: string | null | undefined,
  fieldName: string,
): string {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    throw new RedeemPurchaseCodeError(
      "invalid_redemption_input",
      `${fieldName} is required.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalText(
  value: string | null | undefined,
  fallback?: string,
): string | undefined {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return fallback;
  }

  return normalizedValue;
}

function normalizeOptionalJsonObject(value: JsonObject | null | undefined): JsonObject {
  return value ?? {};
}

function compactJsonObject(
  value: Record<string, string | number | boolean | null | undefined>,
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
