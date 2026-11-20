import {
  type PaidLicenseEvent,
  ALLOWED_KEYS,
  PROVIDER_PATTERN,
  IDENTIFIER_PATTERN,
  EMAIL_PATTERN,
  CURRENCY_PATTERN,
} from "./paymentWebhookContracts.ts";


export function normalizePaidLicenseEvent(
  input: unknown,
): PaidLicenseEvent | null {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !ALLOWED_KEYS.has(key)) ||
    record.schemaVersion !== 1 ||
    record.eventType !== "payment.succeeded"
  ) {
    return null;
  }

  const provider = String(record.provider || "")
    .trim()
    .toLowerCase();
  const eventId = String(record.eventId || "").trim();
  const paymentId = String(record.paymentId || "").trim();
  const providerPriceRef = String(
    record.providerPriceRef || "",
  ).trim();
  const customerEmail = String(record.customerEmail || "")
    .trim()
    .toLowerCase();
  const amountMinor = Number(record.amountMinor);
  const currency = String(record.currency || "")
    .trim()
    .toUpperCase();
  const occurredAt = String(record.occurredAt || "").trim();
  const occurredAtDate = new Date(occurredAt);

  if (
    !PROVIDER_PATTERN.test(provider) ||
    !IDENTIFIER_PATTERN.test(eventId) ||
    !IDENTIFIER_PATTERN.test(paymentId) ||
    !IDENTIFIER_PATTERN.test(providerPriceRef) ||
    customerEmail.length > 320 ||
    !EMAIL_PATTERN.test(customerEmail) ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    !CURRENCY_PATTERN.test(currency) ||
    !Number.isFinite(occurredAtDate.getTime()) ||
    occurredAtDate.getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    eventType: "payment.succeeded",
    provider,
    eventId,
    paymentId,
    providerPriceRef,
    customerEmail,
    amountMinor,
    currency,
    occurredAt: occurredAtDate.toISOString(),
  };
}


export function mapEnqueueError(error: {
  readonly message?: string | null;
  readonly code?: string | null;
}): Response {
  const message = String(error?.message || "").toUpperCase();

  if (
    message.includes("LICENSE_PRODUCT_NOT_CONFIGURED") ||
    message.includes("LICENSE_PRODUCT_PRICE_MISMATCH")
  ) {
    return json(503, {
      ok: false,
      error: {
        code: "license_product_configuration_unavailable",
        message: "The paid product is not ready for license issuance.",
      },
    }, { "Retry-After": "60" });
  }

  if (
    message.includes("PAYMENT_EVENT_REPLAY_MISMATCH") ||
    message.includes("PAYMENT_ID_REPLAY_MISMATCH")
  ) {
    return json(409, {
      ok: false,
      error: {
        code: "payment_idempotency_conflict",
        message: "The payment identifier conflicts with an earlier event.",
      },
    });
  }

  if (message.includes("INVALID_PAID_LICENSE_EVENT")) {
    return json(422, {
      ok: false,
      error: {
        code: "invalid_payment_event",
        message: "The successful-payment event is invalid.",
      },
    });
  }

  console.error("paid_license_enqueue_failed", {
    databaseCode: String(error?.code || ""),
  });
  return json(500, {
    ok: false,
    error: {
      code: "payment_enqueue_failed",
      message: "The payment event could not be durably accepted.",
    },
  }, { "Retry-After": "30" });
}


export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<{
  readonly body: Uint8Array | null;
  readonly tooLarge: boolean;
}> {
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

  if (totalBytes === 0) {
    return { body: null, tooLarge: false };
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, tooLarge: false };
}


export function parseSignatureTimestamp(
  value: string | null,
): number | null {
  const normalized = String(value || "").trim();
  if (!/^\d{10}$/u.test(normalized)) return null;
  const timestamp = Number(normalized);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}


export async function hmacSha256Hex(
  secret: string,
  value: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(new TextEncoder().encode(secret)),
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


export async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(value),
  ));
  return bytesToHex(digest);
}


export function constantTimeEqualHex(
  left: string,
  right: string,
): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(
    leftBytes.byteLength,
    rightBytes.byteLength,
  );
  let difference =
    leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}


export function concatBytes(
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array {
  const joined = new Uint8Array(
    left.byteLength + right.byteLength,
  );
  joined.set(left, 0);
  joined.set(right, left.byteLength);
  return joined;
}


export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}


export function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}


export function unauthorized(): Response {
  return json(401, {
    ok: false,
    error: {
      code: "invalid_payment_signature",
      message: "Payment webhook authentication failed.",
    },
  });
}


export function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}


export function json(
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
