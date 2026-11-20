import { playerSafeErrorMessage } from "../../api/errors.js";
import {
  assertTransportNumber,
  assertPublic,
  boolean,
  countryCode,
  currencyCode,
  decimal,
  decimalPlaces,
  decimalsEqual,
  exactFields,
  finiteQuantity,
  fundingToken,
  integer,
  invalid,
  list,
  money,
  object,
  operationBody,
  precision,
  publicKey,
  scaledInteger,
  storeItemKey,
  text,
  timestamp,
} from "./business-treasury-validation.js";

function fundingLineBindings(line, endpointKey, { balances = false } = {}) {
  const moneyFields = [line.targetContribution, line.sourceDebit];
  if (balances) moneyFields.push(line.posted, line.held, line.available);
  const sameCurrency = line.sourceCurrencyCode === line.targetCurrencyCode;
  if (
    sameCurrency === line.requiresFx ||
    line.sourceDebit.currencyCode !== line.sourceCurrencyCode ||
    line.sourceDebit.precision !== line.sourcePrecision ||
    line.targetContribution.currencyCode !== line.targetCurrencyCode ||
    line.targetContribution.precision !== line.targetPrecision ||
    moneyFields.some((entry) => decimalPlaces(entry.amount) > entry.precision) ||
    !/[1-9]/u.test(line.targetContribution.amount) ||
    !/[1-9]/u.test(line.sourceDebit.amount)
  ) invalid(endpointKey, "fundingLine.binding");
  if (balances) {
    if (
      [line.posted, line.held, line.available].some((entry) =>
        entry.currencyCode !== line.sourceCurrencyCode ||
        entry.precision !== line.sourcePrecision
      ) ||
      scaledInteger(line.posted.amount, line.sourcePrecision) !==
        scaledInteger(line.held.amount, line.sourcePrecision) +
        scaledInteger(line.available.amount, line.sourcePrecision)
    ) invalid(endpointKey, "fundingLine.balance");
  }
  if (line.requiresFx) {
    if (!decimalsEqual(line.spreadRate, "0.01")) {
      invalid(endpointKey, "fundingLine.spreadRate");
    }
  } else if (
    !decimalsEqual(line.spreadRate, "0") ||
    !decimalsEqual(line.referenceRate, "1") ||
    !decimalsEqual(line.customerRate, "1") ||
    !decimalsEqual(line.effectiveRate, "1") ||
    !decimalsEqual(line.sourceDebit.amount, line.targetContribution.amount)
  ) invalid(endpointKey, "fundingLine.sameCurrency");
}

function fundingQuoteLine(value, endpointKey) {
  const row = object(value, endpointKey, "fundingQuote.line");
  exactFields(row, [
    "lineNumber", "sourceAccountKey", "sourceCurrencyCode", "sourcePrecision",
    "targetCurrencyCode", "targetPrecision", "posted", "held", "available",
    "targetContribution", "sourceDebit", "referenceRate", "customerRate",
    "effectiveRate", "spreadRate", "requiresFx", "roundingDisclosure",
  ], endpointKey, "fundingQuote.line");
  const result = Object.freeze({
    lineNumber: integer(row.lineNumber, endpointKey, "lineNumber", 1, 3),
    sourceAccountKey: publicKey(row.sourceAccountKey, "account", endpointKey, "sourceAccountKey"),
    sourceCurrencyCode: currencyCode(row.sourceCurrencyCode, endpointKey, "sourceCurrencyCode"),
    sourcePrecision: precision(row.sourcePrecision, endpointKey, "sourcePrecision"),
    targetCurrencyCode: currencyCode(row.targetCurrencyCode, endpointKey, "targetCurrencyCode"),
    targetPrecision: precision(row.targetPrecision, endpointKey, "targetPrecision"),
    posted: money(row.posted, endpointKey, "posted"),
    held: money(row.held, endpointKey, "held"),
    available: money(row.available, endpointKey, "available"),
    targetContribution: money(row.targetContribution, endpointKey, "targetContribution"),
    sourceDebit: money(row.sourceDebit, endpointKey, "sourceDebit"),
    referenceRate: decimal(row.referenceRate, endpointKey, "referenceRate", { positive: true }),
    customerRate: decimal(row.customerRate, endpointKey, "customerRate", { positive: true }),
    effectiveRate: decimal(row.effectiveRate, endpointKey, "effectiveRate", { positive: true }),
    spreadRate: decimal(row.spreadRate, endpointKey, "spreadRate"),
    requiresFx: boolean(row.requiresFx, endpointKey, "requiresFx"),
    roundingDisclosure: text(row.roundingDisclosure, endpointKey, "roundingDisclosure"),
  });
  fundingLineBindings(result, endpointKey, { balances: true });
  return result;
}

