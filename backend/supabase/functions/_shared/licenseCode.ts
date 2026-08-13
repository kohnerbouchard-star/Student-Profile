const TEXT_ENCODER = new TextEncoder();

export const LICENSE_CODE_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const LICENSE_CODE_PATTERN =
  /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u;

const LICENSE_CODE_DERIVATION_CONTEXT =
  "econovaria-license-code-v1\u0000";
const PURCHASE_CODE_HMAC_CONTEXT =
  "econovaria-purchase-code-v2\u0000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 4096;

export interface DeriveLicenseCodeInput {
  readonly secret: string;
  readonly jobId: string;
  readonly nonce: number;
}

export async function deriveLicenseCode(
  input: DeriveLicenseCodeInput,
): Promise<string> {
  validateSecret(input.secret, "license-code derivation secret");
  const jobId = input.jobId.trim().toLowerCase();
  if (!UUID_PATTERN.test(jobId)) {
    throw new Error("jobId must be a UUID.");
  }
  if (
    !Number.isSafeInteger(input.nonce) ||
    input.nonce < 0 ||
    input.nonce > 100
  ) {
    throw new Error("nonce must be an integer from 0 through 100.");
  }

  const entropy = await signHmacSha256(
    input.secret,
    `${LICENSE_CODE_DERIVATION_CONTEXT}${jobId}\u0000${input.nonce}`,
  );
  return formatLicenseCodeEntropy(entropy);
}

export async function hashIssuedPurchaseCode(
  secret: string,
  licenseCode: string,
): Promise<string> {
  validateSecret(secret, "purchase-code HMAC secret");
  const normalized = normalizeIssuedLicenseCode(licenseCode);
  return bytesToHex(await signHmacSha256(
    secret,
    `${PURCHASE_CODE_HMAC_CONTEXT}${normalized}`,
  ));
}

export function normalizeIssuedLicenseCode(value: string): string {
  const compact = String(value || "")
    .trim()
    .replace(/[\s-]+/gu, "")
    .toUpperCase();

  if (
    compact.length !== 16 ||
    [...compact].some((character) =>
      !LICENSE_CODE_ALPHABET.includes(character)
    )
  ) {
    throw new Error("License code must contain 16 supported characters.");
  }

  return [
    compact.slice(0, 4),
    compact.slice(4, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
  ].join("-");
}

export function formatLicenseCodeEntropy(entropy: Uint8Array): string {
  if (!(entropy instanceof Uint8Array) || entropy.byteLength < 10) {
    throw new Error("At least 80 bits of entropy are required.");
  }
  if (LICENSE_CODE_ALPHABET.length !== 32) {
    throw new Error("License-code alphabet must contain exactly 32 symbols.");
  }

  let bitBuffer = 0;
  let bufferedBits = 0;
  const characters: string[] = [];

  for (const byte of entropy) {
    bitBuffer = (bitBuffer << 8) | byte;
    bufferedBits += 8;

    while (bufferedBits >= 5 && characters.length < 16) {
      bufferedBits -= 5;
      const alphabetIndex = (bitBuffer >> bufferedBits) & 31;
      characters.push(LICENSE_CODE_ALPHABET[alphabetIndex]);
      bitBuffer &= bufferedBits === 0
        ? 0
        : (1 << bufferedBits) - 1;
    }

    if (characters.length === 16) break;
  }

  if (characters.length !== 16) {
    throw new Error("Could not derive a complete license code.");
  }

  return [
    characters.slice(0, 4).join(""),
    characters.slice(4, 8).join(""),
    characters.slice(8, 12).join(""),
    characters.slice(12, 16).join(""),
  ].join("-");
}

async function signHmacSha256(
  secret: string,
  value: string,
): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto HMAC-SHA-256 is unavailable.");
  }

  const key = await subtle.importKey(
    "raw",
    ownedArrayBuffer(TEXT_ENCODER.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(TEXT_ENCODER.encode(value)),
  ));
}

function validateSecret(secret: string, label: string): void {
  if (
    typeof secret !== "string" ||
    secret.length < MIN_SECRET_LENGTH ||
    secret.length > MAX_SECRET_LENGTH
  ) {
    throw new Error(`${label} must contain 32 to 4096 characters.`);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
