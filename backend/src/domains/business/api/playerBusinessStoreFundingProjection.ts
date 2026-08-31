import {
  BUSINESS_FUNDING_QUOTE_KEY_PATTERN,
  BUSINESS_FUNDING_RECEIPT_KEY_PATTERN,
  BUSINESS_FUNDING_TRANSACTION_KEY_PATTERN,
  BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
  BUSINESS_TREASURY_FIXING_KEY_PATTERN,
  type BusinessFundingQuoteLineV1,
  type BusinessFundingQuoteV1,
  type BusinessFundingReceiptLineV1,
  type BusinessFundingReceiptV1,
} from "../contracts/businessTreasuryContracts.ts";
import {
  assertFundingLines,
  fundingBoolean,
  fundingCurrency,
  fundingFirst,
  fundingInteger,
  fundingMoney,
  fundingPrecision,
  fundingPublicKey,
  fundingRow,
  fundingRows,
  fundingText,
  fundingTimestamp,
  fundingToken,
} from "./playerBusinessStoreFundingProjectionSupport.ts";
import {
  assertPublicBusinessStoreResult,
  readResultDecimal,
} from "./playerBusinessStoreProjectionSupport.ts";

export function projectBusinessFundingQuote(
  value: unknown,
): BusinessFundingQuoteV1 {
  assertPublicBusinessStoreResult(value);
  const row = fundingRow(value, "Business funding quote");
  const targetCurrencyCode = fundingCurrency(
    fundingFirst(row, "target_currency_code", "targetCurrencyCode"),
    "funding target currency",
  );
  const targetPrecision = fundingPrecision(
    fundingFirst(row, "target_minor_unit", "targetMinorUnit"),
    "funding target precision",
  );
  const lines = fundingRows(
    fundingFirst(row, "lines"),
    "Business funding quote lines",
  ).map(projectBusinessFundingQuoteLine);
  const targetAmount = fundingMoney(
    fundingFirst(row, "target_amount", "targetAmount"),
    targetCurrencyCode,
    targetPrecision,
    "funding target amount",
    true,
  );
  assertFundingLines(lines, targetAmount);
  return Object.freeze({
    quoteKey: fundingPublicKey(
      fundingFirst(row, "quote_key", "quoteKey"),
      BUSINESS_FUNDING_QUOTE_KEY_PATTERN,
      "funding quote key",
    ),
    fundingContextKind: fundingToken(
      fundingFirst(row, "funding_context_kind", "fundingContextKind"),
      "funding context kind",
    ),
    fundingContextKey: fundingPublicKey(
      fundingFirst(row, "funding_context_key", "fundingContextKey"),
      /^bsq_[0-9a-f]{32}$/u,
      "funding context key",
    ),
    targetAmount,
    fixingKey: fundingPublicKey(
      fundingFirst(row, "fixing_key", "fixingKey"),
      BUSINESS_TREASURY_FIXING_KEY_PATTERN,
      "funding fixing key",
    ),
    policyVersion: fundingToken(
      fundingFirst(row, "policy_version", "policyVersion"),
      "funding policy version",
    ),
    requiresFx: fundingBoolean(
      fundingFirst(row, "requires_fx", "requiresFx"),
      "funding FX requirement",
    ),
    expiresAt: fundingTimestamp(
      fundingFirst(row, "expires_at", "expiresAt"),
      "funding quote expiry",
    ),
    lines: Object.freeze(lines),
  });
}

