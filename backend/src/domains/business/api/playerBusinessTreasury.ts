import {
  BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
  BUSINESS_TREASURY_IDEMPOTENCY_KEY_PATTERN,
  BUSINESS_TREASURY_QUOTE_KEY_PATTERN,
  BusinessTreasuryError,
  type BusinessTreasuryFxProductV1,
} from "../contracts/businessTreasuryContracts.ts";

const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;

export function parseBusinessTreasuryAccountOpenBody(
  body: Record<string, unknown>,
): { readonly currencyCode: string; readonly idempotencyKey: string } {
  exactKeys(body, ["currencyCode", "idempotencyKey"]);
  return {
    currencyCode: currency(body.currencyCode, "currencyCode"),
    idempotencyKey: idempotency(body.idempotencyKey),
  };
}

export function parseBusinessTreasuryQuoteBody(
  body: Record<string, unknown>,
): {
  readonly sourceAccountKey: string;
  readonly targetAccountKey: string | null;
  readonly targetCurrencyCode: string;
  readonly sourceAmount: string;
  readonly product: BusinessTreasuryFxProductV1;
  readonly idempotencyKey: string;
} {
  exactKeys(body, [
    "sourceAccountKey",
    "targetCurrencyCode",
    "sourceAmount",
    "product",
    "idempotencyKey",
  ], ["targetAccountKey"]);
  const sourceAccountKey = accountKey(
    body.sourceAccountKey,
    "sourceAccountKey",
  );
  const targetAccountKey = body.targetAccountKey === undefined ||
      body.targetAccountKey === null || body.targetAccountKey === ""
    ? null
    : accountKey(body.targetAccountKey, "targetAccountKey");
  if (targetAccountKey === sourceAccountKey) {
    throw invalid("sourceAccountKey and targetAccountKey must be different.");
  }
  const product = typeof body.product === "string"
    ? body.product.trim().toLowerCase()
    : "";
  if (product !== "standard" && product !== "instant") {
    throw invalid("product must be standard or instant.");
  }
  return {
    sourceAccountKey,
    targetAccountKey,
    targetCurrencyCode: currency(
      body.targetCurrencyCode,
      "targetCurrencyCode",
    ),
    sourceAmount: decimalAmount(body.sourceAmount),
    product,
    idempotencyKey: idempotency(body.idempotencyKey),
  };
}

export function parseBusinessTreasuryConsumeBody(
  body: Record<string, unknown>,
): { readonly quoteKey: string; readonly idempotencyKey: string } {
  exactKeys(body, ["quoteKey", "idempotencyKey"]);
  const quoteKey = typeof body.quoteKey === "string"
    ? body.quoteKey.trim().toLowerCase()
    : "";
  if (!BUSINESS_TREASURY_QUOTE_KEY_PATTERN.test(quoteKey)) {
    throw invalid("quoteKey is invalid.");
  }
  return { quoteKey, idempotencyKey: idempotency(body.idempotencyKey) };
}

export function parseBusinessTreasuryCancelBody(
  body: Record<string, unknown>,
): { readonly idempotencyKey: string } {
  exactKeys(body, ["idempotencyKey"]);
  return { idempotencyKey: idempotency(body.idempotencyKey) };
}

function exactKeys(
  body: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const actual = Object.keys(body);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((field) => !Object.hasOwn(body, field)) ||
    actual.some((field) => !allowed.has(field))
  ) {
    throw invalid(
      "Business treasury request contains missing or unexpected fields.",
    );
  }
}

function accountKey(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN.test(result)) {
    throw invalid(`${field} is invalid.`);
  }
  return result;
}

function currency(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!CURRENCY_CODE.test(result)) throw invalid(`${field} is invalid.`);
  return result;
}

function decimalAmount(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(result)) {
    throw invalid(
      "sourceAmount must be a positive base-10 amount with at most 18 decimal places.",
    );
  }
  const [whole = "", fraction = ""] = result.split(".");
  const canonicalFraction = fraction.replace(/0+$/u, "");
  if (whole === "0" && canonicalFraction.length === 0) {
    throw invalid("sourceAmount is outside the supported range.");
  }
  return canonicalFraction ? `${whole}.${canonicalFraction}` : whole;
}

function idempotency(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!BUSINESS_TREASURY_IDEMPOTENCY_KEY_PATTERN.test(result)) {
    throw invalid("idempotencyKey is invalid.");
  }
  return result;
}

function invalid(message: string): BusinessTreasuryError {
  return new BusinessTreasuryError(
    "invalid_business_treasury_request",
    message,
    400,
  );
}
