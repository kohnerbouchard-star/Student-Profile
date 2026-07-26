declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

export const PLAYER_CREDENTIAL_VERSION = "pbkdf2-sha256-v2";
export const PLAYER_CREDENTIAL_ITERATIONS = 600_000;
export const PLAYER_CREDENTIAL_SALT_BYTES = 16;
export const PLAYER_CREDENTIAL_DERIVED_BYTES = 32;

export interface PlayerCredentialMaterial {
  readonly credentialVersion: typeof PLAYER_CREDENTIAL_VERSION;
  readonly lookupDigest: string;
  readonly salt: string;
  readonly verifier: string;
  readonly iterations: number;
}

export interface PlayerCredentialRecord {
  readonly credential_version: string;
  readonly normalized_student_code_hash: string;
  readonly credential_salt: string | null;
  readonly credential_verifier: string | null;
  readonly credential_iterations: number | string | null;
}

interface PlayerCredentialOptions {
  readonly pepper?: string;
  readonly saltBytes?: Uint8Array;
  readonly iterations?: number;
}

const TEXT_ENCODER = new TextEncoder();
const HEX_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export function readPlayerCredentialPepper(): string {
  const pepper = String(
    Deno.env.get("ECONOVARIA_PLAYER_CREDENTIAL_PEPPER") || "",
  );
  validatePepper(pepper);
  return pepper;
}

export async function createPlayerCredentialMaterial(
  normalizedAccessCode: string,
  options: PlayerCredentialOptions = {},
): Promise<PlayerCredentialMaterial> {
  const accessCode = validateAccessCode(normalizedAccessCode);
  const pepper = options.pepper ?? readPlayerCredentialPepper();
  validatePepper(pepper);
  const iterations = options.iterations ?? PLAYER_CREDENTIAL_ITERATIONS;
  validateIterations(iterations);
  const saltBytes = options.saltBytes ?? crypto.getRandomValues(
    new Uint8Array(PLAYER_CREDENTIAL_SALT_BYTES),
  );
  if (saltBytes.byteLength !== PLAYER_CREDENTIAL_SALT_BYTES) {
    throw new Error("Player credential salt must be exactly 16 bytes.");
  }

  const lookupDigest = await hmacHex(
    pepper,
    `econovaria-player-credential-lookup-v2\u0000${accessCode}`,
  );
  const passwordMaterial = await hmacBytes(
    pepper,
    `econovaria-player-credential-kdf-v2\u0000${accessCode}`,
  );
  const verifierBytes = await derivePbkdf2(
    passwordMaterial,
    saltBytes,
    iterations,
  );

  return {
    credentialVersion: PLAYER_CREDENTIAL_VERSION,
    lookupDigest,
    salt: encodeBase64Url(saltBytes),
    verifier: encodeBase64Url(verifierBytes),
    iterations,
  };
}

export async function verifyPlayerCredential(
  normalizedAccessCode: string,
  record: PlayerCredentialRecord,
  options: Pick<PlayerCredentialOptions, "pepper"> = {},
): Promise<boolean> {
  if (record.credential_version !== PLAYER_CREDENTIAL_VERSION) return false;
  const iterations = Number(record.credential_iterations);
  if (
    !record.credential_salt ||
    !record.credential_verifier ||
    !BASE64URL_PATTERN.test(record.credential_salt) ||
    !BASE64URL_PATTERN.test(record.credential_verifier) ||
    !HEX_PATTERN.test(record.normalized_student_code_hash) ||
    !Number.isSafeInteger(iterations)
  ) {
    return false;
  }

  try {
    const expected = await createPlayerCredentialMaterial(
      normalizedAccessCode,
      {
        pepper: options.pepper,
        saltBytes: decodeBase64Url(record.credential_salt),
        iterations,
      },
    );
    return constantTimeEqual(
      TEXT_ENCODER.encode(expected.verifier),
      TEXT_ENCODER.encode(record.credential_verifier),
    ) && constantTimeEqual(
      TEXT_ENCODER.encode(expected.lookupDigest),
      TEXT_ENCODER.encode(record.normalized_student_code_hash),
    );
  } catch {
    return false;
  }
}

export function isLegacyPlayerCredential(record: PlayerCredentialRecord): boolean {
  return record.credential_version === "sha256-v1" &&
    HEX_PATTERN.test(record.normalized_student_code_hash) &&
    record.credential_salt === null &&
    record.credential_verifier === null;
}

function validateAccessCode(value: string): string {
  const normalized = String(value || "");
  if (
    !normalized ||
    normalized.length > 128 ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new Error("Normalized Player Access Code is invalid.");
  }
  return normalized;
}

function validatePepper(value: string): void {
  if (value.length < 32 || value.length > 1024) {
    throw new Error(
      "ECONOVARIA_PLAYER_CREDENTIAL_PEPPER must contain 32 to 1024 characters.",
    );
  }
}

function validateIterations(value: number): void {
  if (!Number.isSafeInteger(value) || value < 100_000 || value > 1_000_000) {
    throw new Error("Player credential PBKDF2 iterations are outside the allowed range.");
  }
}

async function hmacBytes(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, TEXT_ENCODER.encode(value)),
  );
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const bytes = await hmacBytes(secret, value);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivePbkdf2(
  passwordMaterial: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    concreteArrayBuffer(passwordMaterial),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: concreteArrayBuffer(salt),
      iterations,
    },
    key,
    PLAYER_CREDENTIAL_DERIVED_BYTES * 8,
  ));
}

function concreteArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.byteLength, right.byteLength);
  let difference = left.byteLength ^ right.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
