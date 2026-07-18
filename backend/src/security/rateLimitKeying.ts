import {
  type PlayerRateLimitProfile,
  RATE_LIMIT_DIMENSIONS,
  type RateLimitBucketInput,
  RateLimitError,
} from "./rateLimitContracts.ts";
import { PLAYER_RATE_LIMIT_POLICIES } from "./playerRateLimitPolicy.ts";

export const TRUSTED_IP_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const;

export type TrustedIpHeader = typeof TRUSTED_IP_HEADERS[number];

export interface PlayerRateLimitContext {
  readonly action: string;
  readonly gameUuid: string;
  readonly ipAddress: string;
  readonly playerUuid: string;
  readonly profile: PlayerRateLimitProfile;
}

export interface PreAuthRateLimitContext {
  readonly action: string;
  readonly ipAddress: string;
  readonly profile: PlayerRateLimitProfile;
}

const ACTION_PATTERN =
  /^player\.[a-z][a-z0-9_-]{1,31}\.[a-z][a-z0-9_-]{1,31}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MINIMUM_HMAC_SECRET_LENGTH = 32;

export async function buildPlayerRateLimitBuckets(
  context: PlayerRateLimitContext,
  hmacSecret: string,
): Promise<readonly RateLimitBucketInput[]> {
  validateContext(context);
  validateHmacSecret(hmacSecret);

  const normalizedIp = normalizeIpAddress(context.ipAddress);
  const rawKeys = {
    action:
      `${context.action}\u0000${context.gameUuid}\u0000${context.playerUuid}`,
    game: context.gameUuid,
    identity: context.playerUuid,
    ip: normalizedIp,
  } as const;
  const policy = PLAYER_RATE_LIMIT_POLICIES[context.profile];

  return Promise.all(RATE_LIMIT_DIMENSIONS.map(async (dimension) => ({
    dimension,
    keyHash: await hmacSha256Hex(
      hmacSecret,
      `econovaria-rate-limit-v1\u0000${dimension}\u0000${rawKeys[dimension]}`,
    ),
    ...policy[dimension],
  })));
}

export async function buildPreAuthRateLimitBuckets(
  context: PreAuthRateLimitContext,
  hmacSecret: string,
): Promise<readonly RateLimitBucketInput[]> {
  validatePreAuthContext(context);
  validateHmacSecret(hmacSecret);

  const normalizedIp = normalizeIpAddress(context.ipAddress);
  const policy = PLAYER_RATE_LIMIT_POLICIES[context.profile];
  const rawKeys = {
    action: `${context.action}\u0000${normalizedIp}`,
    ip: normalizedIp,
  } as const;

  return Promise.all((["action", "ip"] as const).map(async (dimension) => ({
    dimension,
    keyHash: await hmacSha256Hex(
      hmacSecret,
      `econovaria-rate-limit-v1\u0000${dimension}\u0000${rawKeys[dimension]}`,
    ),
    ...policy[dimension],
  })));
}

export function readTrustedClientIp(
  request: Request,
  trustedHeader: TrustedIpHeader,
): string {
  const headerValue = request.headers.get(trustedHeader)?.trim() ?? "";
  if (!headerValue || headerValue.length > 512) {
    throw invalidContext("Trusted client IP metadata is missing or invalid.");
  }

  const candidate = trustedHeader === "x-forwarded-for"
    ? headerValue.split(",", 1)[0]?.trim() ?? ""
    : headerValue;

  return normalizeIpAddress(candidate);
}

export function normalizeIpAddress(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.length > 128 || candidate.includes("%")) {
    throw invalidContext("Trusted client IP metadata is invalid.");
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(candidate)) {
    const octets = candidate.split(".").map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) {
      throw invalidContext("Trusted client IP metadata is invalid.");
    }
    return octets.join(".");
  }

  const bracketless = candidate.startsWith("[") && candidate.endsWith("]")
    ? candidate.slice(1, -1)
    : candidate;
  if (!/^[0-9a-f:.]+$/iu.test(bracketless) || !bracketless.includes(":")) {
    throw invalidContext("Trusted client IP metadata is invalid.");
  }

  try {
    const hostname = new URL(`http://[${bracketless}]/`).hostname;
    if (!hostname.startsWith("[") || !hostname.endsWith("]")) {
      throw new Error("not ipv6");
    }
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    throw invalidContext("Trusted client IP metadata is invalid.");
  }
}

export async function hmacSha256Hex(
  secret: string,
  value: string,
): Promise<string> {
  validateHmacSecret(secret);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  const digest = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (!SHA256_PATTERN.test(digest)) {
    throw new RateLimitError(
      "rate_limit_service_unavailable",
      "Rate limit key derivation failed.",
    );
  }
  return digest;
}

function validateContext(context: PlayerRateLimitContext): void {
  if (!ACTION_PATTERN.test(context.action)) {
    throw invalidContext("Rate limit action is not a reviewed server action.");
  }
  if (
    !UUID_PATTERN.test(context.playerUuid) ||
    !UUID_PATTERN.test(context.gameUuid)
  ) {
    throw invalidContext("Rate limit ownership scope is invalid.");
  }
  if (!(context.profile in PLAYER_RATE_LIMIT_POLICIES)) {
    throw invalidContext("Rate limit policy profile is invalid.");
  }
}

function validatePreAuthContext(context: PreAuthRateLimitContext): void {
  if (!ACTION_PATTERN.test(context.action)) {
    throw invalidContext("Rate limit action is not a reviewed server action.");
  }
  if (!(context.profile in PLAYER_RATE_LIMIT_POLICIES)) {
    throw invalidContext("Rate limit policy profile is invalid.");
  }
}

function validateHmacSecret(secret: string): void {
  if (
    secret.length < MINIMUM_HMAC_SECRET_LENGTH || secret.length > 4_096 ||
    new Set(secret).size < 8
  ) {
    throw new RateLimitError(
      "invalid_rate_limit_config",
      "Rate limit HMAC configuration is invalid.",
    );
  }
}

function invalidContext(message: string): RateLimitError {
  return new RateLimitError("invalid_rate_limit_context", message);
}
