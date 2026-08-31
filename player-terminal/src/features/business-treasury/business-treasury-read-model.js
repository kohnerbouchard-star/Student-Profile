import { playerSafeErrorMessage } from "../../api/errors.js";
import {
  assertPublic,
  currencyCode,
  decimal,
  decimalsEqual,
  exactFields,
  invalid,
  list,
  money,
  mutationEnvelope,
  object,
  operationBody,
  precision,
  product,
  publicKey,
  scaledInteger,
  text,
  timestamp,
  token,
} from "./business-treasury-validation.js";

function account(value, endpointKey = "businessTreasury") {
  const row = object(value, endpointKey, "account");
  exactFields(row, [
    "accountKey", "accountKind", "status", "currencyCode", "precision",
    "posted", "held", "available",
  ], endpointKey, "account");
  const result = Object.freeze({
    accountKey: publicKey(row.accountKey, "account", endpointKey, "accountKey"),
    accountKind: token(row.accountKind, endpointKey, "accountKind"),
    status: token(row.status, endpointKey, "status"),
    currencyCode: currencyCode(row.currencyCode, endpointKey),
    precision: precision(row.precision, endpointKey),
    posted: money(row.posted, endpointKey, "posted"),
    held: money(row.held, endpointKey, "held"),
    available: money(row.available, endpointKey, "available"),
  });
  if (
    result.accountKind !== "checking" ||
    [result.posted, result.held, result.available].some((entry) =>
      entry.currencyCode !== result.currencyCode || entry.precision !== result.precision
    ) ||
    scaledInteger(result.posted.amount, result.precision) !==
      scaledInteger(result.held.amount, result.precision) +
      scaledInteger(result.available.amount, result.precision)
  ) invalid(endpointKey, "account.balance");
  return result;
}

function rate(value, endpointKey = "businessTreasury") {
  const row = object(value, endpointKey, "rate");
  exactFields(row, [
    "fixingKey", "sourceCurrencyCode", "targetCurrencyCode", "referenceRate",
    "effectiveAt", "calculatedAt", "policyVersion",
  ], endpointKey, "rate");
  const result = Object.freeze({
    fixingKey: publicKey(row.fixingKey, "fixing", endpointKey, "fixingKey"),
    sourceCurrencyCode: currencyCode(row.sourceCurrencyCode, endpointKey, "sourceCurrencyCode"),
    targetCurrencyCode: currencyCode(row.targetCurrencyCode, endpointKey, "targetCurrencyCode"),
    referenceRate: decimal(row.referenceRate, endpointKey, "referenceRate", { positive: true }),
    effectiveAt: timestamp(row.effectiveAt, endpointKey, "effectiveAt"),
    calculatedAt: timestamp(row.calculatedAt, endpointKey, "calculatedAt"),
    policyVersion: text(row.policyVersion, endpointKey, "policyVersion"),
  });
  if (result.sourceCurrencyCode === result.targetCurrencyCode) {
    invalid(endpointKey, "rate.currencyPair");
  }
  return result;
}

