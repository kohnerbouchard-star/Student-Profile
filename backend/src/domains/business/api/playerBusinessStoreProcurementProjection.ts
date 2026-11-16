import type {
  BusinessStoreQuoteDto,
  BusinessStoreReceiptDto,
} from "../contracts/playerBusinessContracts.ts";
import type { BusinessMoneyV1 } from "../contracts/businessTreasuryContracts.ts";
import {
  projectBusinessFundingQuote,
  projectBusinessFundingReceipt,
} from "./playerBusinessStoreFundingProjection.ts";
import {
  assertPublicBusinessStoreResult,
  firstResult,
  invalidBusinessStoreResult,
  nestedResult,
  readResultCode,
  readResultInteger,
  readResultMoney,
  readResultNumber,
  readResultPrecision,
  readResultPublicKey,
  readResultReplay,
  readResultStoreItemKey,
  readResultText,
  readResultTimestamp,
} from "./playerBusinessStoreProjectionSupport.ts";

const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;
const COUNTRY_CODE = /^[A-Z][A-Z0-9_]{2,31}$/u;
const BUSINESS_STORE_FUNDING_CONTEXT = "business.store-procurement";

export function toBusinessStoreQuote(
  row: Record<string, unknown>,
): BusinessStoreQuoteDto {
  assertPublicBusinessStoreResult(row);
  const quote = nestedResult(row, "quote") ?? row;
  const fundingQuoteValue = firstResult(
    quote,
    row,
    "fundingQuote",
    "funding_quote",
  );
  const quoteKey = readResultPublicKey(quote.quote_key, "quote_key", "bsq");
  const itemCurrencyCode = readResultCode(
    quote.item_currency_code,
    "item_currency_code",
    CURRENCY_CODE,
  );
  const settlementCurrencyCode = readResultCode(
    quote.settlement_currency_code,
    "settlement_currency_code",
    CURRENCY_CODE,
  );
  const itemPrecision = readResultPrecision(
    quote.item_minor_unit,
    "item_minor_unit",
  );
  const settlementPrecision = readResultPrecision(
    quote.settlement_minor_unit,
    "settlement_minor_unit",
  );
  const baseUnitPriceMoney = readResultMoney(
    quote.base_unit_amount,
    itemCurrencyCode,
    itemPrecision,
    "base_unit_amount",
    true,
  );
  const itemLocalFinalUnit = readResultMoney(
    quote.item_local_final_unit_amount,
    itemCurrencyCode,
    itemPrecision,
    "item_local_final_unit_amount",
    true,
  );
  const itemLocalFinalTotal = readResultMoney(
    quote.item_local_final_total_amount,
    itemCurrencyCode,
    itemPrecision,
    "item_local_final_total_amount",
    true,
  );
  const finalUnit = readResultMoney(
    quote.final_unit_amount,
    settlementCurrencyCode,
    settlementPrecision,
    "final_unit_amount",
    true,
  );
  const finalTotal = readResultMoney(
    quote.final_total_amount,
    settlementCurrencyCode,
    settlementPrecision,
    "final_total_amount",
    true,
  );
  const fundingTargetAccountKey = readResultPublicKey(
    firstResult(
      quote,
      row,
      "funding_target_account_key",
      "fundingTargetAccountKey",
    ),
    "funding_target_account_key",
    "bac",
  );
  const fundingQuoteKey = readResultPublicKey(
    firstResult(quote, row, "funding_quote_key", "fundingQuoteKey"),
    "funding_quote_key",
    "pfq",
  );
  const fundingQuote = projectBusinessFundingQuote(fundingQuoteValue);
  assertFundingCommercialBinding({
    commercialQuoteKey: quoteKey,
    commercialTotal: finalTotal,
    fundingQuoteKey,
    fundingContextKind: fundingQuote.fundingContextKind,
    fundingContextKey: fundingQuote.fundingContextKey,
    fundingTargetAmount: fundingQuote.targetAmount,
    projectedFundingQuoteKey: fundingQuote.quoteKey,
  });
  return {
    businessKey: readResultPublicKey(quote.business_key, "business_key", "biz"),
    quoteKey,
    itemKey: readResultStoreItemKey(quote.item_key, "item_key"),
    itemName: readResultText(quote.item_name, "item_name", 1, 200),
    quantity: readResultInteger(quote.quantity, "quantity", 1, 100_000),
    countryCode: readResultCode(
      quote.country_code,
      "country_code",
      COUNTRY_CODE,
    ),
    itemCurrencyCode,
    settlementCurrencyCode,
    baseUnitPrice: readResultNumber(quote.base_unit_price, "base_unit_price"),
    baseUnitPriceMoney,
    inflationMultiplier: readResultNumber(
      quote.inflation_multiplier,
      "inflation_multiplier",
    ),
    locationMultiplier: readResultNumber(
      quote.location_multiplier,
      "location_multiplier",
    ),
    scarcityMultiplier: readResultNumber(
      quote.scarcity_multiplier,
      "scarcity_multiplier",
    ),
    itemLocalFinalUnitPrice: readResultNumber(
      quote.item_local_final_unit_price,
      "item_local_final_unit_price",
    ),
    itemLocalFinalTotalPrice: readResultNumber(
      quote.item_local_final_total_price,
      "item_local_final_total_price",
    ),
    itemLocalFinalUnit,
    itemLocalFinalTotal,
    exchangeRate: readResultNumber(quote.exchange_rate, "exchange_rate"),
    finalUnitPrice: readResultNumber(
      quote.final_unit_price,
      "final_unit_price",
    ),
    finalTotalPrice: readResultNumber(
      quote.final_total_price,
      "final_total_price",
    ),
    finalUnit,
    finalTotal,
    pricingVersion: readResultText(
      quote.pricing_version,
      "pricing_version",
      1,
      120,
    ),
    expiresAt: readResultTimestamp(quote.expires_at, "expires_at"),
    replayed: readResultReplay(row, quote, "replayed"),
    fundingTargetAccountKey,
    fundingQuote,
  };
}

