import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  allowedOriginsFromEnvironment,
  DEFAULT_STRIPE_API_VERSION,
  ECONOVARIA_FULFILLMENT_MARKER,
  ECONOVARIA_LICENSE_SKU,
  environmentValue,
  jsonResponse,
  parseStripeApiResponse,
  readBoundedBody,
  requestIp,
  sha256Hex,
  stripeMode,
  validCheckoutReturnUrl,
  validStripeObjectId,
  validStripeSecretKey,
} from "../_shared/stripeLicense.ts";

const MAX_BODY_BYTES = 4 * 1024;
const CHECKOUT_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const ALLOWED_BODY_KEYS = new Set(["market"]);
const MARKET_CONFIG = {
  usd: {
    currency: "USD",
    priceEnvironmentName: "STRIPE_ECONOVARIA_ANNUAL_USD_PRICE_ID",
  },
  krw: {
    currency: "KRW",
    priceEnvironmentName: "STRIPE_ECONOVARIA_ANNUAL_KRW_PRICE_ID",
  },
} as const;

type CheckoutMarket = keyof typeof MARKET_CONFIG;

interface StripeCheckoutSession {
  readonly id?: string;
  readonly object?: string;
  readonly url?: string | null;
  readonly livemode?: boolean;
  readonly mode?: string;
  readonly status?: string;
}

Deno.serve(handleStripeCheckoutSessionRequest);

export async function handleStripeCheckoutSessionRequest(
  request: Request,
): Promise<Response> {
  const origin = String(request.headers.get("origin") || "").trim();
  const allowedOrigins = allowedOriginsFromEnvironment();
  const corsHeaders = corsHeadersForOrigin(origin, allowedOrigins);

  if (request.method === "OPTIONS") {
    if (!origin || !allowedOrigins.has(origin)) {
      return jsonResponse(403, {
        ok: false,
        error: { code: "origin_not_allowed", message: "Origin not allowed." },
      });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST." },
    }, { ...corsHeaders, Allow: "POST, OPTIONS" });
  }

  if (!origin || !allowedOrigins.has(origin)) {
    return jsonResponse(403, {
      ok: false,
      error: { code: "origin_not_allowed", message: "Origin not allowed." },
    });
  }

  const contentType = String(request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(415, {
      ok: false,
      error: { code: "unsupported_media_type", message: "Use application/json." },
    }, corsHeaders);
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, {
      ok: false,
      error: { code: "request_too_large", message: "Request is too large." },
    }, corsHeaders);
  }

  const runtime = readRuntimeConfiguration();
  if (!runtime) {
    return jsonResponse(503, {
      ok: false,
      error: {
        code: "stripe_checkout_config_missing",
        message: "Checkout is not configured.",
      },
    }, { ...corsHeaders, "Retry-After": "60" });
  }

  const bodyRead = await readBoundedBody(request, MAX_BODY_BYTES);
  if (bodyRead.tooLarge) {
    return jsonResponse(413, {
      ok: false,
      error: { code: "request_too_large", message: "Request is too large." },
    }, corsHeaders);
  }
  if (!bodyRead.body) {
    return jsonResponse(400, {
      ok: false,
      error: { code: "invalid_request_body", message: "A JSON body is required." },
    }, corsHeaders);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bodyRead.body),
    );
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: { code: "invalid_json", message: "Request body must be valid JSON." },
    }, corsHeaders);
  }

  const market = normalizeMarket(decoded);
  if (!market) {
    return jsonResponse(422, {
      ok: false,
      error: {
        code: "invalid_checkout_market",
        message: "Select either the USD or KRW checkout market.",
      },
    }, corsHeaders);
  }

  const rateLimit = await consumeCheckoutRateLimit({
    request,
    market,
    origin,
    supabaseUrl: runtime.supabaseUrl,
    serviceRoleKey: runtime.serviceRoleKey,
    rateLimitSecret: runtime.rateLimitSecret,
  });
  if (!rateLimit.allowed) {
    return jsonResponse(rateLimit.unavailable ? 503 : 429, {
      ok: false,
      error: {
        code: rateLimit.unavailable
          ? "checkout_rate_limit_unavailable"
          : "checkout_rate_limited",
        message: rateLimit.unavailable
          ? "Checkout is temporarily unavailable."
          : "Too many checkout attempts. Try again later.",
      },
    }, {
      ...corsHeaders,
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  const marketDefinition = MARKET_CONFIG[market];
  const priceId = environmentValue(marketDefinition.priceEnvironmentName);
  if (!validStripeObjectId(priceId, "price")) {
    return jsonResponse(503, {
      ok: false,
      error: {
        code: "stripe_price_not_configured",
        message: "The selected checkout market is not configured.",
      },
    }, { ...corsHeaders, "Retry-After": "60" });
  }

  const checkout = await createStripeCheckoutSession({
    stripeSecretKey: runtime.stripeSecretKey,
    stripeApiVersion: runtime.stripeApiVersion,
    stripeMode: runtime.stripeMode,
    productId: runtime.productId,
    priceId,
    market,
    successUrl: runtime.successUrl,
    cancelUrl: runtime.cancelUrl,
    automaticTaxEnabled: runtime.automaticTaxEnabled,
  });

  if (!checkout.ok) {
    console.error("stripe_checkout_session_create_failed", {
      stripeType: checkout.error.type || "stripe_error",
      stripeCode: checkout.error.code || "",
    });
    return jsonResponse(checkout.retryable ? 503 : 502, {
      ok: false,
      error: {
        code: "stripe_checkout_session_failed",
        message: "A secure checkout session could not be created.",
      },
    }, {
      ...corsHeaders,
      ...(checkout.retryable ? { "Retry-After": "30" } : {}),
    });
  }

  return jsonResponse(201, {
    ok: true,
    sessionId: checkout.session.id,
    checkoutUrl: checkout.session.url,
    market,
    currency: marketDefinition.currency,
  }, corsHeaders);
}

function normalizeMarket(input: unknown): CheckoutMarket | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_BODY_KEYS.has(key))) return null;
  const market = String(record.market || "").trim().toLowerCase();
  return market === "usd" || market === "krw" ? market : null;
}