function fundingQuote(value, endpointKey, commercialQuoteKey) {
  const row = object(value, endpointKey, "fundingQuote");
  exactFields(row, [
    "quoteKey", "fundingContextKind", "fundingContextKey", "targetAmount",
    "fixingKey", "policyVersion", "requiresFx", "expiresAt", "lines",
  ], endpointKey, "fundingQuote");
  const lines = Object.freeze(list(row.lines, endpointKey, "fundingQuote.lines")
    .map((entry) => fundingQuoteLine(entry, endpointKey)));
  const result = Object.freeze({
    quoteKey: publicKey(row.quoteKey, "fundingQuote", endpointKey, "fundingQuote.quoteKey"),
    fundingContextKind: fundingToken(row.fundingContextKind, endpointKey, "fundingContextKind"),
    fundingContextKey: publicKey(row.fundingContextKey, "businessQuote", endpointKey, "fundingContextKey"),
    targetAmount: money(row.targetAmount, endpointKey, "fundingQuote.targetAmount"),
    fixingKey: publicKey(row.fixingKey, "fixing", endpointKey, "fundingQuote.fixingKey"),
    policyVersion: fundingToken(row.policyVersion, endpointKey, "policyVersion"),
    requiresFx: boolean(row.requiresFx, endpointKey, "fundingQuote.requiresFx"),
    expiresAt: timestamp(row.expiresAt, endpointKey, "fundingQuote.expiresAt"),
    lines,
  });
  const targetScale = result.targetAmount.precision;
  if (
    lines.length < 1 || lines.length > 3 ||
    new Set(lines.map((line) => line.lineNumber)).size !== lines.length ||
    new Set(lines.map((line) => line.sourceAccountKey)).size !== lines.length ||
    lines.some((line) =>
      line.targetCurrencyCode !== result.targetAmount.currencyCode ||
      line.targetPrecision !== targetScale
    ) ||
    lines.reduce(
      (sum, line) => sum + scaledInteger(line.targetContribution.amount, targetScale),
      0n,
    ) !== scaledInteger(result.targetAmount.amount, targetScale) ||
    result.requiresFx !== lines.some((line) => line.requiresFx) ||
    !/[1-9]/u.test(result.targetAmount.amount) ||
    result.fundingContextKey !== commercialQuoteKey
  ) invalid(endpointKey, "fundingQuote.binding");
  return result;
}

function fundingReceiptLine(value, endpointKey) {
  const row = object(value, endpointKey, "fundingReceipt.line");
  exactFields(row, [
    "lineNumber", "sourceAccountKey", "sourceCurrencyCode", "sourcePrecision",
    "targetCurrencyCode", "targetPrecision", "targetContribution", "sourceDebit",
    "referenceRate", "customerRate", "effectiveRate", "spreadRate", "requiresFx",
  ], endpointKey, "fundingReceipt.line");
  const result = Object.freeze({
    lineNumber: integer(row.lineNumber, endpointKey, "lineNumber", 1, 3),
    sourceAccountKey: publicKey(row.sourceAccountKey, "account", endpointKey, "sourceAccountKey"),
    sourceCurrencyCode: currencyCode(row.sourceCurrencyCode, endpointKey, "sourceCurrencyCode"),
    sourcePrecision: precision(row.sourcePrecision, endpointKey, "sourcePrecision"),
    targetCurrencyCode: currencyCode(row.targetCurrencyCode, endpointKey, "targetCurrencyCode"),
    targetPrecision: precision(row.targetPrecision, endpointKey, "targetPrecision"),
    targetContribution: money(row.targetContribution, endpointKey, "targetContribution"),
    sourceDebit: money(row.sourceDebit, endpointKey, "sourceDebit"),
    referenceRate: decimal(row.referenceRate, endpointKey, "referenceRate", { positive: true }),
    customerRate: decimal(row.customerRate, endpointKey, "customerRate", { positive: true }),
    effectiveRate: decimal(row.effectiveRate, endpointKey, "effectiveRate", { positive: true }),
    spreadRate: decimal(row.spreadRate, endpointKey, "spreadRate"),
    requiresFx: boolean(row.requiresFx, endpointKey, "requiresFx"),
  });
  fundingLineBindings(result, endpointKey);
  return result;
}

