import type { RedeemPurchaseCodeResult } from "../application/redeemPurchaseCode.ts";
import type { LicensingActivationSafeError } from "../application/licensingActivationErrors.ts";
import { normalizePurchaseCode } from "../domain/purchaseCodeNormalization.ts";
import type { PurchaseCodeHasher } from "../domain/purchaseCodeHashing.ts";
import type { JsonObject } from "../../../supabase/tableTypes.ts";

export interface LicensingActivationRequestBody {
  readonly purchaseCode: string;
  readonly gameName: string;
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: JsonObject | null;
  readonly businessMarketWindow?: JsonObject | null;
  readonly stockMarketWindow?: JsonObject | null;
  readonly newsSchedule?: JsonObject | null;
}

export interface LicensingActivationRouteContext {
  readonly staffUserId: string;
  readonly requestId?: string | null;
  readonly source?: string | null;
}

export interface LicensingActivationServiceInput {
  readonly staffUserId: string;
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

export interface LicensingActivationContractDependencies {
  readonly purchaseCodeHasher: PurchaseCodeHasher;
}

export interface LicensingActivationSuccessResponse {
  readonly ok: true;
  readonly activation: {
    readonly gameSessionId: string;
    readonly entitlementId: string;
    readonly purchaseCodeId: string;
    readonly purchaseCodeStatus: string;
    readonly redeemedCount: number;
    readonly maxRedemptions: number;
    readonly activatedAt: string;
  };
}

export interface LicensingActivationErrorResponse {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export type LicensingActivationResponse =
  | LicensingActivationSuccessResponse
  | LicensingActivationErrorResponse;

export async function prepareLicensingActivationServiceInput(
  body: LicensingActivationRequestBody,
  context: LicensingActivationRouteContext,
  dependencies: LicensingActivationContractDependencies,
): Promise<LicensingActivationServiceInput> {
  const normalizedPurchaseCode = normalizePurchaseCode(body.purchaseCode);
  const purchaseCodeHash = await dependencies.purchaseCodeHasher.hashPurchaseCode({
    normalizedPurchaseCode,
  });

  return buildLicensingActivationServiceInput(
    body,
    context,
    purchaseCodeHash.codeHash,
  );
}

export function buildLicensingActivationServiceInput(
  body: LicensingActivationRequestBody,
  context: LicensingActivationRouteContext,
  purchaseCodeHash: string,
): LicensingActivationServiceInput {
  return {
    staffUserId: context.staffUserId,
    purchaseCodeHash,
    gameName: body.gameName,
    difficultyPreset: body.difficultyPreset,
    attendanceWindow: body.attendanceWindow,
    businessMarketWindow: body.businessMarketWindow,
    stockMarketWindow: body.stockMarketWindow,
    newsSchedule: body.newsSchedule,
    requestId: context.requestId,
    source: context.source ?? "licensing_activation_route",
  };
}

export function buildLicensingActivationSuccessResponse(
  result: RedeemPurchaseCodeResult,
): LicensingActivationSuccessResponse {
  const activation = result.activation;

  return {
    ok: true,
    activation: {
      gameSessionId: activation.game_session_id,
      entitlementId: activation.entitlement_id,
      purchaseCodeId: activation.purchase_code_id,
      purchaseCodeStatus: activation.purchase_code_status,
      redeemedCount: activation.redeemed_count,
      maxRedemptions: activation.max_redemptions,
      activatedAt: activation.activated_at,
    },
  };
}

export function buildLicensingActivationErrorResponse(
  error: LicensingActivationSafeError,
): LicensingActivationErrorResponse {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  };
}
