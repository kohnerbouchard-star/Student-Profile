export interface PurchaseCodeRedemptionState {
  readonly status: string;
  readonly maxRedemptions: number;
  readonly redeemedCount: number;
  readonly expiresAt?: string | null;
}

export type PurchaseCodeRedemptionDenialCode =
  | "purchase_code_not_active"
  | "purchase_code_exhausted"
  | "purchase_code_expired"
  | "purchase_code_invalid_redemption_limit"
  | "purchase_code_invalid_redemption_count"
  | "purchase_code_invalid_expiration";

export type PurchaseCodeRedemptionDecision =
  | PurchaseCodeRedemptionAllowed
  | PurchaseCodeRedemptionDenied;

export interface PurchaseCodeRedemptionAllowed {
  readonly ok: true;
}

export interface PurchaseCodeRedemptionDenied {
  readonly ok: false;
  readonly code: PurchaseCodeRedemptionDenialCode;
  readonly message: string;
}

export class PurchaseCodeRedemptionError extends Error {
  readonly code: PurchaseCodeRedemptionDenialCode;

  constructor(code: PurchaseCodeRedemptionDenialCode, message: string) {
    super(message);
    this.name = "PurchaseCodeRedemptionError";
    this.code = code;
  }
}

export function evaluatePurchaseCodeRedemption(
  purchaseCode: PurchaseCodeRedemptionState,
  now = new Date(),
): PurchaseCodeRedemptionDecision {
  const status = purchaseCode.status.trim().toLowerCase();

  if (status !== "active") {
    return deny(
      "purchase_code_not_active",
      "Purchase code is not active.",
    );
  }

  if (
    !Number.isInteger(purchaseCode.maxRedemptions) ||
    purchaseCode.maxRedemptions <= 0
  ) {
    return deny(
      "purchase_code_invalid_redemption_limit",
      "Purchase code redemption limit is invalid.",
    );
  }

  if (
    !Number.isInteger(purchaseCode.redeemedCount) ||
    purchaseCode.redeemedCount < 0
  ) {
    return deny(
      "purchase_code_invalid_redemption_count",
      "Purchase code redemption count is invalid.",
    );
  }

  if (purchaseCode.redeemedCount >= purchaseCode.maxRedemptions) {
    return deny(
      "purchase_code_exhausted",
      "Purchase code has already reached its redemption limit.",
    );
  }

  const expirationDecision = evaluateExpiration(purchaseCode.expiresAt, now);

  if (!expirationDecision.ok) {
    return expirationDecision;
  }

  return { ok: true };
}

export function requirePurchaseCodeRedeemable(
  purchaseCode: PurchaseCodeRedemptionState,
  now = new Date(),
): void {
  const decision = evaluatePurchaseCodeRedemption(purchaseCode, now);

  if (!decision.ok) {
    throw new PurchaseCodeRedemptionError(decision.code, decision.message);
  }
}

function evaluateExpiration(
  expiresAt: string | null | undefined,
  now: Date,
): PurchaseCodeRedemptionDecision {
  const normalizedExpiresAt = expiresAt?.trim();

  if (!normalizedExpiresAt) {
    return { ok: true };
  }

  const expirationDate = new Date(normalizedExpiresAt);

  if (Number.isNaN(expirationDate.getTime())) {
    return deny(
      "purchase_code_invalid_expiration",
      "Purchase code expiration is invalid.",
    );
  }

  if (expirationDate.getTime() <= now.getTime()) {
    return deny(
      "purchase_code_expired",
      "Purchase code has expired.",
    );
  }

  return { ok: true };
}

function deny(
  code: PurchaseCodeRedemptionDenialCode,
  message: string,
): PurchaseCodeRedemptionDenied {
  return {
    ok: false,
    code,
    message,
  };
}
