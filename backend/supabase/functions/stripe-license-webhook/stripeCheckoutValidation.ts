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
  type StripeEventEnvelope,
  type StripeCheckoutSession,
  type StripeLineItem,
  type StripeLineItemList,
  MAX_LINE_ITEM_RESPONSE_BYTES,
  EMAIL_PATTERN,
} from "./stripeWebhookContracts.ts";


export function readRuntimeConfiguration(): {
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


export function validInternalIngressUrl(value: string, supabaseUrl: string): boolean {
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


export function parseStripeSignature(value: string | null): {
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


export function validateEventEnvelope(
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


export function normalizeCheckoutSession(
  value: unknown,
  mode: "test" | "live",
): (StripeCheckoutSession & { readonly id: string }) | null {
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


export async function retrieveSingleLineItem(input: {
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


export function validatePaidLicenseCheckout(input: {
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


export async function readResponseJson(
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


export function invalidStripeSignature(): Response {
  return jsonResponse(401, {
    ok: false,
    error: {
      code: "invalid_stripe_signature",
      message: "Stripe webhook authentication failed.",
    },
  });
}
