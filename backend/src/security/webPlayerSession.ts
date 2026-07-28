const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BITS = 128;
const SESSION_CONTEXT = "econovaria-player-web-session-v1";
const MAX_ENVELOPE_BYTES = 2_048;
const MAX_SESSION_TOKEN_LENGTH = 512;
const MAX_SAFE_TEXT_LENGTH = 256;

export const WEB_PLAYER_SESSION_ABSOLUTE_SECONDS = 4 * 60 * 60;
export const WEB_PLAYER_SESSION_COOKIE = "__Host-econovaria_player_session";
export const WEB_PLAYER_SESSION_LOCAL_COOKIE = "econovaria_player_session";

export interface WebPlayerSessionPayload {
  readonly schemaVersion: "econovaria-player-web-session-v1";
  readonly sessionToken: string;
  readonly sessionExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly issuedAt: number;
  readonly csrfToken: string;
  readonly player: {
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string;
    readonly status: string;
  };
  readonly gameSession: {
    readonly name: string;
    readonly status: string;
  };
}

export function readWebPlayerSessionKey(
  getEnv: (name: string) => string | undefined = readRuntimeEnvironment,
): Uint8Array {
  const dedicated = String(
    getEnv("ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY") || "",
  ).trim();
  const transition = String(
    getEnv("ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY") || "",
  ).trim();
  const encoded = dedicated || transition;
  const bytes = decodeBase64Url(encoded);
  if (bytes.byteLength !== 32) {
    throw new Error(
      "ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY must be a base64url-encoded 32-byte key; the Admin web-session key is accepted only as a transition fallback.",
    );
  }
  return bytes;
}

export async function sealWebPlayerSession(
  payload: WebPlayerSessionPayload,
  keyBytes: Uint8Array,
): Promise<string> {
  validatePayload(payload);
  validateKey(keyBytes);
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_ENVELOPE_BYTES) {
    throw new Error("Player web session payload is too large.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const key = await importAesKey(keyBytes, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ownedArrayBuffer(iv),
      additionalData: TEXT_ENCODER.encode(SESSION_CONTEXT),
      tagLength: AES_GCM_TAG_BITS,
    },
    key,
    ownedArrayBuffer(plaintext),
  ));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(encrypted)}`;
}

export async function openWebPlayerSession(
  envelope: string,
  keyBytes: Uint8Array,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<WebPlayerSessionPayload> {
  validateKey(keyBytes);
  const parts = String(envelope || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Player web session envelope is invalid.");
  }
  const iv = decodeBase64Url(parts[1]);
  const encrypted = decodeBase64Url(parts[2]);
  if (
    iv.byteLength !== AES_GCM_IV_BYTES ||
    encrypted.byteLength < 17 ||
    encrypted.byteLength > MAX_ENVELOPE_BYTES + 64
  ) {
    throw new Error("Player web session envelope is invalid.");
  }

  const key = await importAesKey(keyBytes, ["decrypt"]);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ownedArrayBuffer(iv),
      additionalData: TEXT_ENCODER.encode(SESSION_CONTEXT),
      tagLength: AES_GCM_TAG_BITS,
    },
    key,
    ownedArrayBuffer(encrypted),
  ));
  const payload = JSON.parse(TEXT_DECODER.decode(plaintext));
  validatePayload(payload);
  if (
    payload.absoluteExpiresAt <= nowSeconds ||
    payload.sessionExpiresAt <= nowSeconds
  ) {
    throw new Error("Player web session has expired.");
  }
  if (payload.issuedAt > nowSeconds + 60) {
    throw new Error("Player web session issue time is invalid.");
  }
  return payload;
}

export function createWebPlayerSessionPayload(input: {
  readonly sessionToken: string;
  readonly sessionExpiresAt: string;
  readonly csrfToken: string;
  readonly player: WebPlayerSessionPayload["player"];
  readonly gameSession: WebPlayerSessionPayload["gameSession"];
  readonly nowSeconds?: number;
}): WebPlayerSessionPayload {
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const upstreamExpiry = Math.floor(Date.parse(input.sessionExpiresAt) / 1000);
  if (!Number.isSafeInteger(upstreamExpiry) || upstreamExpiry <= issuedAt) {
    throw new Error("Player session expiry is invalid.");
  }
  const payload: WebPlayerSessionPayload = {
    schemaVersion: "econovaria-player-web-session-v1",
    sessionToken: input.sessionToken,
    sessionExpiresAt: upstreamExpiry,
    issuedAt,
    absoluteExpiresAt: Math.min(
      upstreamExpiry,
      issuedAt + WEB_PLAYER_SESSION_ABSOLUTE_SECONDS,
    ),
    csrfToken: input.csrfToken,
    player: input.player,
    gameSession: input.gameSession,
  };
  validatePayload(payload);
  return payload;
}

export function randomWebPlayerCsrfToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function parsePlayerCookieHeader(
  header: string | null,
): ReadonlyMap<string, string> {
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

export function constantTimePlayerTextEqual(
  left: string,
  right: string,
): boolean {
  const leftBytes = TEXT_ENCODER.encode(left);
  const rightBytes = TEXT_ENCODER.encode(right);
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function validatePayload(value: unknown): asserts value is WebPlayerSessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Player web session payload is invalid.");
  }
  const payload = value as Partial<WebPlayerSessionPayload>;
  if (
    payload.schemaVersion !== "econovaria-player-web-session-v1" ||
    !validSessionToken(payload.sessionToken) ||
    !Number.isSafeInteger(payload.sessionExpiresAt) ||
    !Number.isSafeInteger(payload.absoluteExpiresAt) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    typeof payload.csrfToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(payload.csrfToken) ||
    payload.absoluteExpiresAt! <= payload.issuedAt! ||
    payload.absoluteExpiresAt! - payload.issuedAt! >
      WEB_PLAYER_SESSION_ABSOLUTE_SECONDS ||
    payload.sessionExpiresAt! < payload.absoluteExpiresAt! ||
    !validPlayerSummary(payload.player) ||
    !validGameSummary(payload.gameSession)
  ) {
    throw new Error("Player web session payload is invalid.");
  }
}

function validSessionToken(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 16 &&
    value.length <= MAX_SESSION_TOKEN_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function validPlayerSummary(
  value: unknown,
): value is WebPlayerSessionPayload["player"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const player = value as Record<string, unknown>;
  return validSafeText(player.displayName) &&
    (player.rosterLabel === null || validSafeText(player.rosterLabel)) &&
    validSafeText(player.playerIdentifier) &&
    validSafeText(player.status);
}

function validGameSummary(
  value: unknown,
): value is WebPlayerSessionPayload["gameSession"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const game = value as Record<string, unknown>;
  return validSafeText(game.name) && validSafeText(game.status);
}

function validSafeText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SAFE_TEXT_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function validateKey(bytes: Uint8Array): void {
  if (bytes.byteLength !== 32) {
    throw new Error("Player web session encryption key must be 32 bytes.");
  }
}

async function importAesKey(
  bytes: Uint8Array,
  usages: readonly KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(bytes),
    "AES-GCM",
    false,
    [...usages],
  );
}

function readRuntimeEnvironment(name: string): string | undefined {
  const runtime = globalThis as unknown as {
    readonly Deno?: {
      readonly env?: { get(name: string): string | undefined };
    };
  };
  return runtime.Deno?.env?.get(name);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
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