function order(value, endpointKey = "businessTreasury") {
  const row = object(value, endpointKey, "order");
  exactFields(row, [
    "orderKey", "quoteKey", "product", "status", "sourceAccountKey",
    "targetAccountKey", "sourceAmount", "feeAmount", "targetAmount", "fixingKey",
    "referenceRate", "customerRate", "spreadRate", "feeRate", "submittedAt",
    "settlesAt", "completedAt", "receiptKey",
  ], endpointKey, "order");
  const result = Object.freeze({
    orderKey: publicKey(row.orderKey, "order", endpointKey, "orderKey"),
    quoteKey: publicKey(row.quoteKey, "quote", endpointKey, "quoteKey"),
    product: product(row.product, endpointKey),
    status: token(row.status, endpointKey, "status"),
    sourceAccountKey: publicKey(row.sourceAccountKey, "account", endpointKey, "sourceAccountKey"),
    targetAccountKey: publicKey(row.targetAccountKey, "account", endpointKey, "targetAccountKey"),
    sourceAmount: money(row.sourceAmount, endpointKey, "sourceAmount"),
    feeAmount: money(row.feeAmount, endpointKey, "feeAmount"),
    targetAmount: money(row.targetAmount, endpointKey, "targetAmount"),
    referenceRate: decimal(row.referenceRate, endpointKey, "referenceRate", { positive: true }),
    customerRate: decimal(row.customerRate, endpointKey, "customerRate", { positive: true }),
    spreadRate: decimal(row.spreadRate, endpointKey, "spreadRate"),
    feeRate: decimal(row.feeRate, endpointKey, "feeRate"),
    fixingKey: publicKey(row.fixingKey, "fixing", endpointKey, "fixingKey"),
    submittedAt: timestamp(row.submittedAt, endpointKey, "submittedAt"),
    settlesAt: timestamp(row.settlesAt, endpointKey, "settlesAt"),
    completedAt: timestamp(row.completedAt, endpointKey, "completedAt", { nullable: true }),
    receiptKey: publicKey(row.receiptKey, "receipt", endpointKey, "receiptKey", { nullable: true }),
  });
  if (
    result.sourceAccountKey === result.targetAccountKey ||
    result.sourceAmount.currencyCode === result.targetAmount.currencyCode ||
    result.feeAmount.currencyCode !== result.sourceAmount.currencyCode ||
    !decimalsEqual(result.spreadRate, "0.005") ||
    (result.product === "standard" && (
      !decimalsEqual(result.feeRate, "0") ||
      !decimalsEqual(result.feeAmount.amount, "0")
    )) ||
    (result.product === "instant" && !decimalsEqual(result.feeRate, "0.02")) ||
    (result.receiptKey !== null && result.completedAt === null)
  ) invalid(endpointKey, "order.binding");
  return result;
}

function receipt(value, endpointKey = "businessTreasury") {
  const row = object(value, endpointKey, "receipt");
  exactFields(row, [
    "receiptKey", "orderKey", "quoteKey", "bankTransactionKey", "product",
    "sourceAccountKey", "targetAccountKey", "sourceAmount", "feeAmount",
    "targetAmount", "referenceRate", "customerRate", "spreadRate", "feeRate",
    "reserveDrawAmount", "reserveRepaymentAmount", "fixingKey", "completedAt",
  ], endpointKey, "receipt");
  const result = Object.freeze({
    receiptKey: publicKey(row.receiptKey, "receipt", endpointKey, "receiptKey"),
    orderKey: publicKey(row.orderKey, "order", endpointKey, "orderKey"),
    quoteKey: publicKey(row.quoteKey, "quote", endpointKey, "quoteKey"),
    bankTransactionKey: publicKey(
      row.bankTransactionKey,
      "bankTransaction",
      endpointKey,
      "bankTransactionKey",
    ),
    product: product(row.product, endpointKey),
    sourceAccountKey: publicKey(row.sourceAccountKey, "account", endpointKey, "sourceAccountKey"),
    targetAccountKey: publicKey(row.targetAccountKey, "account", endpointKey, "targetAccountKey"),
    sourceAmount: money(row.sourceAmount, endpointKey, "sourceAmount"),
    feeAmount: money(row.feeAmount, endpointKey, "feeAmount"),
    targetAmount: money(row.targetAmount, endpointKey, "targetAmount"),
    referenceRate: decimal(row.referenceRate, endpointKey, "referenceRate", { positive: true }),
    customerRate: decimal(row.customerRate, endpointKey, "customerRate", { positive: true }),
    spreadRate: decimal(row.spreadRate, endpointKey, "spreadRate"),
    feeRate: decimal(row.feeRate, endpointKey, "feeRate"),
    reserveDrawAmount: money(row.reserveDrawAmount, endpointKey, "reserveDrawAmount"),
    reserveRepaymentAmount: money(
      row.reserveRepaymentAmount,
      endpointKey,
      "reserveRepaymentAmount",
    ),
    fixingKey: publicKey(row.fixingKey, "fixing", endpointKey, "fixingKey"),
    completedAt: timestamp(row.completedAt, endpointKey, "completedAt"),
  });
  if (
    result.sourceAccountKey === result.targetAccountKey ||
    result.sourceAmount.currencyCode === result.targetAmount.currencyCode ||
    result.feeAmount.currencyCode !== result.sourceAmount.currencyCode ||
    result.reserveDrawAmount.currencyCode !== result.targetAmount.currencyCode ||
    result.reserveDrawAmount.precision !== result.targetAmount.precision ||
    result.reserveRepaymentAmount.currencyCode !== result.sourceAmount.currencyCode ||
    result.reserveRepaymentAmount.precision !== result.sourceAmount.precision ||
    !decimalsEqual(result.spreadRate, "0.005") ||
    (result.product === "standard" && (
      !decimalsEqual(result.feeRate, "0") ||
      !decimalsEqual(result.feeAmount.amount, "0")
    )) ||
    (result.product === "instant" && !decimalsEqual(result.feeRate, "0.02"))
  ) invalid(endpointKey, "receipt.binding");
  return result;
}

