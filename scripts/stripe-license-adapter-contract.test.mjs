import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  constantTimeEqualHex,
  DEFAULT_STRIPE_API_VERSION,
  ECONOVARIA_FULFILLMENT_MARKER,
  ECONOVARIA_LICENSE_SKU,
  hmacSha256Hex,
  normalizeOrigin,
  validCheckoutReturnUrl,
  validStripeObjectId,
} from "../backend/supabase/functions/_shared/stripeLicense.ts";

const SHARED_HELPER = new URL(
  "../backend/supabase/functions/_shared/stripeLicense.ts",
  import.meta.url,
);
const CHECKOUT_FUNCTION = new URL(
  "../backend/supabase/functions/stripe-checkout-session/index.ts",
  import.meta.url,
);
const WEBHOOK_FUNCTION = new URL(
  "../backend/supabase/functions/stripe-license-webhook/index.ts",
  import.meta.url,
);
const EDGE_MANIFEST = new URL(
  "../backend/supabase/edge-function-manifest.json",
  import.meta.url,
);
const STAGING_WORKFLOW = new URL(
  "../.github/workflows/license-issuance-queue-staging.yml",
  import.meta.url,
);
const RUNBOOK = new URL(
  "../docs/architecture/stripe-license-adapter-v1.md",
  import.meta.url,
);

test("Stripe adapter helpers pin identifiers, origins, and signatures", async () => {
  assert.equal(DEFAULT_STRIPE_API_VERSION, "2026-02-25.clover");
  assert.equal(ECONOVARIA_LICENSE_SKU, "econovaria-classroom-annual");
  assert.equal(ECONOVARIA_FULFILLMENT_MARKER, "license-v1");
  assert.equal(validStripeObjectId("price_1T2ahXLAfpHwsEEip8tC88PD", "price"), true);
  assert.equal(validStripeObjectId("prod_V3vDHJztuOUmIe", "prod"), true);
  assert.equal(validStripeObjectId("https://evil.example", "price"), false);
  assert.equal(normalizeOrigin("https://econovaria.example"), "https://econovaria.example");
  assert.equal(normalizeOrigin("https://econovaria.example/path"), null);
  assert.equal(normalizeOrigin("http://econovaria.example"), null);
  assert.equal(
    validCheckoutReturnUrl(
      "https://econovaria.example/payment/success?session_id={CHECKOUT_SESSION_ID}",
      true,
    ),
    true,
  );
  assert.equal(
    validCheckoutReturnUrl("https://econovaria.example/payment/success", true),
    false,
  );

  const signature = await hmacSha256Hex(
    "s".repeat(64),
    new TextEncoder().encode("1700000000.{}"),
  );
  assert.match(signature, /^[0-9a-f]{64}$/u);
  assert.equal(constantTimeEqualHex(signature, signature), true);
  assert.equal(constantTimeEqualHex(signature, `${signature.slice(0, -1)}0`), false);
});