function readRuntimeConfiguration(): {
  readonly stripeSecretKey: string;
  readonly stripeApiVersion: string;
  readonly stripeMode: "test" | "live";
  readonly productId: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly automaticTaxEnabled: boolean;
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly rateLimitSecret: string;
} | null {
  const mode = stripeMode();
  const stripeSecretKey = environmentValue("STRIPE_SECRET_KEY");
  const stripeApiVersion = environmentValue("STRIPE_API_VERSION") ||
    DEFAULT_STRIPE_API_VERSION;
  const productId = environmentValue("STRIPE_ECONOVARIA_PRODUCT_ID");
  const successUrl = environmentValue("ECONOVARIA_CHECKOUT_SUCCESS_URL");
  const cancelUrl = environmentValue("ECONOVARIA_CHECKOUT_CANCEL_URL");
  const supabaseUrl = environmentValue("SUPABASE_URL");
  const serviceRoleKey = environmentValue("SUPABASE_SERVICE_ROLE_KEY");
  const rateLimitSecret = environmentValue(
    "ECONOVARIA_CHECKOUT_RATE_LIMIT_SECRET",
  );
  const automaticTaxValue = environmentValue(
    "STRIPE_AUTOMATIC_TAX_ENABLED",
  ).toLowerCase();

  if (
    !mode ||
    !validStripeSecretKey(stripeSecretKey, mode) ||
    !/^\d{4}-\d{2}-\d{2}\.[a-z]+$/u.test(stripeApiVersion) ||
    !validStripeObjectId(productId, "prod") ||
    !validCheckoutReturnUrl(successUrl, true) ||
    !validCheckoutReturnUrl(cancelUrl, false) ||
    !/^https:\/\/[a-z0-9-]{20}[.]supabase[.]co$/u.test(supabaseUrl) ||
    !serviceRoleKey ||
    rateLimitSecret.length < 32 ||
    rateLimitSecret.length > 4096 ||
    !["", "true", "false"].includes(automaticTaxValue)
  ) {
    return null;
  }

  return {
    stripeSecretKey,
    stripeApiVersion,
    stripeMode: mode,
    productId,
    successUrl,
    cancelUrl,
    automaticTaxEnabled: automaticTaxValue === "true",
    supabaseUrl,
    serviceRoleKey,
    rateLimitSecret,
  };
}

