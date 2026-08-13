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

const MAX_BODY_BYTES = 256 * 1024;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const MAX_LINE_ITEM_RESPONSE_BYTES = 256 * 1024;
const STRIPE_SIGNATURE_HEADER = "stripe-signature";
const INTERNAL_TIMESTAMP_HEADER = "x-econovaria-payment-timestamp";
const INTERNAL_SIGNATURE_HEADER = "x-econovaria-payment-signature";
const ALLOWED_PAYMENT_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);
const ACKNOWLEDGED_NON_PAYMENT_EVENT_TYPES = new Set([
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

interface StripeEventEnvelope {
  readonly id?: string;
  readonly object?: string;
  readonly type?: string;
  readonly created?: number;
  readonly livemode?: boolean;
  readonly data?: { readonly object?: unknown };
}

interface StripeCheckoutSession {
  readonly id?: string;
  readonly object?: string;
  readonly livemode?: boolean;
  readonly mode?: string;
  readonly payment_status?: string;
  readonly payment_intent?: string | { readonly id?: string } | null;
  readonly amount_subtotal?: number | null;
  readonly currency?: string | null;
  readonly customer_email?: string | null;
  readonly customer_details?: { readonly email?: string | null } | null;
  readonly metadata?: Record<string, string> | null;
}

interface StripePrice {
  readonly id?: string;
  readonly object?: string;
  readonly active?: boolean;
  readonly currency?: string;
  readonly unit_amount?: number | null;
  readonly product?: string | { readonly id?: string } | null;
}

interface StripeLineItem {
  readonly id?: string;
  readonly object?: string;
  readonly quantity?: number | null;
  readonly amount_subtotal?: number;
  readonly currency?: string;
  readonly price?: StripePrice | string | null;
}

interface StripeLineItemList {
  readonly object?: string;
  readonly data?: StripeLineItem[];
  readonly has_more?: boolean;
}

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

function readRuntimeConfiguration(): {
  readonly mode: "test" | "live";
  readonly stripeSecretKey: string;
  readonly stripeWebhookSecret: string;
  readonly stripeApiVersion: string;
  readonly productId: string;
  readonly usdPriceId: string;
  readonly krwPriceId: string;
  readonly internalPaymentWebhookSecret: string;
  readonly internalIngressUrl: string;
} | null {
  const mode = stripeMode();
  const stripeSecretKey = environmentValue("STRIPE_SECRET_KEY");
  const stripeWebhookSecret = environmentValue("STRIPE_LICENSE_WEBHOOK_SECRET");
  const stripeApiVersion = environmentValue("STRIPE_API_VERSION") ||
    DEFAULT_STRIPE_API_VERSION;
  const productId = environmentValue("STRIPE_ECONOVARIA_PRODUCT_ID");
  const usdPriceId = environmentValue("STRIPE_ECONOVARIA_ANNUAL_USD_PRICE_ID");
  const krwPriceId = environmentValue("STRIPE_ECONOVARIA_ANNUAL_KRW_PRICE_ID");
  const internalPaymentWebhookSecret = environmentValue(
    "ECONOVARIA_PAYMENT_WEBHOOK_SECRET",
  );
  const supabaseUrl = environmentValue("SUPABASE_URL");
  const configuredIngressUrl = environmentValue(
    "ECONOVARIA_LICENSE_PAYMENT_INGRESS_URL",
  );
  const internalIngressUrl = configuredIngressUrl ||
    `${supabaseUrl}/functions/v1/license-payment-webhook`;

  if (
    !mode ||
    !validStripeSecretKey(stripeSecretKey, mode) ||
    !stripeWebhookSecret.startsWith("whsec_") ||
    stripeWebhookSecret.length < 24 ||
    stripeWebhookSecret.length > 4096 ||
    !/^\d{4}-\d{2}-\d{2}\.[a-z]+$/u.test(stripeApiVersion) ||
    !validStripeObjectId(productId, "prod") ||
    !validStripeObjectId(usdPriceId, "price") ||
    !validStripeObjectId(krwPriceId, "price") ||
    usdPriceId === krwPriceId ||
    internalPaymentWebhookSecret.length < 32 ||
    internalPaymentWebhookSecret.length > 4096 ||
    !validInternalIngressUrl(internalIngressUrl, supabaseUrl)
  ) {
    return null;
  }

  return {
    mode,
    stripeSecretKey,
    stripeWebhookSecret,
    stripeApiVersion,
    productId,
    usdPriceId,
    krwPriceId,
    internalPaymentWebhookSecret,
    internalIngressUrl,
  };
}

function validInternalIngressUrl(value: string, supabaseUrl: string): boolean {
  try {
    const url = new URL(value);
    const expected = new URL(supabaseUrl);
    return url.protocol === "https:" &&
      url.origin === expected.origin &&
      url.pathname === "/functions/v1/license-payment-webhook" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}

function parseStripeSignature(value: string | null): {
  readonly timestamp: number;
  readonly signatures: readonly string[];
} | null {
  const parts = String(value || "").split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, rawValue] = part.trim().split("=", 2);
    if (key === "t" && /^\d{10}$/u.test(rawValue || "")) {
      const parsed = Number(rawValue);
      if (Number.isSafeInteger(parsed)) timestamp = parsed;
    }
    if (key === "v1" && /^[0-9a-f]{64}$/iu.test(rawValue || "")) {
      signatures.push(String(rawValue).toLowerCase());
    }
  }
  return timestamp !== null && signatures.length > 0
    ? { timestamp, signatures }
    : null;
}

function validateEventEnvelope(
  event: StripeEventEnvelope,
  mode: "test" | "live",
):
  | { readonly valid: true; readonly eventId: string; readonly eventType: string; readonly created: number }
  | { readonly valid: false } {
  const eventId = String(event?.id || "");
  const eventType = String(event?.type || "");
  const created = Number(event?.created);
  if (
    event?.object !== "event" ||
    !validStripeObjectId(eventId, "evt") ||
    !eventType ||
    !Number.isSafeInteger(created) ||
    created <= 0 ||
    event?.livemode !== (mode === "live") ||
    !event.data ||
    typeof event.data !== "object"
  ) {
    return { valid: false };
  }
  return { valid: true, eventId, eventType, created };
}

function normalizeCheckoutSession(
  value: unknown,
  mode: "test" | "live",
): StripeCheckoutSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session = value as StripeCheckoutSession;
  const id = String(session.id || "");
  if (
    session.object !== "checkout.session" ||
    !validStripeObjectId(id, "cs") ||
    session.livemode !== (mode === "live") ||
    session.mode !== "payment" ||
    !session.metadata ||
    typeof session.metadata !== "object"
  ) {
    return null;
  }
  return { ...session, id };
}