function fundingReceipt(value, endpointKey, commercialQuoteKey) {
  const row = object(value, endpointKey, "fundingReceipt");
  exactFields(row, [
    "receiptKey", "quoteKey", "bankTransactionKey", "targetAccountKey",
    "fundingContextKind", "fundingContextKey", "targetAmount",
    "targetReserveDrawAmount", "sourceDomain", "sourceAction", "createdAt", "lines",
  ], endpointKey, "fundingReceipt");
  const lines = Object.freeze(list(row.lines, endpointKey, "fundingReceipt.lines")
    .map((entry) => fundingReceiptLine(entry, endpointKey)));
  const result = Object.freeze({
    receiptKey: publicKey(row.receiptKey, "fundingReceipt", endpointKey, "fundingReceipt.receiptKey"),
    quoteKey: publicKey(row.quoteKey, "fundingQuote", endpointKey, "fundingReceipt.quoteKey"),
    bankTransactionKey: publicKey(row.bankTransactionKey, "bankTransaction", endpointKey, "bankTransactionKey"),
    targetAccountKey: publicKey(row.targetAccountKey, "account", endpointKey, "targetAccountKey"),
    fundingContextKind: fundingToken(row.fundingContextKind, endpointKey, "fundingContextKind"),
    fundingContextKey: publicKey(row.fundingContextKey, "businessQuote", endpointKey, "fundingContextKey"),
    targetAmount: money(row.targetAmount, endpointKey, "fundingReceipt.targetAmount"),
    targetReserveDrawAmount: money(row.targetReserveDrawAmount, endpointKey, "targetReserveDrawAmount"),
    sourceDomain: fundingToken(row.sourceDomain, endpointKey, "sourceDomain"),
    sourceAction: fundingToken(row.sourceAction, endpointKey, "sourceAction"),
    createdAt: timestamp(row.createdAt, endpointKey, "fundingReceipt.createdAt"),
    lines,
  });
  const targetScale = result.targetAmount.precision;
  if (
    lines.length < 1 || lines.length > 3 ||
    new Set(lines.map((line) => line.lineNumber)).size !== lines.length ||
    new Set(lines.map((line) => line.sourceAccountKey)).size !== lines.length ||
    lines.some((line) =>
      line.targetCurrencyCode !== result.targetAmount.currencyCode ||
      line.targetPrecision !== targetScale
    ) ||
    lines.reduce(
      (sum, line) => sum + scaledInteger(line.targetContribution.amount, targetScale),
      0n,
    ) !== scaledInteger(result.targetAmount.amount, targetScale) ||
    result.targetReserveDrawAmount.currencyCode !== result.targetAmount.currencyCode ||
    result.targetReserveDrawAmount.precision !== targetScale ||
    !/[1-9]/u.test(result.targetAmount.amount) ||
    result.fundingContextKey !== commercialQuoteKey
  ) invalid(endpointKey, "fundingReceipt.binding");
  return result;
}

function procurementEnvelope(value, endpointKey, fieldName, refreshRequired) {
  const row = operationBody(value, endpointKey);
  exactFields(row, ["ok", fieldName, "refreshRequired"], endpointKey, "response");
  if (row.ok !== true || row.refreshRequired !== refreshRequired) {
    invalid(endpointKey, "refreshRequired");
  }
  return row[fieldName];
}

