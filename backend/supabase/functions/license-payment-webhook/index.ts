import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const MAX_BODY_BYTES = 16 * 1024;
const SIGNATURE_WINDOW_SECONDS = 5 * 60;
const PAYMENT_TIMESTAMP_HEADER =
  "x-econovaria-payment-timestamp";
const PAYMENT_SIGNATURE_HEADER =
  "x-econovaria-payment-signature";
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/iu;
const IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$/u;
const PROVIDER_PATTERN =
  /^[a-z0-9][a-z0-9._-]{1,63}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const ALLOWED_KEYS = new Set([
  "schemaVersion",
  "eventType",
  "provider",
  "eventId",
  "paymentId",
  "providerPriceRef",
  "customerEmail",
  "amountMinor",
  "currency",
  "occurredAt",
]);

interface PaidLicenseEvent {
  readonly schemaVersion: 1;
  readonly eventType: "payment.succeeded";
  readonly provider: string;
  readonly eventId: string;
  readonly paymentId: string;
  readonly providerPriceRef: string;
  readonly customerEmail: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly occurredAt: string;
}

Deno.serve(handleLicensePaymentWebhookRequest);

export async function handleLicensePaymentWebhookRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST." },
    }, { Allow: "POST" });
  }

  const contentType = String(
    request.headers.get("content-type") || "",
  )
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return json(415, {
      ok: false,
      error: {
        code: "unsupported_media_type",
        message: "Use application/json.",
      },
    });
  }

  const declaredLength = Number(
    request.headers.get("content-length") || "0",
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BODY_BYTES
  ) {
    return json(413, {
      ok: false,
      error: {
        code: "request_too_large",
        message: "The webhook payload is too large.",
      },
    });
  }

  const webhookSecret = environmentValue(
    "ECONOVARIA_PAYMENT_WEBHOOK_SECRET",
  );
  const supabaseUrl = environmentValue("SUPABASE_URL");
  const serviceRoleKey = environmentValue(
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (
    webhookSecret.length < 32 ||
    webhookSecret.length > 4096 ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return json(503, {
      ok: false,
      error: {
        code: "payment_webhook_config_missing",
        message: "Payment webhook configuration is incomplete.",
      },
    }, { "Retry-After": "60" });
  }

  const timestamp = parseSignatureTimestamp(
    request.headers.get(PAYMENT_TIMESTAMP_HEADER),
  );
  const signatureMatch = String(
    request.headers.get(PAYMENT_SIGNATURE_HEADER) || "",
  ).trim().match(SIGNATURE_PATTERN);
  if (
    timestamp === null ||
    !signatureMatch ||
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) >
      SIGNATURE_WINDOW_SECONDS
  ) {
    return unauthorized();
  }

  const bodyRead = await readBoundedBody(request, MAX_BODY_BYTES);
  if (bodyRead.tooLarge) {
    return json(413, {
      ok: false,
      error: {
        code: "request_too_large",
        message: "The webhook payload is too large.",
      },
    });
  }
  const rawBody = bodyRead.body;
  if (!rawBody) {
    return json(400, {
      ok: false,
      error: {
        code: "invalid_request_body",
        message: "A non-empty JSON body is required.",
      },
    });
  }

  const signedPayload = concatBytes(
    new TextEncoder().encode(`${timestamp}.`),
    rawBody,
  );
  const expectedSignature = await hmacSha256Hex(
    webhookSecret,
    signedPayload,
  );
  if (
    !constantTimeEqualHex(
      expectedSignature,
      signatureMatch[1].toLowerCase(),
    )
  ) {
    return unauthorized();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    return json(400, {
      ok: false,
      error: {
        code: "invalid_json",
        message: "The webhook body must be valid UTF-8 JSON.",
      },
    });
  }

  const event = normalizePaidLicenseEvent(decoded);
  if (!event) {
    return json(422, {
      ok: false,
      error: {
        code: "invalid_payment_event",
        message: "The successful-payment event is invalid.",
      },
    });
  }

  const payloadSha256 = await sha256Hex(rawBody);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        "x-client-info": "econovaria-license-payment-webhook-v1",
      },
    },
  });
  const enqueue = await client.rpc("enqueue_paid_license_v1", {
    p_provider: event.provider,
    p_provider_event_id: event.eventId,
    p_provider_payment_id: event.paymentId,
    p_provider_price_ref: event.providerPriceRef,
    p_recipient_email: event.customerEmail,
    p_amount_minor: event.amountMinor,
    p_currency: event.currency,
    p_occurred_at: event.occurredAt,
    p_payload_sha256: payloadSha256,
  });

  if (enqueue.error) {
    return mapEnqueueError(enqueue.error);
  }

  const result = enqueue.data as Record<string, unknown> | null;
  const accepted = result?.accepted === true;
  const jobId = String(result?.jobId || "").trim();
  const paymentEventId = String(
    result?.paymentEventId || "",
  ).trim();
  if (
    !accepted ||
    !jobId ||
    !paymentEventId
  ) {
    return json(500, {
      ok: false,
      error: {
        code: "payment_enqueue_invalid_response",
        message: "The payment event could not be durably accepted.",
      },
    });
  }

  return json(202, {
    ok: true,
    accepted: true,
    duplicate: result?.duplicate === true,
    paymentEventId,
    jobId,
    jobStatus: String(result?.jobStatus || "pending"),
  });
}

function normalizePaidLicenseEvent(
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

function mapEnqueueError(error: {
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

async function readBoundedBody(
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

function parseSignatureTimestamp(
  value: string | null,
): number | null {
  const normalized = String(value || "").trim();
  if (!/^\d{10}$/u.test(normalized)) return null;
  const timestamp = Number(normalized);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

async function hmacSha256Hex(
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

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(value),
  ));
  return bytesToHex(digest);
}

function constantTimeEqualHex(
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

function concatBytes(
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

function unauthorized(): Response {
  return json(401, {
    ok: false,
    error: {
      code: "invalid_payment_signature",
      message: "Payment webhook authentication failed.",
    },
  });
}

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function json(
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