test("Checkout selects immutable server-owned USD or KRW prices", async () => {
  const source = await readFile(CHECKOUT_FUNCTION, "utf8");
  const sharedSource = await readFile(SHARED_HELPER, "utf8");
  assert.ok(sharedSource.includes("ECONOVARIA_PUBLIC_APP_ORIGINS"));
  for (const required of [
    "STRIPE_ECONOVARIA_ANNUAL_USD_PRICE_ID",
    "STRIPE_ECONOVARIA_ANNUAL_KRW_PRICE_ID",
    "STRIPE_ECONOVARIA_PRODUCT_ID",
    "ECONOVARIA_CHECKOUT_SUCCESS_URL",
    "ECONOVARIA_CHECKOUT_CANCEL_URL",
    "ECONOVARIA_CHECKOUT_RATE_LIMIT_SECRET",
    "consume_pre_auth_request_rate_limits_v1",
    "line_items[0][price]",
    "line_items[0][quantity]",
    "Idempotency-Key",
    "automatic_tax[enabled]",
    "econovaria_fulfillment",
    "checkout.stripe.com",
  ]) {
    assert.ok(source.includes(required), required);
  }
  assert.match(source, /const ALLOWED_BODY_KEYS = new Set\(\["market"\]\)/u);
  assert.match(source, /market === "usd" \|\| market === "krw"/u);
  assert.doesNotMatch(source, /record\.(?:priceId|amount|currency|duration|sku)/u);
  assert.doesNotMatch(source, /unit_amount/u);
  assert.doesNotMatch(source, /sk_(?:test|live)_[A-Za-z0-9]+/u);
  assert.doesNotMatch(source, /console\.(?:log|debug)\(/u);
});

test("Stripe webhook verifies the raw body before paid-session fulfillment", async () => {
  const source = await readFile(WEBHOOK_FUNCTION, "utf8");
  for (const required of [
    "stripe-signature",
    "STRIPE_LICENSE_WEBHOOK_SECRET",
    "SIGNATURE_TOLERANCE_SECONDS",
    "readBoundedBody",
    "hmacSha256Hex",
    "constantTimeEqualHex",
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "payment_status !== \"paid\"",
    "/line_items",
    "expand[]",
    "amount_subtotal",
    "unit_amount",
    "customer_details?.email",
    "x-econovaria-payment-timestamp",
    "x-econovaria-payment-signature",
    "payment.succeeded",
    "provider: \"stripe\"",
    "ECONOVARIA_PAYMENT_WEBHOOK_SECRET",
    "license-payment-webhook",
  ]) {
    assert.ok(source.includes(required), required);
  }
  const readIndex = source.indexOf("readBoundedBody(request");
  const parseIndex = source.indexOf("JSON.parse(");
  assert.ok(readIndex >= 0 && parseIndex > readIndex);
  assert.match(source, /input\.lineItem\.quantity !== 1/u);
  assert.match(source, /amountMinor !== unitAmount/u);
  assert.match(source, /priceCurrency !== currency/u);
  assert.match(source, /productId !== input\.productId/u);
  assert.match(source, /usdPriceId[\s\S]+krwPriceId/u);
  assert.doesNotMatch(source, /console\.(?:log|debug)\(/u);
  assert.doesNotMatch(source, /console\.error\([^)]*customerEmail/u);
  assert.doesNotMatch(source, /sk_(?:test|live)_[A-Za-z0-9]+/u);
});

test("Staging inventory and release workflow include Stripe functions without production deployment", async () => {
  const manifest = JSON.parse(await readFile(EDGE_MANIFEST, "utf8"));
  const temporary = new Map(
    manifest.temporaryStagingFunctions.map((entry) => [entry.slug, entry.verifyJwt]),
  );
  assert.equal(temporary.get("stripe-checkout-session"), false);
  assert.equal(temporary.get("stripe-license-webhook"), false);

  const workflow = await readFile(STAGING_WORKFLOW, "utf8");
  assert.match(workflow, /backend\/supabase\/functions\/stripe-\*\/\*\*/u);
  assert.match(workflow, /scripts\/stripe-license-adapter-contract\.test\.mjs/u);
  assert.match(workflow, /stripe-checkout-session/u);
  assert.match(workflow, /stripe-license-webhook/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /DEPLOY LICENSE ISSUANCE TO STAGING/u);
  assert.doesNotMatch(
    workflow,
    /environment:\s+production[\s\S]+supabase functions deploy/iu,
  );
});

test("Runbook preserves sandbox/live separation and the production hold", async () => {
  const source = await readFile(RUNBOOK, "utf8");
  for (const required of [
    "prod_V3vDHJztuOUmIe",
    "price_1T2ahXLAfpHwsEEip8tC88PD",
    "price_1U3oCjHbcOdT4fPk4pk6WgiR",
    "commercial_price_approved: false",
    "United States company",
    "Korean customer presentment: KRW",
    "verified Stripe webhook only",
    "refund, cancellation, dispute, and chargeback",
    "Sandbox and live IDs and secrets must never be mixed",
  ]) {
    assert.ok(source.includes(required), required);
  }
});