export function normalizeBusinessProcurementQuote(value) {
  const endpointKey = "businessStoreQuote";
  const row = object(
    procurementEnvelope(value, endpointKey, "quote", false),
    endpointKey,
    "quote",
  );
  exactFields(row, [
    "businessKey", "quoteKey", "itemKey", "itemName", "quantity", "countryCode",
    "itemCurrencyCode", "settlementCurrencyCode", "baseUnitPrice", "baseUnitPriceMoney",
    "inflationMultiplier", "locationMultiplier", "scarcityMultiplier",
    "itemLocalFinalUnitPrice", "itemLocalFinalTotalPrice", "itemLocalFinalUnit",
    "itemLocalFinalTotal", "exchangeRate", "finalUnitPrice", "finalTotalPrice",
    "finalUnit", "finalTotal", "pricingVersion", "expiresAt", "replayed",
    "fundingTargetAccountKey", "fundingQuote",
  ], endpointKey, "quote");
  assertPublic(row, endpointKey);
  const quoteKey = publicKey(row.quoteKey, "businessQuote", endpointKey, "quoteKey");
  for (const fieldName of [
    "baseUnitPrice", "inflationMultiplier", "locationMultiplier",
    "scarcityMultiplier", "itemLocalFinalUnitPrice", "itemLocalFinalTotalPrice",
    "exchangeRate", "finalUnitPrice", "finalTotalPrice",
  ]) {
    assertTransportNumber(row[fieldName], endpointKey, fieldName, { positive: true });
  }
  const result = Object.freeze({
    businessKey: publicKey(row.businessKey, "business", endpointKey, "businessKey"),
    quoteKey,
    itemKey: storeItemKey(row.itemKey, endpointKey),
    itemName: text(row.itemName, endpointKey, "itemName"),
    quantity: integer(row.quantity, endpointKey, "quantity", 1, 100_000),
    countryCode: countryCode(row.countryCode, endpointKey),
    itemCurrencyCode: currencyCode(row.itemCurrencyCode, endpointKey, "itemCurrencyCode"),
    settlementCurrencyCode: currencyCode(row.settlementCurrencyCode, endpointKey, "settlementCurrencyCode"),
    baseUnitPriceMoney: money(row.baseUnitPriceMoney, endpointKey, "baseUnitPriceMoney"),
    itemLocalFinalUnit: money(row.itemLocalFinalUnit, endpointKey, "itemLocalFinalUnit"),
    itemLocalFinalTotal: money(row.itemLocalFinalTotal, endpointKey, "itemLocalFinalTotal"),
    finalUnit: money(row.finalUnit, endpointKey, "finalUnit"),
    finalTotal: money(row.finalTotal, endpointKey, "finalTotal"),
    pricingVersion: fundingToken(row.pricingVersion, endpointKey, "pricingVersion"),
    expiresAt: timestamp(row.expiresAt, endpointKey, "expiresAt"),
    replayed: boolean(row.replayed, endpointKey, "replayed"),
    fundingTargetAccountKey: publicKey(
      row.fundingTargetAccountKey,
      "account",
      endpointKey,
      "fundingTargetAccountKey",
    ),
    fundingQuote: fundingQuote(row.fundingQuote, endpointKey, quoteKey),
  });
  if (
    [result.baseUnitPriceMoney, result.itemLocalFinalUnit, result.itemLocalFinalTotal]
      .some((entry) => entry.currencyCode !== result.itemCurrencyCode) ||
    [result.finalUnit, result.finalTotal]
      .some((entry) => entry.currencyCode !== result.settlementCurrencyCode) ||
    result.finalTotal.currencyCode !== result.fundingQuote.targetAmount.currencyCode ||
    result.finalTotal.precision !== result.fundingQuote.targetAmount.precision ||
    !decimalsEqual(result.finalTotal.amount, result.fundingQuote.targetAmount.amount) ||
    Date.parse(result.expiresAt) > Date.parse(result.fundingQuote.expiresAt)
  ) invalid(endpointKey, "quote.binding");
  return result;
}

