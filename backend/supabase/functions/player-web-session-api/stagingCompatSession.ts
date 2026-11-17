import {
  env,
  safePlayer,
  safeGame,
} from "./stagingCompatHttp.ts";
import {
  type SessionPayload,
  MAX_SESSION_TOKEN_LENGTH,
  encoder,
  MAX_SESSION_ENVELOPE_BYTES,
  SESSION_CONTEXT,
  decoder,
  LOCAL_COOKIE,
  HOST_COOKIE,
} from "./stagingCompatContracts.ts";


export function randomBase64Url(length: number): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}


export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}


export function decodeBase64Url(value: string): Uint8Array {
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


export function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}


export function sessionKey(): Uint8Array {
  const encoded = env("ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY") ||
    env("ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY");
  const key = decodeBase64Url(encoded);
  if (key.byteLength !== 32) throw new Error("player_session_key_unavailable");
  return key;
}


export function validatePayload(value: unknown): asserts value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_session");
  const payload = value as Partial<SessionPayload>;
  if (
    payload.schemaVersion !== "econovaria-player-web-session-v1" ||
    typeof payload.sessionToken !== "string" ||
    payload.sessionToken.length < 16 ||
    payload.sessionToken.length > MAX_SESSION_TOKEN_LENGTH ||
    !Number.isSafeInteger(payload.sessionExpiresAt) ||
    !Number.isSafeInteger(payload.absoluteExpiresAt) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    typeof payload.csrfToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(payload.csrfToken) ||
    !safePlayer(payload.player) ||
    !safeGame(payload.gameSession)
  ) throw new Error("invalid_session");
}


export async function sealSession(payload: SessionPayload, keyBytes: Uint8Array): Promise<string> {
  validatePayload(payload);
  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_SESSION_ENVELOPE_BYTES) throw new Error("session_too_large");
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
  const parts = String(envelope || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("invalid_session");
  const iv = decodeBase64Url(parts[1]);
  const encrypted = decodeBase64Url(parts[2]);
  if (iv.byteLength !== 12 || encrypted.byteLength < 17 || encrypted.byteLength > MAX_SESSION_ENVELOPE_BYTES + 64) {
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
  validatePayload(payload);
  const now = Math.floor(Date.now() / 1000);
  if (payload.sessionExpiresAt <= now || payload.absoluteExpiresAt <= now || payload.issuedAt > now + 60) {
    throw new Error("expired_session");
  }
  return payload;
}


export function cookieValue(request: Request): string {
  for (const segment of String(request.headers.get("cookie") || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if ([LOCAL_COOKIE, HOST_COOKIE].includes(name) && /^[A-Za-z0-9._-]{1,4096}$/u.test(value)) return value;
  }
  return "";
}


export async function resolveSession(request: Request, key: Uint8Array): Promise<SessionPayload | null> {
  const envelope = cookieValue(request);
  if (!envelope) return null;
  try {
    return await openSession(envelope, key);
  } catch {
    return null;
  }
}


export function appendClearCookie(headers: Headers): void {
  headers.append("Set-Cookie", `${HOST_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  headers.append("Set-Cookie", `${LOCAL_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}


export async function appendSessionCookie(
  request: Request,
  headers: Headers,
  payload: SessionPayload,
  key: Uint8Array,
): Promise<void> {
  const envelope = await sealSession(payload, key);
  const origin = new URL(String(request.headers.get("origin") || "http://127.0.0.1:4173"));
  const local = origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname);
  const name = local ? LOCAL_COOKIE : HOST_COOKIE;
  const maxAge = Math.max(1, payload.absoluteExpiresAt - Math.floor(Date.now() / 1000));
  headers.append(
    "Set-Cookie",
    `${name}=${envelope}; Path=/; Max-Age=${maxAge}; HttpOnly; ${local ? "" : "Secure; "}SameSite=Strict`,
  );
}


export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}