export function toBusinessStoreReceipt(
  row: Record<string, unknown>,
): BusinessStoreReceiptDto {
  assertPublicBusinessStoreResult(row);
  const receipt = nestedResult(row, "receipt") ?? row;
  const fundingReceiptValue = firstResult(
    receipt,
    row,
    "fundingReceipt",
    "funding_receipt",
  );
  const quoteKey = readResultPublicKey(receipt.quote_key, "quote_key", "bsq");
  const currencyCode = readResultCode(
    receipt.currency_code,
    "currency_code",
    CURRENCY_CODE,
  );
  const settlementPrecision = readResultPrecision(
    receipt.settlement_minor_unit,
    "settlement_minor_unit",
  );
  const finalUnit = readResultMoney(
    receipt.final_unit_amount,
    currencyCode,
    settlementPrecision,
    "final_unit_amount",
    true,
  );
  const finalTotal = readResultMoney(
    receipt.final_total_amount,
    currencyCode,
    settlementPrecision,
    "final_total_amount",
    true,
  );
  const warehouseAverageUnitCostPrecision = readResultPrecision(
    receipt.warehouse_average_unit_cost_minor_unit,
    "warehouse_average_unit_cost_minor_unit",
  );
  const warehouseAverageUnitCostMoney = readResultMoney(
    receipt.warehouse_average_unit_cost_amount,
    currencyCode,
    warehouseAverageUnitCostPrecision,
    "warehouse_average_unit_cost_amount",
    true,
  );
  const fundingQuoteKey = readResultPublicKey(
    firstResult(receipt, row, "funding_quote_key", "fundingQuoteKey"),
    "funding_quote_key",
    "pfq",
  );
  const fundingReceiptKey = readResultPublicKey(
    firstResult(receipt, row, "funding_receipt_key", "fundingReceiptKey"),
    "funding_receipt_key",
    "pfr",
  );
  const fundingTargetAccountKey = readResultPublicKey(
    firstResult(
      receipt,
      row,
      "funding_target_account_key",
      "fundingTargetAccountKey",
    ),
    "funding_target_account_key",
    "bac",
  );
  const fundingReceipt = projectBusinessFundingReceipt(fundingReceiptValue);
  assertFundingCommercialBinding({
    commercialQuoteKey: quoteKey,
    commercialTotal: finalTotal,
    fundingQuoteKey,
    fundingContextKind: fundingReceipt.fundingContextKind,
    fundingContextKey: fundingReceipt.fundingContextKey,
    fundingTargetAmount: fundingReceipt.targetAmount,
    projectedFundingQuoteKey: fundingReceipt.quoteKey,
    fundingReceiptKey,
    projectedFundingReceiptKey: fundingReceipt.receiptKey,
    fundingTargetAccountKey,
    projectedFundingTargetAccountKey: fundingReceipt.targetAccountKey,
    sourceDomain: fundingReceipt.sourceDomain,
    sourceAction: fundingReceipt.sourceAction,
  });
  return {
    businessKey: readResultPublicKey(
      receipt.business_key,
      "business_key",
      "biz",
    ),
    receiptKey: readResultPublicKey(receipt.receipt_key, "receipt_key", "bsr"),
    quoteKey,
    itemKey: readResultStoreItemKey(receipt.item_key, "item_key"),
    itemName: readResultText(receipt.item_name, "item_name", 1, 200),
    quantity: readResultInteger(receipt.quantity, "quantity", 1, 100_000),
    finalUnitPrice: readResultNumber(
      receipt.final_unit_price,
      "final_unit_price",
    ),
    finalTotalPrice: readResultNumber(
      receipt.final_total_price,
      "final_total_price",
    ),
    finalUnit,
    finalTotal,
    currencyCode,
    warehouseQuantityOwned: readResultNumber(
      receipt.warehouse_quantity_owned,
      "warehouse_quantity_owned",
    ),
    warehouseAverageUnitCost: readResultNumber(
      receipt.warehouse_average_unit_cost,
      "warehouse_average_unit_cost",
    ),
    warehouseAverageUnitCostMoney,
    completedAt: readResultTimestamp(receipt.completed_at, "completed_at"),
    alreadyCompleted: readResultReplay(row, receipt, "already_completed"),
    fundingReceipt,
  };
}

