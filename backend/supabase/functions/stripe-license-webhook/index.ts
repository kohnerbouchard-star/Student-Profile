import {
  concatBytes,
  constantTimeEqualHex,
  DEFAULT_STRIPE_API_VERSION,
  ECONOVARIA_FULFILLMENT_MARKER,
  ECONOVARIA_LICENSE_SKU,
  environmentValue,
  hmacSha256Hex,
  jsonResponse,
  parseStripeApiResponse,
  readBoundedBody,
  stripeMode,
  validStripeObjectId,
  validStripeSecretKey,
} from "../_shared/stripeLicense.ts";
import {
  readRuntimeConfiguration,
  parseStripeSignature,
  invalidStripeSignature,
  validateEventEnvelope,
  normalizeCheckoutSession,
  retrieveSingleLineItem,
  validatePaidLicenseCheckout,
  readResponseJson,
} from "./stripeCheckoutValidation.ts";
import {
  MAX_BODY_BYTES,
  STRIPE_SIGNATURE_HEADER,
  SIGNATURE_TOLERANCE_SECONDS,
  type StripeEventEnvelope,
  ACKNOWLEDGED_NON_PAYMENT_EVENT_TYPES,
  ALLOWED_PAYMENT_EVENT_TYPES,
  INTERNAL_TIMESTAMP_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "./stripeWebhookContracts.ts";


Deno.serve(handleStripeLicenseWebhookRequest);


export async function handleStripeLicenseWebhookRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST." },
    }, { Allow: "POST" });
  }

  const runtime = readRuntimeConfiguration();
  if (!runtime) {
    return jsonResponse(503, {
      ok: false,
      error: {
        code: "stripe_webhook_config_missing",
        message: "Stripe webhook configuration is incomplete.",
      },
    }, { "Retry-After": "60" });
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, {
      ok: false,
      error: { code: "request_too_large", message: "Webhook payload is too large." },
    });
  }

  const bodyRead = await readBoundedBody(request, MAX_BODY_BYTES);
  if (bodyRead.tooLarge) {
    return jsonResponse(413, {
      ok: false,
      error: { code: "request_too_large", message: "Webhook payload is too large." },
    });
  }
  if (!bodyRead.body) {
    return jsonResponse(400, {
      ok: false,
      error: { code: "invalid_request_body", message: "A webhook body is required." },
    });
  }

  const stripeSignature = parseStripeSignature(
    request.headers.get(STRIPE_SIGNATURE_HEADER),
  );
  if (!stripeSignature) return invalidStripeSignature();

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - stripeSignature.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return invalidStripeSignature();
  }

  const signedPayload = concatBytes(
    new TextEncoder().encode(`${stripeSignature.timestamp}.`),
    bodyRead.body,
  );
  const expectedSignature = await hmacSha256Hex(
    runtime.stripeWebhookSecret,
    signedPayload,
  );
  if (
    !stripeSignature.signatures.some((signature) =>
      constantTimeEqualHex(expectedSignature, signature)
    )
  ) {
    return invalidStripeSignature();
  }

  let event: StripeEventEnvelope;
  try {
    event = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bodyRead.body),
    ) as StripeEventEnvelope;
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: { code: "invalid_json", message: "Webhook body must be valid JSON." },
    });
  }

  const eventValidation = validateEventEnvelope(event, runtime.mode);
  if (!eventValidation.valid) {
    return jsonResponse(422, {
      ok: false,
      error: { code: "invalid_stripe_event", message: "Stripe event is invalid." },
    });
  }

  if (ACKNOWLEDGED_NON_PAYMENT_EVENT_TYPES.has(eventValidation.eventType)) {
    return jsonResponse(200, {
      ok: true,
      accepted: false,
      ignored: true,
      reason: "checkout_not_paid",
    });
  }
  if (!ALLOWED_PAYMENT_EVENT_TYPES.has(eventValidation.eventType)) {
    return jsonResponse(200, {
      ok: true,
      accepted: false,
      ignored: true,
      reason: "event_type_not_subscribed",
    });
  }

  const session = normalizeCheckoutSession(event.data?.object, runtime.mode);
  if (!session) {
    return jsonResponse(422, {
      ok: false,
      error: { code: "invalid_checkout_session", message: "Checkout Session is invalid." },
    });
  }

  if (
    session.metadata?.econovaria_fulfillment !== ECONOVARIA_FULFILLMENT_MARKER ||
    session.metadata?.econovaria_sku !== ECONOVARIA_LICENSE_SKU
  ) {
    return jsonResponse(200, {
      ok: true,
      accepted: false,
      ignored: true,
      reason: "not_econovaria_license_checkout",
    });
  }

  if (session.payment_status !== "paid") {
    return jsonResponse(200, {
      ok: true,
      accepted: false,
      ignored: true,
      reason: "payment_not_final",
    });
  }

  const lineItemResult = await retrieveSingleLineItem({
    stripeSecretKey: runtime.stripeSecretKey,
    stripeApiVersion: runtime.stripeApiVersion,
    sessionId: session.id,
  });
  if (!lineItemResult.ok) {
    console.error("stripe_license_line_items_failed", {
      eventId: eventValidation.eventId,
      stripeType: lineItemResult.errorType,
      stripeCode: lineItemResult.errorCode,
    });
    return jsonResponse(503, {
      ok: false,
      error: {
        code: "stripe_line_item_unavailable",
        message: "Stripe payment details could not be verified.",
      },
    }, { "Retry-After": "30" });
  }

  const paidLicense = validatePaidLicenseCheckout({
    session,
    lineItem: lineItemResult.lineItem,
    productId: runtime.productId,
    usdPriceId: runtime.usdPriceId,
    krwPriceId: runtime.krwPriceId,
  });
  if (!paidLicense) {
    console.error("stripe_license_checkout_mismatch", {
      eventId: eventValidation.eventId,
      sessionId: session.id,
    });
    return jsonResponse(503, {
      ok: false,
      error: {
        code: "stripe_license_configuration_mismatch",
        message: "Paid license configuration did not match the approved product.",
      },
    }, { "Retry-After": "60" });
  }

  const normalizedBody = JSON.stringify({
    schemaVersion: 1,
    eventType: "payment.succeeded",
    provider: "stripe",
    eventId: eventValidation.eventId,
    paymentId: paidLicense.paymentIntentId,
    providerPriceRef: paidLicense.priceId,
    customerEmail: paidLicense.customerEmail,
    amountMinor: paidLicense.amountMinor,
    currency: paidLicense.currency,
    occurredAt: new Date(eventValidation.created * 1000).toISOString(),
  });
  const normalizedBytes = new TextEncoder().encode(normalizedBody);
  const internalTimestamp = Math.floor(Date.now() / 1000);
  const internalSignature = await hmacSha256Hex(
    runtime.internalPaymentWebhookSecret,
    concatBytes(
      new TextEncoder().encode(`${internalTimestamp}.`),
      normalizedBytes,
    ),
  );

  let ingressResponse: Response;
  try {
    ingressResponse = await fetch(runtime.internalIngressUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [INTERNAL_TIMESTAMP_HEADER]: String(internalTimestamp),
        [INTERNAL_SIGNATURE_HEADER]: `v1=${internalSignature}`,
      },
      body: normalizedBytes,
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return jsonResponse(503, {
      ok: false,
      error: {
        code: "license_payment_ingress_unavailable",
        message: "License fulfillment could not be durably accepted.",
      },
    }, { "Retry-After": "30" });
  }

  const ingressBody = await readResponseJson(ingressResponse, 64 * 1024);
  if (ingressResponse.status !== 202 || ingressBody?.accepted !== true) {
    console.error("stripe_license_ingress_rejected", {
      eventId: eventValidation.eventId,
      status: ingressResponse.status,
      ingressCode: String(
        (ingressBody?.error as Record<string, unknown> | undefined)?.code || "",
      ),
    });
    const retryable = ingressResponse.status === 409 ||
      ingressResponse.status === 429 ||
      ingressResponse.status >= 500;
    return jsonResponse(retryable ? 503 : 502, {
      ok: false,
      error: {
        code: "license_payment_ingress_rejected",
        message: "License fulfillment could not be durably accepted.",
      },
    }, retryable ? { "Retry-After": "30" } : {});
  }

  return jsonResponse(200, {
    ok: true,
    accepted: true,
    duplicate: ingressBody.duplicate === true,
    paymentEventId: String(ingressBody.paymentEventId || ""),
    jobId: String(ingressBody.jobId || ""),
  });
}
