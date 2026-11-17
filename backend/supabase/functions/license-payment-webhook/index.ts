import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  json,
  environmentValue,
  parseSignatureTimestamp,
  unauthorized,
  readBoundedBody,
  concatBytes,
  hmacSha256Hex,
  constantTimeEqualHex,
  normalizePaidLicenseEvent,
  sha256Hex,
  mapEnqueueError,
} from "./paymentWebhookValidation.ts";
import {
  MAX_BODY_BYTES,
  PAYMENT_TIMESTAMP_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  SIGNATURE_PATTERN,
  SIGNATURE_WINDOW_SECONDS,
} from "./paymentWebhookContracts.ts";


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
