import {
  JWT_SEGMENT_PATTERN,
  decodeBase64Url,
  ownedArrayBuffer,
  TEXT_ENCODER,
  TEXT_DECODER,
} from "./adminBffCrypto.ts";

export const MAX_OIDC_TOKEN_BYTES = 16_384;

const VERCEL_ISSUER = "https://oidc.vercel.com/econovaria";

const VERCEL_AUDIENCE = "https://vercel.com/econovaria";

const VERCEL_OWNER_ID = "team_PRsNkw4DHrGsUHl6ikKw2XyJ";

const VERCEL_PROJECT_ID = "prj_xdyYj6NclqUD8XwTrXX6ueXJseV9";

const VERCEL_OWNER_SLUG = "econovaria";

const VERCEL_PROJECT_NAME = "econovaria";

export type HostedEnvironment = "production" | "preview";

interface JwtHeader {
  readonly alg?: unknown;
  readonly kid?: unknown;
  readonly typ?: unknown;
}

interface JwtPayload {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly sub?: unknown;
  readonly exp?: unknown;
  readonly nbf?: unknown;
  readonly iat?: unknown;
  readonly owner_id?: unknown;
  readonly project_id?: unknown;
  readonly environment?: unknown;
}

interface VercelJsonWebKey extends JsonWebKey {
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
}

interface JsonWebKeySet {
  readonly keys?: readonly VercelJsonWebKey[];
}

interface CachedJwks {
  readonly expiresAtMs: number;
  readonly value: JsonWebKeySet;
}

let cachedJwks: CachedJwks | null = null;

export async function verifyVercelOidcToken(
  token: string,
  expectedEnvironment: HostedEnvironment,
  nowSeconds: number,
): Promise<boolean> {
  if (new TextEncoder().encode(token).byteLength > MAX_OIDC_TOKEN_BYTES) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !JWT_SEGMENT_PATTERN.test(part))) {
    return false;
  }

  const header = decodeJwtJson<JwtHeader>(parts[0]);
  const payload = decodeJwtJson<JwtPayload>(parts[1]);
  if (!header || !payload || header.alg !== "RS256") return false;
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!/^[A-Za-z0-9._:-]{1,256}$/u.test(kid)) return false;

  const jwks = await readVercelJwks();
  const jwk = jwks.keys?.find((candidate) =>
    candidate.kid === kid &&
    candidate.kty === "RSA" &&
    (candidate.alg === undefined || candidate.alg === "RS256") &&
    (candidate.use === undefined || candidate.use === "sig")
  );
  if (!jwk) return false;
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = decodeBase64Url(parts[2]);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    ownedArrayBuffer(signature),
    ownedArrayBuffer(TEXT_ENCODER.encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!verified) return false;

  const expectedSubject =
    `owner:${VERCEL_OWNER_SLUG}:project:${VERCEL_PROJECT_NAME}:environment:${expectedEnvironment}`;
  const audience = Array.isArray(payload.aud)
    ? payload.aud
    : [payload.aud];
  const exp = Number(payload.exp);
  const nbf = payload.nbf === undefined ? null : Number(payload.nbf);
  const iat = payload.iat === undefined ? null : Number(payload.iat);
  return payload.iss === VERCEL_ISSUER &&
    audience.some((candidate) => typeof candidate === "string" && candidate === VERCEL_AUDIENCE) &&
    payload.sub === expectedSubject &&
    payload.owner_id === VERCEL_OWNER_ID &&
    payload.project_id === VERCEL_PROJECT_ID &&
    payload.environment === expectedEnvironment &&
    Number.isSafeInteger(exp) && exp > nowSeconds - 30 &&
    (nbf === null || (Number.isSafeInteger(nbf) && nbf <= nowSeconds + 30)) &&
    (iat === null || (Number.isSafeInteger(iat) && iat <= nowSeconds + 60));
}

async function readVercelJwks(): Promise<JsonWebKeySet> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAtMs > now) return cachedJwks.value;
  const response = await fetch(`${VERCEL_ISSUER}/.well-known/jwks`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Vercel OIDC key set unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 64 * 1024) {
    throw new Error("Vercel OIDC key set invalid");
  }
  const value = JSON.parse(TEXT_DECODER.decode(bytes)) as JsonWebKeySet;
  if (!Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 20) {
    throw new Error("Vercel OIDC key set invalid");
  }
  cachedJwks = { value, expiresAtMs: now + 5 * 60 * 1000 };
  return value;
}

function decodeJwtJson<T>(value: string): T | null {
  try {
    return JSON.parse(TEXT_DECODER.decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}
