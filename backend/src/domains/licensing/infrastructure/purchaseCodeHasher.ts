import {
  normalizePurchaseCodeHash,
  PurchaseCodeHashingError,
  type PurchaseCodeHasher,
  type PurchaseCodeHashInput,
  type PurchaseCodeHashResult,
} from "../domain/purchaseCodeHashing.ts";

const TEXT_ENCODER = new TextEncoder();
const PURCHASE_CODE_HASH_VERSION = "v2";
const PURCHASE_CODE_HMAC_CONTEXT = "econovaria-purchase-code-v2\u0000";
const MIN_HMAC_SECRET_LENGTH = 32;

export interface Sha256HexDigest {
  digestUtf8ToHex(value: string): Promise<string>;
}

export interface PurchaseCodeSha256HasherDependencies {
  readonly digest: Sha256HexDigest;
}

export interface PurchaseCodeHmacSha256HasherDependencies
  extends PurchaseCodeSha256HasherDependencies {
  readonly hmacSecret?: string;
  readonly readHmacSecret?: () => string | undefined;
  readonly signHmacSha256Hex?: (
    secret: string,
    value: string,
  ) => Promise<string>;
}

/**
 * Versioned purchase-code verifier material. The primary digest is keyed and
 * therefore cannot be guessed offline from a database dump. The legacy digest
 * is included only inside the request envelope so the database can atomically
 * upgrade pre-existing SHA-256 records after a successful redemption.
 */
export function createPurchaseCodeHmacSha256Hasher(
  dependencies: PurchaseCodeHmacSha256HasherDependencies,
): PurchaseCodeHasher {
  return {
    hashPurchaseCode: (input) =>
      hashPurchaseCodeWithHmacSha256(input, dependencies),
  };
}

export async function hashPurchaseCodeWithHmacSha256(
  input: PurchaseCodeHashInput,
  dependencies: PurchaseCodeHmacSha256HasherDependencies,
): Promise<PurchaseCodeHashResult> {
  const normalizedPurchaseCode = input.normalizedPurchaseCode.value.trim();
  if (!normalizedPurchaseCode) {
    throw new PurchaseCodeHashingError("normalizedPurchaseCode is required.");
  }

  const secret = String(
    dependencies.hmacSecret ?? dependencies.readHmacSecret?.() ?? "",
  );
  validateHmacSecret(secret);

  const sign = dependencies.signHmacSha256Hex ?? signHmacSha256Hex;
  const primaryHash = normalizeSha256Hex(
    await sign(secret, `${PURCHASE_CODE_HMAC_CONTEXT}${normalizedPurchaseCode}`),
    "purchaseCodeHmac",
  );
  const legacyHash = normalizeSha256Hex(
    await dependencies.digest.digestUtf8ToHex(normalizedPurchaseCode),
    "legacyPurchaseCodeHash",
  );

  return {
    codeHash: normalizePurchaseCodeHash(
      `${PURCHASE_CODE_HASH_VERSION}.${primaryHash}.${legacyHash}`,
    ),
  };
}

/**
 * Retained only for explicit migration fixtures and compatibility tests. New
 * activation paths must use createPurchaseCodeHmacSha256Hasher.
 */
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

  const codeHash = normalizeSha256Hex(
    await dependencies.digest.digestUtf8ToHex(normalizedPurchaseCode),
    "purchaseCodeHash",
  );

  return { codeHash };
}

export function readPurchaseCodeHmacSecret(): string | undefined {
  const runtime = globalThis as unknown as {
    readonly Deno?: {
      readonly env?: { get(name: string): string | undefined };
    };
    readonly process?: {
      readonly env?: Record<string, string | undefined>;
    };
  };
  const read = (name: string) =>
    runtime.Deno?.env?.get(name) ?? runtime.process?.env?.[name];

  // A dedicated key is preferred. The rate-limit or Supabase server secret is
  // accepted only as a transition key so existing deployments fail closed
  // without reintroducing an unkeyed digest. The HMAC message is domain
  // separated, and production should rotate to the dedicated key.
  return read("ECONOVARIA_PURCHASE_CODE_HMAC_SECRET") ??
    read("ECONOVARIA_RATE_LIMIT_HMAC_SECRET") ??
    read("SUPABASE_SECRET_KEY") ??
    read("SUPABASE_SERVICE_ROLE_KEY");
}

function validateHmacSecret(secret: string): void {
  if (secret.length < MIN_HMAC_SECRET_LENGTH || secret.length > 4096) {
    throw new PurchaseCodeHashingError(
      "Purchase-code HMAC secret must contain 32 to 4096 characters.",
    );
  }
}

function normalizeSha256Hex(value: string, fieldName: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new PurchaseCodeHashingError(
      `${fieldName} must be a SHA-256 hex digest.`,
    );
  }
  return normalized;
}

async function signHmacSha256Hex(
  secret: string,
  value: string,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new PurchaseCodeHashingError(
      "Web Crypto HMAC-SHA-256 runtime is not available.",
    );
  }
  const key = await subtle.importKey(
    "raw",
    ownedArrayBuffer(TEXT_ENCODER.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(TEXT_ENCODER.encode(value)),
  ));
  return [...signature]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
