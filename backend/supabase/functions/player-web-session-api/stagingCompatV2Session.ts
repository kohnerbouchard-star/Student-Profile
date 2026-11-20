import {
  env,
  safePlayer,
  safeGame,
} from "./stagingCompatV2Http.ts";
import {
  type SessionPayload,
  encoder,
  SESSION_CONTEXT,
  decoder,
  COOKIE_LOCAL,
  COOKIE_HOST,
  MAX_COOKIE_BYTES,
} from "./stagingCompatV2Contracts.ts";


export function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}


export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}


export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return new Uint8Array();
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}


export function sessionKey(): Uint8Array {
  const encoded = env("ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY") ||
    env("ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY");
  const key = decodeBase64Url(encoded);
  if (key.byteLength !== 32) throw new Error("player_session_key_unavailable");
  return key;
}


export function validateSession(value: unknown): asserts value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_session");
  const payload = value as Partial<SessionPayload>;
  if (
    payload.schemaVersion !== "econovaria-player-web-session-v1" ||
    typeof payload.sessionToken !== "string" ||
    payload.sessionToken.length < 16 || payload.sessionToken.length > 512 ||
    !Number.isSafeInteger(payload.sessionExpiresAt) ||
    !Number.isSafeInteger(payload.absoluteExpiresAt) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    typeof payload.csrfToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(payload.csrfToken) ||
    !safePlayer(payload.player) || !safeGame(payload.gameSession)
  ) throw new Error("invalid_session");
}


export async function sealSession(payload: SessionPayload, keyBytes: Uint8Array): Promise<string> {
  validateSession(payload);
  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.byteLength > 2_048) throw new Error("session_too_large");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", ownedBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: ownedBuffer(iv),
    additionalData: encoder.encode(SESSION_CONTEXT),
    tagLength: 128,
  }, key, ownedBuffer(plaintext)));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(encrypted)}`;
}


export async function openSession(envelope: string, keyBytes: Uint8Array): Promise<SessionPayload> {
  const parts = envelope.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("invalid_session");
  const iv = decodeBase64Url(parts[1]);
  const encrypted = decodeBase64Url(parts[2]);
  if (iv.byteLength !== 12 || encrypted.byteLength < 17 || encrypted.byteLength > 2_112) {
    throw new Error("invalid_session");
  }
  const key = await crypto.subtle.importKey("raw", ownedBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: ownedBuffer(iv),
    additionalData: encoder.encode(SESSION_CONTEXT),
    tagLength: 128,
  }, key, ownedBuffer(encrypted)));
  const payload = JSON.parse(decoder.decode(plaintext));
  validateSession(payload);
  const now = Math.floor(Date.now() / 1000);
  if (payload.sessionExpiresAt <= now || payload.absoluteExpiresAt <= now || payload.issuedAt > now + 60) {
    throw new Error("expired_session");
  }
  return payload;
}


export function cookieEnvelope(request: Request): string {
  for (const segment of String(request.headers.get("cookie") || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if ([COOKIE_LOCAL, COOKIE_HOST].includes(name) && value.length <= MAX_COOKIE_BYTES &&
      /^[A-Za-z0-9._-]+$/u.test(value)) return value;
  }
  return "";
}


export async function resolveSession(request: Request, key: Uint8Array): Promise<SessionPayload | null> {
  const envelope = cookieEnvelope(request);
  if (!envelope) return null;
  try {
    return await openSession(envelope, key);
  } catch {
    return null;
  }
}


export function clearCookies(headers: Headers): void {
  headers.append("Set-Cookie", `${COOKIE_HOST}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  headers.append("Set-Cookie", `${COOKIE_LOCAL}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}


export async function setSessionCookie(
  request: Request,
  headers: Headers,
  payload: SessionPayload,
  key: Uint8Array,
): Promise<void> {
  const envelope = await sealSession(payload, key);
  const origin = new URL(String(request.headers.get("origin") || "http://127.0.0.1:4173"));
  const local = origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname);
  const name = local ? COOKIE_LOCAL : COOKIE_HOST;
  const maxAge = Math.max(1, payload.absoluteExpiresAt - Math.floor(Date.now() / 1000));
  headers.append(
    "Set-Cookie",
    `${name}=${envelope}; Path=/; Max-Age=${maxAge}; HttpOnly; ${local ? "" : "Secure; "}SameSite=Strict`,
  );
}


export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.byteLength, b.byteLength);
  let difference = a.byteLength ^ b.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}