export function normalizeBusinessTreasurySnapshot(value) {
  const endpointKey = "businessTreasury";
  const row = operationBody(value, endpointKey);
  exactFields(row, [
    "businessKey", "reportingCurrencyCode", "generatedAt", "accounts", "rates",
    "orders", "receipts",
  ], endpointKey, "snapshot");
  const result = Object.freeze({
    businessKey: publicKey(row.businessKey, "business", endpointKey, "businessKey"),
    reportingCurrencyCode: currencyCode(row.reportingCurrencyCode, endpointKey, "reportingCurrencyCode"),
    generatedAt: timestamp(row.generatedAt, endpointKey, "generatedAt"),
    accounts: Object.freeze(list(row.accounts, endpointKey, "accounts").map((entry) => account(entry, endpointKey))),
    rates: Object.freeze(list(row.rates, endpointKey, "rates").map((entry) => rate(entry, endpointKey))),
    orders: Object.freeze(list(row.orders, endpointKey, "orders").map((entry) => order(entry, endpointKey))),
    receipts: Object.freeze(list(row.receipts, endpointKey, "receipts").map((entry) => receipt(entry, endpointKey))),
  });
  for (const [fieldName, entries, keyName] of [
    ["accounts", result.accounts, "accountKey"],
    ["orders", result.orders, "orderKey"],
    ["receipts", result.receipts, "receiptKey"],
  ]) {
    if (new Set(entries.map((entry) => entry[keyName])).size !== entries.length) {
      invalid(endpointKey, fieldName);
    }
  }
  const accounts = new Set(result.accounts.map((entry) => entry.accountKey));
  if (result.orders.some((entry) =>
    !accounts.has(entry.sourceAccountKey) || !accounts.has(entry.targetAccountKey)
  )) invalid(endpointKey, "orders.accountBinding");
  return result;
}

export function normalizeBusinessTreasuryOpenResult(value) {
  const result = mutationEnvelope(
    value,
    "businessTreasuryAccountOpen",
    "account",
    account,
  );
  if (result.refreshRequired !== true) {
    invalid("businessTreasuryAccountOpen", "refreshRequired");
  }
  return result;
}

