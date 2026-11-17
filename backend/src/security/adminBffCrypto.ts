export const JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/u;

export const TEXT_ENCODER = new TextEncoder();

export const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

const SIGNING_KEY_CONTEXT = "econovaria-admin-bff-signing-key-v1";

export async function deriveSigningKey(signingMaterial: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(TEXT_ENCODER.encode(signingMaterial)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(TEXT_ENCODER.encode(SIGNING_KEY_CONTEXT)),
  ));
}

export async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(value),
  ));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!JWT_SEGMENT_PATTERN.test(value)) throw new Error("invalid base64url");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