async function retrieveSingleLineItem(input: {
  readonly stripeSecretKey: string;
  readonly stripeApiVersion: string;
  readonly sessionId: string;
}): Promise<
  | { readonly ok: true; readonly lineItem: StripeLineItem }
  | { readonly ok: false; readonly errorType: string; readonly errorCode: string }
> {
  const url = new URL(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(input.sessionId)}/line_items`,
  );
  url.searchParams.set("limit", "2");
  url.searchParams.append("expand[]", "data.price");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.stripeSecretKey}`,
        "Stripe-Version": input.stripeApiVersion,
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, errorType: "network_error", errorCode: "" };
  }

  const parsed = await parseStripeApiResponse<StripeLineItemList>(
    response,
    MAX_LINE_ITEM_RESPONSE_BYTES,
  );
  if (parsed.error || !parsed.data) {
    return {
      ok: false,
      errorType: parsed.error?.type || "stripe_error",
      errorCode: parsed.error?.code || "",
    };
  }
  if (
    parsed.data.object !== "list" ||
    parsed.data.has_more === true ||
    !Array.isArray(parsed.data.data) ||
    parsed.data.data.length !== 1
  ) {
    return { ok: false, errorType: "invalid_response", errorCode: "line_item_count" };
  }
  return { ok: true, lineItem: parsed.data.data[0] };
}

function validatePaidLicenseCheckout(input: {
  readonly session: StripeCheckoutSession & { readonly id: string };
  readonly lineItem: StripeLineItem;
  readonly productId: string;
  readonly usdPriceId: string;
  readonly krwPriceId: string;
}): {
  readonly paymentIntentId: string;
  readonly priceId: string;
  readonly customerEmail: string;
  readonly amountMinor: number;
  readonly currency: string;
} | null {
  const price = input.lineItem.price;
  if (!price || typeof price !== "object") return null;
  const priceId = String(price.id || "");
  const allowedPriceIds = new Set([input.usdPriceId, input.krwPriceId]);
  const productId = typeof price.product === "string"
    ? price.product
    : String(price.product?.id || "");
  const paymentIntentId = typeof input.session.payment_intent === "string"
    ? input.session.payment_intent
    : String(input.session.payment_intent?.id || "");
  const customerEmail = String(
    input.session.customer_details?.email || input.session.customer_email || "",
  ).trim().toLowerCase();
  const currency = String(input.session.currency || "").trim().toUpperCase();
  const priceCurrency = String(price.currency || "").trim().toUpperCase();
  const amountMinor = Number(input.session.amount_subtotal);
  const unitAmount = Number(price.unit_amount);
  const lineSubtotal = Number(input.lineItem.amount_subtotal);

  if (
    !allowedPriceIds.has(priceId) ||
    !validStripeObjectId(priceId, "price") ||
    productId !== input.productId ||
    input.session.metadata?.econovaria_product_id !== input.productId ||
    !validStripeObjectId(productId, "prod") ||
    !validStripeObjectId(paymentIntentId, "pi") ||
    !EMAIL_PATTERN.test(customerEmail) ||
    customerEmail.length > 320 ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    !Number.isSafeInteger(unitAmount) ||
    unitAmount <= 0 ||
    !Number.isSafeInteger(lineSubtotal) ||
    lineSubtotal !== unitAmount ||
    amountMinor !== unitAmount ||
    input.lineItem.quantity !== 1 ||
    !/^[A-Z]{3}$/u.test(currency) ||
    priceCurrency !== currency ||
    (priceId === input.usdPriceId && currency !== "USD") ||
    (priceId === input.usdPriceId &&
      input.session.metadata?.econovaria_market !== "usd") ||
    (priceId === input.krwPriceId && currency !== "KRW") ||
    (priceId === input.krwPriceId &&
      input.session.metadata?.econovaria_market !== "krw")
  ) {
    return null;
  }

  return { paymentIntentId, priceId, customerEmail, amountMinor, currency };
}

async function readResponseJson(
  response: Response,
  maxBytes: number,
): Promise<Record<string, unknown> | null> {
  try {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > maxBytes) return null;
    const decoded = JSON.parse(new TextDecoder().decode(body));
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function invalidStripeSignature(): Response {
  return jsonResponse(401, {
    ok: false,
    error: {
      code: "invalid_stripe_signature",
      message: "Stripe webhook authentication failed.",
    },
  });
}
