import {
  BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
  BUSINESS_TREASURY_FIXING_KEY_PATTERN,
  BUSINESS_TREASURY_ORDER_KEY_PATTERN,
  BUSINESS_TREASURY_QUOTE_KEY_PATTERN,
  BUSINESS_TREASURY_RECEIPT_KEY_PATTERN,
  BUSINESS_TREASURY_TRANSACTION_KEY_PATTERN,
  type BusinessMoneyV1,
  type BusinessTreasuryFxOrderV1,
  type BusinessTreasuryFxProductV1,
  type BusinessTreasuryFxQuoteV1,
  type BusinessTreasuryFxReceiptV1,
} from "../contracts/businessTreasuryContracts.ts";
import {
  booleanValue,
  type BusinessTreasuryRow,
  currency,
  decimal,
  first,
  invalidTreasuryResult,
  iso,
  minorUnit,
  money,
  product,
  publicKey,
  text,
  token,
} from "./businessTreasuryProjectionSupport.ts";

export function projectTreasuryQuote(
  row: BusinessTreasuryRow,
): BusinessTreasuryFxQuoteV1 {
  const sourceCurrencyCode = currency(
    first(row, "source_currency_code", "sourceCurrencyCode"),
    "quote source currency",
  );
  const targetCurrencyCode = currency(
    first(row, "target_currency_code", "targetCurrencyCode"),
    "quote target currency",
  );
  const sourcePrecision = minorUnit(
    first(row, "source_minor_unit", "sourceMinorUnit"),
    "quote source precision",
  );
  const targetPrecision = minorUnit(
    first(row, "target_minor_unit", "targetMinorUnit"),
    "quote target precision",
  );
  const result: BusinessTreasuryFxQuoteV1 = Object.freeze({
    quoteKey: publicKey(
      first(row, "quote_key", "quoteKey", "public_key", "publicKey"),
      BUSINESS_TREASURY_QUOTE_KEY_PATTERN,
      "quote key",
    ),
    product: product(first(row, "product", "order_type", "orderType")),
    sourceAccountKey: publicKey(
      first(row, "source_account_key", "sourceAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "quote source account key",
    ),
    targetAccountKey: publicKey(
      first(row, "target_account_key", "targetAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "quote target account key",
    ),
    sourceAmount: money(
      first(row, "source_amount", "sourceAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "quote source amount",
      true,
    ),
    referenceRate: decimal(
      first(row, "reference_rate", "referenceRate"),
      "quote reference rate",
      true,
    ),
    customerRate: decimal(
      first(row, "customer_rate", "customerRate"),
      "quote customer rate",
      true,
    ),
    spreadRate: decimal(
      first(row, "spread_rate", "spreadRate"),
      "quote spread rate",
    ),
    feeRate: decimal(first(row, "fee_rate", "feeRate"), "quote fee rate"),
    feeAmount: money(
      first(row, "fee_amount", "feeAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "quote fee amount",
    ),
    targetAmount: money(
      first(row, "target_amount", "targetAmount"),
      targetCurrencyCode,
      targetPrecision,
      "quote target amount",
      true,
    ),
    fixingKey: publicKey(
      first(row, "fixing_key", "fixingKey"),
      BUSINESS_TREASURY_FIXING_KEY_PATTERN,
      "quote fixing key",
    ),
    policyVersion: token(
      first(row, "policy_version", "policyVersion"),
      "quote policy version",
      120,
    ),
    expiresAt: iso(first(row, "expires_at", "expiresAt"), "quote expiry"),
    settlesAt: iso(
      first(row, "settles_at", "settlesAt"),
      "quote settlement time",
    ),
    requiresFx: booleanValue(
      first(row, "requires_fx", "requiresFx"),
      "quote FX requirement",
    ),
    roundingDisclosure: text(
      first(row, "rounding_disclosure", "roundingDisclosure"),
      "quote rounding disclosure",
      500,
    ),
  });
  assertFxPolicyEvidence(result, "quote");
  if (!result.requiresFx) invalidTreasuryResult("quote FX requirement");
  return result;
}

export function projectTreasuryOrder(
  row: BusinessTreasuryRow,
): BusinessTreasuryFxOrderV1 {
  const sourceCurrencyCode = currency(
    first(row, "source_currency_code", "sourceCurrencyCode"),
    "order source currency",
  );
  const targetCurrencyCode = currency(
    first(row, "target_currency_code", "targetCurrencyCode"),
    "order target currency",
  );
  const sourcePrecision = minorUnit(
    first(row, "source_minor_unit", "sourceMinorUnit"),
    "order source precision",
  );
  const targetPrecision = minorUnit(
    first(row, "target_minor_unit", "targetMinorUnit"),
    "order target precision",
  );
  const completedAt = first(row, "completed_at", "completedAt");
  const receiptKey = first(row, "receipt_key", "receiptKey");
  const result: BusinessTreasuryFxOrderV1 = Object.freeze({
    orderKey: publicKey(
      first(row, "order_key", "orderKey", "public_key", "publicKey"),
      BUSINESS_TREASURY_ORDER_KEY_PATTERN,
      "order key",
    ),
    quoteKey: publicKey(
      first(row, "quote_key", "quoteKey"),
      BUSINESS_TREASURY_QUOTE_KEY_PATTERN,
      "order quote key",
    ),
    product: product(first(row, "product", "order_type", "orderType")),
    status: token(first(row, "status"), "order status", 40),
    sourceAccountKey: publicKey(
      first(row, "source_account_key", "sourceAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "order source account key",
    ),
    targetAccountKey: publicKey(
      first(row, "target_account_key", "targetAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "order target account key",
    ),
    sourceAmount: money(
      first(row, "source_amount", "sourceAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "order source amount",
      true,
    ),
    feeAmount: money(
      first(row, "fee_amount", "feeAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "order fee amount",
    ),
    targetAmount: money(
      first(row, "target_amount", "targetAmount"),
      targetCurrencyCode,
      targetPrecision,
      "order target amount",
      true,
    ),
    referenceRate: decimal(
      first(row, "reference_rate", "referenceRate"),
      "order reference rate",
      true,
    ),
    customerRate: decimal(
      first(row, "customer_rate", "customerRate"),
      "order customer rate",
      true,
    ),
    spreadRate: decimal(
      first(row, "spread_rate", "spreadRate"),
      "order spread rate",
    ),
    feeRate: decimal(first(row, "fee_rate", "feeRate"), "order fee rate"),
    fixingKey: publicKey(
      first(row, "fixing_key", "fixingKey"),
      BUSINESS_TREASURY_FIXING_KEY_PATTERN,
      "order fixing key",
    ),
    submittedAt: iso(
      first(row, "submitted_at", "submittedAt", "created_at", "createdAt"),
      "order submission time",
    ),
    settlesAt: iso(
      first(row, "settles_at", "settlesAt"),
      "order settlement time",
    ),
    completedAt: completedAt === null || completedAt === undefined ||
        completedAt === ""
      ? null
      : iso(completedAt, "order completion time"),
    receiptKey: receiptKey === null || receiptKey === undefined ||
        receiptKey === ""
      ? null
      : publicKey(
        receiptKey,
        BUSINESS_TREASURY_RECEIPT_KEY_PATTERN,
        "order receipt key",
      ),
  });
  assertFxPolicyEvidence(result, "order");
  return result;
}

export function projectTreasuryReceipt(
  row: BusinessTreasuryRow,
): BusinessTreasuryFxReceiptV1 {
  const sourceCurrencyCode = currency(
    first(row, "source_currency_code", "sourceCurrencyCode"),
    "receipt source currency",
  );
  const targetCurrencyCode = currency(
    first(row, "target_currency_code", "targetCurrencyCode"),
    "receipt target currency",
  );
  const sourcePrecision = minorUnit(
    first(row, "source_minor_unit", "sourceMinorUnit"),
    "receipt source precision",
  );
  const targetPrecision = minorUnit(
    first(row, "target_minor_unit", "targetMinorUnit"),
    "receipt target precision",
  );
  const result: BusinessTreasuryFxReceiptV1 = Object.freeze({
    receiptKey: publicKey(
      first(row, "receipt_key", "receiptKey", "public_key", "publicKey"),
      BUSINESS_TREASURY_RECEIPT_KEY_PATTERN,
      "receipt key",
    ),
    orderKey: publicKey(
      first(row, "order_key", "orderKey"),
      BUSINESS_TREASURY_ORDER_KEY_PATTERN,
      "receipt order key",
    ),
    quoteKey: publicKey(
      first(row, "quote_key", "quoteKey"),
      BUSINESS_TREASURY_QUOTE_KEY_PATTERN,
      "receipt quote key",
    ),
    bankTransactionKey: publicKey(
      first(row, "bank_transaction_key", "bankTransactionKey"),
      BUSINESS_TREASURY_TRANSACTION_KEY_PATTERN,
      "receipt bank transaction key",
    ),
    product: product(first(row, "product", "order_type", "orderType")),
    sourceAccountKey: publicKey(
      first(row, "source_account_key", "sourceAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "receipt source account key",
    ),
    targetAccountKey: publicKey(
      first(row, "target_account_key", "targetAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "receipt target account key",
    ),
    sourceAmount: money(
      first(row, "source_amount", "sourceAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "receipt source amount",
      true,
    ),
    feeAmount: money(
      first(row, "fee_amount", "feeAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "receipt fee amount",
    ),
    targetAmount: money(
      first(row, "target_amount", "targetAmount"),
      targetCurrencyCode,
      targetPrecision,
      "receipt target amount",
      true,
    ),
    referenceRate: decimal(
      first(row, "reference_rate", "referenceRate"),
      "receipt reference rate",
      true,
    ),
    customerRate: decimal(
      first(row, "customer_rate", "customerRate"),
      "receipt customer rate",
      true,
    ),
    spreadRate: decimal(
      first(row, "spread_rate", "spreadRate"),
      "receipt spread rate",
    ),
    feeRate: decimal(first(row, "fee_rate", "feeRate"), "receipt fee rate"),
    reserveDrawAmount: money(
      first(row, "reserve_draw_amount", "reserveDrawAmount"),
      targetCurrencyCode,
      targetPrecision,
      "receipt reserve draw amount",
    ),
    reserveRepaymentAmount: money(
      first(row, "reserve_repayment_amount", "reserveRepaymentAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "receipt reserve repayment amount",
    ),
    fixingKey: publicKey(
      first(row, "fixing_key", "fixingKey"),
      BUSINESS_TREASURY_FIXING_KEY_PATTERN,
      "receipt fixing key",
    ),
    completedAt: iso(
      first(row, "completed_at", "completedAt", "created_at", "createdAt"),
      "receipt completion time",
    ),
  });
  assertFxPolicyEvidence(result, "receipt");
  return result;
}

function assertFxPolicyEvidence(
  value: {
    readonly product: BusinessTreasuryFxProductV1;
    readonly sourceAccountKey: string;
    readonly targetAccountKey: string;
    readonly sourceAmount: BusinessMoneyV1;
    readonly targetAmount: BusinessMoneyV1;
    readonly feeAmount: BusinessMoneyV1;
    readonly spreadRate: string;
    readonly feeRate: string;
  },
  label: string,
): void {
  const expectedFeeRate = value.product === "instant" ? "0.02" : "0";
  const feeIsZero = decimalEquivalent(value.feeAmount.amount, "0");
  if (
    value.sourceAccountKey === value.targetAccountKey ||
    value.sourceAmount.currencyCode === value.targetAmount.currencyCode ||
    !decimalEquivalent(value.spreadRate, "0.005") ||
    !decimalEquivalent(value.feeRate, expectedFeeRate) ||
    (value.product === "standard" && !feeIsZero)
  ) invalidTreasuryResult(`${label} FX policy evidence`);
}

function decimalEquivalent(left: string, right: string): boolean {
  return normalizeDecimal(left) === normalizeDecimal(right);
}

function normalizeDecimal(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
}
