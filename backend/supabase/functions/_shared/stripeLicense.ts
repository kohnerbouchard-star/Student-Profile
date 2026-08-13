const TEXT_ENCODER = new TextEncoder();

export const DEFAULT_STRIPE_API_VERSION = "2026-02-25.clover";
export const ECONOVARIA_LICENSE_SKU = "econovaria-classroom-annual";
export const ECONOVARIA_FULFILLMENT_MARKER = "license-v1";

export interface BoundedBodyResult {
  readonly body: Uint8Array | null;
  readonly tooLarge: boolean;
}

export interface StripeApiError {
  readonly type?: string;
  readonly code?: string;
  readonly message?: string;
  readonly param?: string;
}

export function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

export function stripeMode(): "test" | "live" | null {
  const value = environmentValue("ECONOVARIA_STRIPE_MODE").toLowerCase();
  if (value === "test" || value === "live") return value;
  return null;
}

export function validStripeSecretKey(
  value: string,
  mode: "test" | "live",
): boolean {
  const prefix = mode === "test" ? "sk_test_" : "sk_live_";
  return value.startsWith(prefix) && value.length >= prefix.length + 16;
}

export function validStripeObjectId(
  value: string,
  prefix: "price" | "prod" | "cs" | "pi" | "evt",
): boolean {
  return new RegExp(`^${prefix}_[A-Za-z0-9]{8,191}$`, "u").test(value);
}

export function allowedOriginsFromEnvironment(): ReadonlySet<string> {
  const origins = environmentValue("ECONOVARIA_PUBLIC_APP_ORIGINS")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
  return new Set(origins);
}

export function normalizeOrigin(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function validCheckoutReturnUrl(
  value: string,
  requireSessionPlaceholder: boolean,
): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return false;
    }
    return !requireSessionPlaceholder ||
      value.includes("{CHECKOUT_SESSION_ID}");
  } catch {
    return false;
  }
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  if (!request.body) return { body: null, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("request_too_large").catch(() => undefined);
        return { body: null, tooLarge: true };
      }
      const owned = new Uint8Array(value.byteLength);
      owned.set(value);
      chunks.push(owned);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) return { body: null, tooLarge: false };
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, tooLarge: false };
}

export async function hmacSha256Hex(
  secret: string,
  value: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(TEXT_ENCODER.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(value),
  ));
  return bytesToHex(signature);
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? TEXT_ENCODER.encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(bytes),
  ));
  return bytesToHex(digest);
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  const leftBytes = TEXT_ENCODER.encode(left.toLowerCase());
  const rightBytes = TEXT_ENCODER.encode(right.toLowerCase());
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function concatBytes(
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array {
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left, 0);
  joined.set(right, left.byteLength);
  return joined;
}

export function requestIp(request: Request): string {
  for (const headerName of [
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
  ]) {
    const value = String(request.headers.get(headerName) || "")
      .split(",", 1)[0]
      .trim();
    if (value && value.length <= 128) return value;
  }
  return "unavailable";
}

export async function parseStripeApiResponse<T>(
  response: Response,
  maxBytes = 256 * 1024,
): Promise<{ readonly data: T | null; readonly error: StripeApiError | null }> {
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    return {
      data: null,
      error: { type: "invalid_response", message: "Stripe response too large." },
    };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return {
      data: null,
      error: { type: "invalid_response", message: "Stripe returned invalid JSON." },
    };
  }
  if (!response.ok) {
    const record = decoded && typeof decoded === "object"
      ? decoded as Record<string, unknown>
      : {};
    const error = record.error && typeof record.error === "object"
      ? record.error as Record<string, unknown>
      : {};
    return {
      data: null,
      error: {
        type: String(error.type || "stripe_error"),
        code: String(error.code || ""),
        message: String(error.message || "Stripe request failed."),
        param: String(error.param || ""),
      },
    };
  }
  return { data: decoded as T, error: null };
}

export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: HeadersInit = {},
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...Object.fromEntries(new Headers(extraHeaders)),
  });
  return new Response(JSON.stringify(body), { status, headers });
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