export function normalizeBusinessTreasuryQuote(value) {
  const endpointKey = "businessTreasuryFxQuote";
  const envelope = mutationEnvelope(value, endpointKey, "quote", (entry) => {
    const row = object(entry, endpointKey, "quote");
    exactFields(row, [
      "quoteKey", "product", "sourceAccountKey", "targetAccountKey", "sourceAmount",
      "referenceRate", "customerRate", "spreadRate", "feeRate", "feeAmount", "targetAmount",
      "fixingKey", "policyVersion", "expiresAt", "settlesAt", "requiresFx",
      "roundingDisclosure",
    ], endpointKey, "quote");
    const result = Object.freeze({
      quoteKey: publicKey(row.quoteKey, "quote", endpointKey, "quoteKey"),
      product: product(row.product, endpointKey),
      sourceAccountKey: publicKey(row.sourceAccountKey, "account", endpointKey, "sourceAccountKey"),
      targetAccountKey: publicKey(row.targetAccountKey, "account", endpointKey, "targetAccountKey"),
      sourceAmount: money(row.sourceAmount, endpointKey, "sourceAmount"),
      referenceRate: decimal(row.referenceRate, endpointKey, "referenceRate", { positive: true }),
      customerRate: decimal(row.customerRate, endpointKey, "customerRate", { positive: true }),
      spreadRate: decimal(row.spreadRate, endpointKey, "spreadRate"),
      feeRate: decimal(row.feeRate, endpointKey, "feeRate"),
      feeAmount: money(row.feeAmount, endpointKey, "feeAmount"),
      targetAmount: money(row.targetAmount, endpointKey, "targetAmount"),
      fixingKey: publicKey(row.fixingKey, "fixing", endpointKey, "fixingKey"),
      policyVersion: text(row.policyVersion, endpointKey, "policyVersion"),
      expiresAt: timestamp(row.expiresAt, endpointKey, "expiresAt"),
      settlesAt: timestamp(row.settlesAt, endpointKey, "settlesAt"),
      requiresFx: row.requiresFx === true,
      roundingDisclosure: text(row.roundingDisclosure, endpointKey, "roundingDisclosure"),
    });
    if (
      row.requiresFx !== true ||
      result.sourceAccountKey === result.targetAccountKey ||
      result.sourceAmount.currencyCode === result.targetAmount.currencyCode ||
      result.feeAmount.currencyCode !== result.sourceAmount.currencyCode ||
      !decimalsEqual(result.spreadRate, "0.005") ||
      (result.product === "standard" && (
        !decimalsEqual(result.feeRate, "0") ||
        scaledInteger(result.feeAmount.amount, result.feeAmount.precision) !== 0n
      )) ||
      (result.product === "instant" && !decimalsEqual(result.feeRate, "0.02"))
    ) invalid(endpointKey, "quote.binding");
    return result;
  });
  if (envelope.refreshRequired !== false) {
    invalid(endpointKey, "refreshRequired");
  }
  return envelope;
}

export function normalizeBusinessTreasuryOrderResult(value, endpointKey) {
  if (!new Set([
    "businessTreasuryFxStandard",
    "businessTreasuryFxInstant",
    "businessTreasuryFxCancel",
  ]).has(endpointKey)) invalid("businessTreasury", "endpointKey");
  const result = mutationEnvelope(value, endpointKey, "order", order);
  if (result.refreshRequired !== true) invalid(endpointKey, "refreshRequired");
  return result;
}

export function resolveBusinessTreasuryFailure(error) {
  const code = String(error?.code || error?.body?.code || "").trim().toUpperCase();
  const messages = {
    BUSINESS_TREASURY_ACCOUNT_RESTRICTED: "That Business Checking account is restricted and cannot be used.",
    BUSINESS_TREASURY_ACCOUNT_UNAVAILABLE: "The selected Business Checking account is no longer available.",
    FUNDING_INSUFFICIENT: "The selected Business Checking account does not have enough available funds.",
    FX_LIQUIDITY_UNAVAILABLE: "FX liquidity cannot complete this conversion right now. No funds moved.",
    FX_ORDER_NOT_CANCELLABLE: "This order has already been claimed and can no longer be cancelled.",
    FX_QUOTE_CONFLICT: "This intent conflicts with an earlier quote request. Review the current treasury before retrying.",
    FX_QUOTE_EXPIRED: "This quote expired. Create a new quote before submitting.",
    FX_RATE_VERSION_STALE: "The accepted fixing changed. Create a new quote to review the current rate.",
  };
  if (messages[code]) return messages[code];
  if (Number(error?.status) === 429) {
    return "Business treasury is being requested too quickly. Try again shortly.";
  }
  if (Number(error?.status) >= 500 || ["NETWORK_ERROR", "OFFLINE", "REQUEST_TIMEOUT"].includes(code)) {
    return "Business treasury is temporarily unavailable. No funds moved.";
  }
  return playerSafeErrorMessage(error);
}

export {
  normalizeBusinessProcurementQuote,
  normalizeBusinessProcurementReceipt,
  resolveBusinessProcurementFailure,
} from "./business-procurement-read-model.js";
