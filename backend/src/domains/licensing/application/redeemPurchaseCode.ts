import type { UUID } from "../../../auth/types";
import type { AuditRepository } from "../../../supabase/auditRepository";
import type { JsonObject } from "../../../supabase/tableTypes";
import {
  createGame,
  type CreateGameResult,
} from "../../game-sessions/application/createGame";
import type { GameCreationRepository } from "../../game-sessions/infrastructure/gameRepository";
import {
  evaluatePurchaseCodeRedemption,
  type PurchaseCodeRedemptionDenialCode,
} from "../domain/purchaseCodeRules";
import type { LicensingRepository } from "../infrastructure/licensingRepository";
import type {
  EntitlementRecord,
  PurchaseCodeRecord,
} from "../../../supabase/tableTypes";

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
  readonly licensingRepository: Pick<
    LicensingRepository,
    "findPurchaseCodeByHash" | "markPurchaseCodeRedeemed" | "createEntitlement"
  >;
  readonly gameRepository: GameCreationRepository;
  readonly auditRepository: Pick<AuditRepository, "writeAuditLogEntry">;
  readonly now?: () => Date;
}

export interface RedeemPurchaseCodeResult {
  readonly purchaseCode: PurchaseCodeRecord;
  readonly entitlement: EntitlementRecord;
  readonly game: CreateGameResult;
  readonly redeemedCountUpdated: true;
}

export type RedeemPurchaseCodeErrorCode =
  | "purchase_code_not_found"
  | "purchase_code_redemption_conflict"
  | "invalid_redemption_input"
  | PurchaseCodeRedemptionDenialCode;

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
  const now = dependencies.now?.() ?? new Date();

  const purchaseCode = await dependencies.licensingRepository.findPurchaseCodeByHash(
    normalizedInput.purchaseCodeHash,
  );

  if (!purchaseCode) {
    throw new RedeemPurchaseCodeError(
      "purchase_code_not_found",
      "Purchase code was not found.",
    );
  }

  const redemptionDecision = evaluatePurchaseCodeRedemption(
    {
      status: purchaseCode.status,
      maxRedemptions: purchaseCode.max_redemptions,
      redeemedCount: purchaseCode.redeemed_count,
      expiresAt: purchaseCode.expires_at,
    },
    now,
  );

  if (!redemptionDecision.ok) {
    throw new RedeemPurchaseCodeError(
      redemptionDecision.code,
      redemptionDecision.message,
    );
  }

  const nextRedeemedCount = purchaseCode.redeemed_count + 1;
  const markedPurchaseCode =
    await dependencies.licensingRepository.markPurchaseCodeRedeemed({
      purchaseCodeId: purchaseCode.id,
      expectedRedeemedCount: purchaseCode.redeemed_count,
      nextRedeemedCount,
      nextStatus: getNextPurchaseCodeStatus(purchaseCode, nextRedeemedCount),
    });

  if (!markedPurchaseCode) {
    throw new RedeemPurchaseCodeError(
      "purchase_code_redemption_conflict",
      "Purchase code redemption state changed before it could be marked redeemed.",
    );
  }

  const game = await createGame(
    {
      ownerStaffUserId: normalizedInput.staffUserId,
      name: normalizedInput.gameName,
      difficultyPreset: normalizedInput.difficultyPreset,
      attendanceWindow: normalizedInput.attendanceWindow,
      businessMarketWindow: normalizedInput.businessMarketWindow,
      stockMarketWindow: normalizedInput.stockMarketWindow,
      newsSchedule: normalizedInput.newsSchedule,
      audit: {
        source: normalizedInput.source ?? "purchase_code_redemption",
        requestId: normalizedInput.requestId,
        metadata: {
          purchase_code_id: markedPurchaseCode.id,
          purchase_code_redeemed_count: markedPurchaseCode.redeemed_count,
          purchase_code_status: markedPurchaseCode.status,
        },
      },
    },
    {
      gameRepository: dependencies.gameRepository,
      auditRepository: dependencies.auditRepository,
    },
  );

  const entitlement = await dependencies.licensingRepository.createEntitlement({
    purchase_code_id: markedPurchaseCode.id,
    staff_user_id: normalizedInput.staffUserId,
    game_session_id: game.gameSession.id,
    status: "active",
  });

  return {
    purchaseCode: markedPurchaseCode,
    entitlement,
    game,
    redeemedCountUpdated: true,
  };
}

function getNextPurchaseCodeStatus(
  purchaseCode: PurchaseCodeRecord,
  nextRedeemedCount: number,
): "active" | "exhausted" {
  return nextRedeemedCount >= purchaseCode.max_redemptions
    ? "exhausted"
    : "active";
}

interface NormalizedRedeemPurchaseCodeInput {
  readonly staffUserId: UUID;
  readonly purchaseCodeHash: string;
  readonly gameName: string;
  readonly difficultyPreset?: string;
  readonly attendanceWindow?: JsonObject;
  readonly businessMarketWindow?: JsonObject;
  readonly stockMarketWindow?: JsonObject;
  readonly newsSchedule?: JsonObject;
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
    difficultyPreset: normalizeOptionalText(input.difficultyPreset),
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

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
}

function normalizeOptionalJsonObject(
  value: JsonObject | null | undefined,
): JsonObject | undefined {
  return value ?? undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}