function projectBusinessFundingQuoteLine(
  value: Record<string, unknown>,
): BusinessFundingQuoteLineV1 {
  const sourceCurrencyCode = fundingCurrency(
    fundingFirst(value, "source_currency_code", "sourceCurrencyCode"),
    "funding source currency",
  );
  const sourcePrecision = fundingPrecision(
    fundingFirst(value, "source_minor_unit", "sourceMinorUnit"),
    "funding source precision",
  );
  const targetCurrencyCode = fundingCurrency(
    fundingFirst(value, "target_currency_code", "targetCurrencyCode"),
    "funding target currency",
  );
  const targetPrecision = fundingPrecision(
    fundingFirst(value, "target_minor_unit", "targetMinorUnit"),
    "funding target precision",
  );
  return Object.freeze({
    lineNumber: fundingInteger(
      fundingFirst(value, "line_number", "lineNumber"),
      "funding line number",
      1,
      3,
    ),
    sourceAccountKey: fundingPublicKey(
      fundingFirst(value, "source_account_key", "sourceAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "funding source account key",
    ),
    sourceCurrencyCode,
    sourcePrecision,
    targetCurrencyCode,
    targetPrecision,
    posted: fundingMoney(
      fundingFirst(value, "posted_amount", "postedAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "funding posted amount",
    ),
    held: fundingMoney(
      fundingFirst(value, "held_amount", "heldAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "funding held amount",
    ),
    available: fundingMoney(
      fundingFirst(value, "available_amount", "availableAmount"),
      sourceCurrencyCode,
      sourcePrecision,
      "funding available amount",
    ),
    targetContribution: fundingMoney(
      fundingFirst(value, "target_contribution", "targetContribution"),
      targetCurrencyCode,
      targetPrecision,
      "funding target contribution",
      true,
    ),
    sourceDebit: fundingMoney(
      fundingFirst(value, "source_debit", "sourceDebit"),
      sourceCurrencyCode,
      sourcePrecision,
      "funding source debit",
      true,
    ),
    referenceRate: readResultDecimal(
      fundingFirst(value, "reference_rate", "referenceRate"),
      "funding reference rate",
      true,
    ),
    customerRate: readResultDecimal(
      fundingFirst(value, "customer_rate", "customerRate"),
      "funding customer rate",
      true,
    ),
    effectiveRate: readResultDecimal(
      fundingFirst(value, "effective_rate", "effectiveRate"),
      "funding effective rate",
      true,
    ),
    spreadRate: readResultDecimal(
      fundingFirst(value, "spread_rate", "spreadRate"),
      "funding spread rate",
    ),
    requiresFx: fundingBoolean(
      fundingFirst(value, "requires_fx", "requiresFx"),
      "funding line FX requirement",
    ),
    roundingDisclosure: fundingText(
      fundingFirst(value, "rounding_disclosure", "roundingDisclosure"),
      "funding rounding disclosure",
      500,
    ),
  });
}

export function projectBusinessFundingReceipt(
  value: unknown,
): BusinessFundingReceiptV1 {
  assertPublicBusinessStoreResult(value);
  const row = fundingRow(value, "Business funding receipt");
  const targetCurrencyCode = fundingCurrency(
    fundingFirst(row, "target_currency_code", "targetCurrencyCode"),
    "funding target currency",
  );
  const targetPrecision = fundingPrecision(
    fundingFirst(row, "target_minor_unit", "targetMinorUnit"),
    "funding target precision",
  );
  const lines = fundingRows(
    fundingFirst(row, "lines"),
    "Business funding receipt lines",
  ).map(projectBusinessFundingReceiptLine);
  const targetAmount = fundingMoney(
    fundingFirst(row, "target_amount", "targetAmount"),
    targetCurrencyCode,
    targetPrecision,
    "funding target amount",
    true,
  );
  assertFundingLines(lines, targetAmount);
  return Object.freeze({
    receiptKey: fundingPublicKey(
      fundingFirst(row, "receipt_key", "receiptKey"),
      BUSINESS_FUNDING_RECEIPT_KEY_PATTERN,
      "funding receipt key",
    ),
    quoteKey: fundingPublicKey(
      fundingFirst(row, "quote_key", "quoteKey"),
      BUSINESS_FUNDING_QUOTE_KEY_PATTERN,
      "funding quote key",
    ),
    bankTransactionKey: fundingPublicKey(
      fundingFirst(row, "bank_transaction_key", "bankTransactionKey"),
      BUSINESS_FUNDING_TRANSACTION_KEY_PATTERN,
      "funding transaction key",
    ),
    targetAccountKey: fundingPublicKey(
      fundingFirst(row, "target_account_key", "targetAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "funding target account key",
    ),
    fundingContextKind: fundingToken(
      fundingFirst(row, "funding_context_kind", "fundingContextKind"),
      "funding context kind",
    ),
    fundingContextKey: fundingPublicKey(
      fundingFirst(row, "funding_context_key", "fundingContextKey"),
      /^bsq_[0-9a-f]{32}$/u,
      "funding context key",
    ),
    targetAmount,
    targetReserveDrawAmount: fundingMoney(
      fundingFirst(
        row,
        "target_reserve_draw_amount",
        "targetReserveDrawAmount",
      ),
      targetCurrencyCode,
      targetPrecision,
      "funding target reserve draw amount",
    ),
    sourceDomain: fundingToken(
      fundingFirst(row, "source_domain", "sourceDomain"),
      "funding source domain",
    ),
    sourceAction: fundingToken(
      fundingFirst(row, "source_action", "sourceAction"),
      "funding source action",
    ),
    createdAt: fundingTimestamp(
      fundingFirst(row, "created_at", "createdAt"),
      "funding receipt creation time",
    ),
    lines: Object.freeze(lines),
  });
}

function projectBusinessFundingReceiptLine(
  value: Record<string, unknown>,
): BusinessFundingReceiptLineV1 {
  const sourceCurrencyCode = fundingCurrency(
    fundingFirst(value, "source_currency_code", "sourceCurrencyCode"),
    "funding source currency",
  );
  const sourcePrecision = fundingPrecision(
    fundingFirst(value, "source_minor_unit", "sourceMinorUnit"),
    "funding source precision",
  );
  const targetCurrencyCode = fundingCurrency(
    fundingFirst(value, "target_currency_code", "targetCurrencyCode"),
    "funding target currency",
  );
  const targetPrecision = fundingPrecision(
    fundingFirst(value, "target_minor_unit", "targetMinorUnit"),
    "funding target precision",
  );
  return Object.freeze({
    lineNumber: fundingInteger(
      fundingFirst(value, "line_number", "lineNumber"),
      "funding line number",
      1,
      3,
    ),
    sourceAccountKey: fundingPublicKey(
      fundingFirst(value, "source_account_key", "sourceAccountKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "funding source account key",
    ),
    sourceCurrencyCode,
    sourcePrecision,
    targetCurrencyCode,
    targetPrecision,
    targetContribution: fundingMoney(
      fundingFirst(value, "target_contribution", "targetContribution"),
      targetCurrencyCode,
      targetPrecision,
      "funding target contribution",
      true,
    ),
    sourceDebit: fundingMoney(
      fundingFirst(value, "source_debit", "sourceDebit"),
      sourceCurrencyCode,
      sourcePrecision,
      "funding source debit",
      true,
    ),
    referenceRate: readResultDecimal(
      fundingFirst(value, "reference_rate", "referenceRate"),
      "funding reference rate",
      true,
    ),
    customerRate: readResultDecimal(
      fundingFirst(value, "customer_rate", "customerRate"),
      "funding customer rate",
      true,
    ),
    effectiveRate: readResultDecimal(
      fundingFirst(value, "effective_rate", "effectiveRate"),
      "funding effective rate",
      true,
    ),
    spreadRate: readResultDecimal(
      fundingFirst(value, "spread_rate", "spreadRate"),
      "funding spread rate",
    ),
    requiresFx: fundingBoolean(
      fundingFirst(value, "requires_fx", "requiresFx"),
      "funding line FX requirement",
    ),
  });
}