function assertFundingCommercialBinding(input: {
  readonly commercialQuoteKey: string;
  readonly commercialTotal: BusinessMoneyV1;
  readonly fundingQuoteKey: string;
  readonly fundingContextKind: string;
  readonly fundingContextKey: string;
  readonly fundingTargetAmount: BusinessMoneyV1;
  readonly projectedFundingQuoteKey: string;
  readonly fundingReceiptKey?: string;
  readonly projectedFundingReceiptKey?: string;
  readonly fundingTargetAccountKey?: string;
  readonly projectedFundingTargetAccountKey?: string;
  readonly sourceDomain?: string;
  readonly sourceAction?: string;
}): void {
  if (
    input.fundingContextKind !== BUSINESS_STORE_FUNDING_CONTEXT ||
    input.fundingContextKey !== input.commercialQuoteKey ||
    input.projectedFundingQuoteKey !== input.fundingQuoteKey ||
    !sameMoney(input.commercialTotal, input.fundingTargetAmount) ||
    input.fundingReceiptKey !== input.projectedFundingReceiptKey ||
    input.fundingTargetAccountKey !==
      input.projectedFundingTargetAccountKey ||
    (input.sourceDomain !== undefined && input.sourceDomain !== "business") ||
    (input.sourceAction !== undefined &&
      input.sourceAction !== "store-procurement")
  ) {
    throw invalidBusinessStoreResult("commercial funding binding");
  }
}

function sameMoney(left: BusinessMoneyV1, right: BusinessMoneyV1): boolean {
  return left.currencyCode === right.currencyCode &&
    left.precision === right.precision &&
    canonicalDecimal(left.amount) === canonicalDecimal(right.amount);
}

function canonicalDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
}
