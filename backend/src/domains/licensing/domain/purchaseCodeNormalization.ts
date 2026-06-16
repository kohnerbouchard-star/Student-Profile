export interface NormalizedPurchaseCode {
  readonly value: string;
}

export class PurchaseCodeNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseCodeNormalizationError";
  }
}

export function normalizePurchaseCode(value: string | null | undefined): NormalizedPurchaseCode {
  const normalizedValue = value
    ?.trim()
    .replace(/\s+/g, "")
    .toUpperCase() ?? "";

  if (!normalizedValue) {
    throw new PurchaseCodeNormalizationError("purchaseCode is required.");
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new PurchaseCodeNormalizationError(
      "purchaseCode may only contain letters, numbers, and hyphens.",
    );
  }

  return {
    value: normalizedValue,
  };
}