export function normalizeBusinessProcurementReceipt(value) {
  const endpointKey = "businessStorePurchase";
  const row = object(
    procurementEnvelope(value, endpointKey, "receipt", true),
    endpointKey,
    "receipt",
  );
  exactFields(row, [
    "businessKey", "receiptKey", "quoteKey", "itemKey", "itemName", "quantity",
    "finalUnitPrice", "finalTotalPrice", "finalUnit", "finalTotal", "currencyCode",
    "warehouseQuantityOwned", "warehouseAverageUnitCost",
    "warehouseAverageUnitCostMoney", "completedAt", "alreadyCompleted", "fundingReceipt",
  ], endpointKey, "receipt");
  assertPublic(row, endpointKey);
  const quoteKey = publicKey(row.quoteKey, "businessQuote", endpointKey, "quoteKey");
  for (const fieldName of [
    "finalUnitPrice", "finalTotalPrice", "warehouseAverageUnitCost",
  ]) {
    assertTransportNumber(row[fieldName], endpointKey, fieldName, { positive: true });
  }
  const result = Object.freeze({
    businessKey: publicKey(row.businessKey, "business", endpointKey, "businessKey"),
    receiptKey: publicKey(row.receiptKey, "businessReceipt", endpointKey, "receiptKey"),
    quoteKey,
    itemKey: storeItemKey(row.itemKey, endpointKey),
    itemName: text(row.itemName, endpointKey, "itemName"),
    quantity: integer(row.quantity, endpointKey, "quantity", 1, 100_000),
    finalUnit: money(row.finalUnit, endpointKey, "finalUnit"),
    finalTotal: money(row.finalTotal, endpointKey, "finalTotal"),
    currencyCode: currencyCode(row.currencyCode, endpointKey),
    warehouseQuantityOwned: finiteQuantity(
      row.warehouseQuantityOwned,
      endpointKey,
      "warehouseQuantityOwned",
    ),
    warehouseAverageUnitCostMoney: money(
      row.warehouseAverageUnitCostMoney,
      endpointKey,
      "warehouseAverageUnitCostMoney",
    ),
    completedAt: timestamp(row.completedAt, endpointKey, "completedAt"),
    alreadyCompleted: boolean(row.alreadyCompleted, endpointKey, "alreadyCompleted"),
    fundingReceipt: fundingReceipt(row.fundingReceipt, endpointKey, quoteKey),
  });
  if (
    [result.finalUnit, result.finalTotal, result.warehouseAverageUnitCostMoney]
      .some((entry) => entry.currencyCode !== result.currencyCode) ||
    result.finalTotal.precision !== result.fundingReceipt.targetAmount.precision ||
    !decimalsEqual(result.finalTotal.amount, result.fundingReceipt.targetAmount.amount) ||
    result.fundingReceipt.sourceDomain !== "business" ||
    result.fundingReceipt.sourceAction !== "store-procurement" ||
    result.fundingReceipt.fundingContextKind !== "business.store-procurement"
  ) {
    invalid(endpointKey, "receipt.binding");
  }
  return result;
}

export function resolveBusinessProcurementFailure(error) {
  const code = String(error?.code || error?.body?.code || "").trim().toUpperCase();
  const messages = {
    BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED: "This retired procurement quote has no bound funding evidence. Create a new funded quote.",
    FUNDING_INSUFFICIENT: "The selected Business Checking accounts no longer have enough available funds.",
    FUNDING_QUOTE_EXPIRED: "The funded procurement quote expired. Create a new quote before confirming.",
    FUNDING_QUOTE_CONFLICT: "This allocation conflicts with an earlier procurement request. Refresh before retrying.",
    FX_LIQUIDITY_UNAVAILABLE: "Retail FX capacity cannot fund this procurement right now. No stock or money moved.",
    STORE_QUOTE_EXPIRED: "The Store price expired. Create a new funded quote to review current terms.",
    STORE_STOCK_CHANGED: "Store stock changed before confirmation. Refresh and create a new funded quote.",
  };
  if (messages[code]) return messages[code];
  if (Number(error?.status) === 410) return messages.BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED;
  if (Number(error?.status) >= 500 || ["NETWORK_ERROR", "OFFLINE", "REQUEST_TIMEOUT"].includes(code)) {
    return "Funded procurement is temporarily unavailable. No stock or money moved.";
  }
  return playerSafeErrorMessage(error);
}