async function consumeCheckoutRateLimit(input: {
  readonly request: Request;
  readonly market: CheckoutMarket;
  readonly origin: string;
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly rateLimitSecret: string;
}): Promise<{
  readonly allowed: boolean;
  readonly unavailable: boolean;
  readonly retryAfterSeconds: number;
}> {
  const ip = requestIp(input.request);
  const ipHash = await sha256Hex(
    `${input.rateLimitSecret}\u0000stripe-checkout-ip\u0000${ip}`,
  );
  const actionHash = await sha256Hex(
    `${input.rateLimitSecret}\u0000stripe-checkout-action\u0000${ip}\u0000${input.origin}\u0000${input.market}`,
  );
  const client = createClient(input.supabaseUrl, input.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "econovaria-stripe-checkout-v1" } },
  });
  const result = await client.rpc("consume_pre_auth_request_rate_limits_v1", {
    p_buckets: [
      {
        dimension: "action",
        keyHash: actionHash,
        limit: 12,
        windowSeconds: 600,
        blockSeconds: 900,
      },
      {
        dimension: "ip",
        keyHash: ipHash,
        limit: 30,
        windowSeconds: 600,
        blockSeconds: 900,
      },
    ],
  });
  if (result.error) {
    console.error("stripe_checkout_rate_limit_failed", {
      databaseCode: String(result.error.code || ""),
    });
    return { allowed: false, unavailable: true, retryAfterSeconds: 30 };
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") {
    return { allowed: false, unavailable: true, retryAfterSeconds: 30 };
  }
  const record = row as Record<string, unknown>;
  return {
    allowed: record.allowed === true,
    unavailable: false,
    retryAfterSeconds: Math.max(1, Number(record.retry_after_seconds || 1)),
  };
}

async function createStripeCheckoutSession(input: {
  readonly stripeSecretKey: string;
  readonly stripeApiVersion: string;
  readonly stripeMode: "test" | "live";
  readonly productId: string;
  readonly priceId: string;
  readonly market: CheckoutMarket;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly automaticTaxEnabled: boolean;
}): Promise<
  | { readonly ok: true; readonly session: Required<Pick<StripeCheckoutSession, "id" | "url">> }
  | { readonly ok: false; readonly error: { readonly type?: string; readonly code?: string }; readonly retryable: boolean }
> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", input.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("customer_creation", "always");
  form.set("billing_address_collection", "auto");
  form.set("locale", "auto");
  form.set("submit_type", "pay");
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("automatic_tax[enabled]", String(input.automaticTaxEnabled));
  form.set("metadata[econovaria_fulfillment]", ECONOVARIA_FULFILLMENT_MARKER);
  form.set("metadata[econovaria_sku]", ECONOVARIA_LICENSE_SKU);
  form.set("metadata[econovaria_market]", input.market);
  form.set("metadata[econovaria_product_id]", input.productId);
  form.set(
    "payment_intent_data[metadata][econovaria_fulfillment]",
    ECONOVARIA_FULFILLMENT_MARKER,
  );
  form.set(
    "payment_intent_data[metadata][econovaria_sku]",
    ECONOVARIA_LICENSE_SKU,
  );
  form.set("payment_intent_data[metadata][econovaria_price_id]", input.priceId);

  let response: Response;
  try {
    response = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `econovaria-checkout-${crypto.randomUUID()}`,
        "Stripe-Version": input.stripeApiVersion,
      },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, error: { type: "network_error" }, retryable: true };
  }

  const parsed = await parseStripeApiResponse<StripeCheckoutSession>(response);
  if (parsed.error || !parsed.data) {
    const retryable = response.status === 409 || response.status === 429 ||
      response.status >= 500;
    return { ok: false, error: parsed.error || {}, retryable };
  }

  const session = parsed.data;
  const expectedLiveMode = input.stripeMode === "live";
  if (
    session.object !== "checkout.session" ||
    !validStripeObjectId(String(session.id || ""), "cs") ||
    typeof session.url !== "string" ||
    !session.url.startsWith("https://checkout.stripe.com/") ||
    session.mode !== "payment" ||
    session.livemode !== expectedLiveMode
  ) {
    return {
      ok: false,
      error: { type: "invalid_response", code: "unexpected_checkout_session" },
      retryable: false,
    };
  }
  return { ok: true, session: { id: session.id!, url: session.url } };
}

function corsHeadersForOrigin(
  origin: string,
  allowedOrigins: ReadonlySet<string>,
): Record<string, string> {
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
