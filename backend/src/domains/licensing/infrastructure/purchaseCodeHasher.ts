import {
  normalizePurchaseCodeHash,
  PurchaseCodeHashingError,
  type PurchaseCodeHasher,
  type PurchaseCodeHashInput,
  type PurchaseCodeHashResult,
} from "../domain/purchaseCodeHashing";

export interface Sha256HexDigest {
  digestUtf8ToHex(value: string): Promise<string>;
}

export interface PurchaseCodeSha256HasherDependencies {
  readonly digest: Sha256HexDigest;
}

export function createPurchaseCodeSha256Hasher(
  dependencies: PurchaseCodeSha256HasherDependencies,
): PurchaseCodeHasher {
  return {
    hashPurchaseCode: (input) => hashPurchaseCodeWithSha256(input, dependencies),
  };
}

export async function hashPurchaseCodeWithSha256(
  input: PurchaseCodeHashInput,
  dependencies: PurchaseCodeSha256HasherDependencies,
): Promise<PurchaseCodeHashResult> {
  const normalizedPurchaseCode = input.normalizedPurchaseCode.value.trim();

  if (!normalizedPurchaseCode) {
    throw new PurchaseCodeHashingError("normalizedPurchaseCode is required.");
  }

  const codeHash = normalizePurchaseCodeHash(
    await dependencies.digest.digestUtf8ToHex(normalizedPurchaseCode),
  ).toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(codeHash)) {
    throw new PurchaseCodeHashingError(
      "purchaseCodeHash must be a SHA-256 hex digest.",
    );
  }

  return {
    codeHash,
  };
}
