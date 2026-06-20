import type { NormalizedPurchaseCode } from "./purchaseCodeNormalization.ts";

export interface PurchaseCodeHashInput {
  readonly normalizedPurchaseCode: NormalizedPurchaseCode;
}

export interface PurchaseCodeHashResult {
  readonly codeHash: string;
}

export interface PurchaseCodeHasher {
  hashPurchaseCode(input: PurchaseCodeHashInput): Promise<PurchaseCodeHashResult>;
}

export class PurchaseCodeHashingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseCodeHashingError";
  }
}

export function normalizePurchaseCodeHash(value: string | null | undefined): string {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    throw new PurchaseCodeHashingError("purchaseCodeHash is required.");
  }

  return normalizedValue;
}
