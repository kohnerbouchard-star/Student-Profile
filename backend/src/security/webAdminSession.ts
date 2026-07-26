const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BITS = 128;
const SESSION_CONTEXT = "econovaria-admin-web-session-v1";
const MAX_ENVELOPE_BYTES = 3_600;
const MAX_TOKEN_LENGTH = 2_500;
const MAX_USER_EMAIL_LENGTH = 320;

export const WEB_ADMIN_SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;
export const WEB_ADMIN_SESSION_COOKIE = "__Host-econovaria_admin_session";
export const WEB_ADMIN_SESSION_LOCAL_COOKIE = "econovaria_admin_session";

export interface WebAdminSessionPayload {
  readonly schemaVersion: "econovaria-admin-web-session-v1";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly issuedAt: number;
  readonly csrfToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly role: "game_admin";
    readonly permissionVersion: number;
    readonly securityVersion: number;
  };
}

export function readWebAdminSessionKey(
  getEnv: (name: string) => string | undefined = readRuntimeEnvironment,
): Uint8Array {
  const encoded = String(
    getEnv("ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY") || "",
  ).trim();
  const bytes = decodeBase64Url(encoded);
  if (bytes.byteLength !== 32) {
    throw new Error(
      "ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.",
    );
  }
  return bytes;
}

export async function sealWebAdminSession(
  payload: WebAdminSessionPayload,
  keyBytes: Uint8Array,
): Promise<string> {
  validatePayload(payload);
  validateKey(keyBytes);
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_ENVELOPE_BYTES) {
    throw new Error("Admin web session payload is too large.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const key = await importAesKey(keyBytes, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: concreteArrayBuffer(iv),
      additionalData: TEXT_ENCODER.encode(SESSION_CONTEXT),
      tagLength: AES_GCM_TAG_BITS,
    },
    key,
    concreteArrayBuffer(plaintext),
  ));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(encrypted)}`;
}

export async function openWebAdminSession(
  envelope: string,
  keyBytes: Uint8Array,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<WebAdminSessionPayload> {
  validateKey(keyBytes);
  const parts = String(envelope || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Admin web session envelope is invalid.");
  }
  const iv = decodeBase64Url(parts[1]);
  const encrypted = decodeBase64Url(parts[2]);
  if (
    iv.byteLength !== AES_GCM_IV_BYTES ||
    encrypted.byteLength < 17 ||
    encrypted.byteLength > MAX_ENVELOPE_BYTES + 64
  ) {
    throw new Error("Admin web session envelope is invalid.");
  }

  const key = await importAesKey(keyBytes, ["decrypt"]);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: concreteArrayBuffer(iv),
      additionalData: TEXT_ENCODER.encode(SESSION_CONTEXT),
      tagLength: AES_GCM_TAG_BITS,
    },
    key,
    concreteArrayBuffer(encrypted),
  ));
  const payload = JSON.parse(TEXT_DECODER.decode(plaintext));
  validatePayload(payload);
  if (payload.absoluteExpiresAt <= nowSeconds) {
    throw new Error("Admin web session has expired.");
  }
  if (payload.issuedAt > nowSeconds + 60) {
    throw new Error("Admin web session issue time is invalid.");
  }
  return payload;
}

export function createWebAdminSessionPayload(input: {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: number;
  readonly csrfToken: string;
  readonly nowSeconds?: number;
  readonly user: WebAdminSessionPayload["user"];
}): WebAdminSessionPayload {
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: WebAdminSessionPayload = {
    schemaVersion: "econovaria-admin-web-session-v1",
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    accessExpiresAt: input.accessExpiresAt,
    issuedAt,
    absoluteExpiresAt: issuedAt + WEB_ADMIN_SESSION_ABSOLUTE_SECONDS,
    csrfToken: input.csrfToken,
    user: input.user,
  };
  validatePayload(payload);
  return payload;
}

export function randomWebAdminCsrfToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function parseCookieHeader(header: string | null): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  for (const segment of String(header || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (
      /^[A-Za-z0-9_-]{1,64}$/u.test(name) &&
      /^[A-Za-z0-9._-]{0,4096}$/u.test(value)
    ) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

export function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = TEXT_ENCODER.encode(left);
  const rightBytes = TEXT_ENCODER.encode(right);
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function validatePayload(value: unknown): asserts value is WebAdminSessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Admin web session payload is invalid.");
  }
  const payload = value as Partial<WebAdminSessionPayload>;
  if (
    payload.schemaVersion !== "econovaria-admin-web-session-v1" ||
    !validToken(payload.accessToken) ||
    !validToken(payload.refreshToken) ||
    !Number.isSafeInteger(payload.accessExpiresAt) ||
    !Number.isSafeInteger(payload.absoluteExpiresAt) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    typeof payload.csrfToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(payload.csrfToken) ||
    payload.absoluteExpiresAt! <= payload.issuedAt! ||
    payload.absoluteExpiresAt! - payload.issuedAt! > WEB_ADMIN_SESSION_ABSOLUTE_SECONDS ||
    !payload.user ||
    typeof payload.user.id !== "string" ||
    payload.user.id.length < 1 ||
    payload.user.id.length > 128 ||
    typeof payload.user.email !== "string" ||
    payload.user.email.length < 3 ||
    payload.user.email.length > MAX_USER_EMAIL_LENGTH ||
    payload.user.role !== "game_admin" ||
    !Number.isSafeInteger(payload.user.permissionVersion) ||
    !Number.isSafeInteger(payload.user.securityVersion)
  ) {
    throw new Error("Admin web session payload is invalid.");
  }
}

function validToken(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 8 &&
    value.length <= MAX_TOKEN_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function validateKey(bytes: Uint8Array): void {
  if (bytes.byteLength !== 32) {
    throw new Error("Admin web session encryption key must be 32 bytes.");
  }
}

async function importAesKey(
  bytes: Uint8Array,
  usages: readonly KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    concreteArrayBuffer(bytes),
    "AES-GCM",
    false,
    [...usages],
  );
}

function readRuntimeEnvironment(name: string): string | undefined {
  const runtime = globalThis as unknown as {
    readonly Deno?: {
      readonly env?: {
        get(name: string): string | undefined;
      };
    };
  };
  return runtime.Deno?.env?.get(name);
}

function concreteArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
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
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return new Uint8Array();
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}
