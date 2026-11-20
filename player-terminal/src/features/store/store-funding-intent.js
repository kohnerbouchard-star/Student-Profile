import { ApiRequestError } from "../../api/errors.js";

const ACCOUNT_KEY = /^bac_[0-9a-f]{32}$/u;
const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;
const UNSIGNED_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.([0-9]{1,18}))?$/u;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalInput(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
  const text = String(value);
  if (!/[eE]/u.test(text)) return text;
  return "";
}

export function storeCheckingAccounts(data) {
  const seen = new Set();
  return list(data?.bankingFx?.balances).filter((entry) => {
    const accountKey = String(entry?.accountKey || "").trim().toLowerCase();
    const currencyCode = String(entry?.currencyCode || "").trim().toUpperCase();
    const availableAmount = Number(entry?.availableAmount);
    if (
      entry?.accountKind !== "checking" || !ACCOUNT_KEY.test(accountKey) ||
      !CURRENCY_CODE.test(currencyCode) || !Number.isFinite(availableAmount) ||
      availableAmount < 0 || seen.has(accountKey)
    ) return false;
    seen.add(accountKey);
    return true;
  }).map((entry) => Object.freeze({
    accountKey: String(entry.accountKey).trim().toLowerCase(),
    currencyCode: String(entry.currencyCode).trim().toUpperCase(),
    availableAmount: Number(entry.availableAmount),
  }));
}

export function storeCurrencyPrecision(data, currencyCode) {
  const code = String(currencyCode || "").trim().toUpperCase();
  const precision = Number(list(data?.bankingFx?.currencies)
    .find((entry) => String(entry?.currencyCode || "").trim().toUpperCase() === code)
    ?.minorUnit);
  return Number.isSafeInteger(precision) && precision >= 0 && precision <= 18
    ? precision
    : null;
}

export function storeDecimalStep(precision) {
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 18) return "";
  return precision === 0 ? "1" : `0.${"0".repeat(precision - 1)}1`;
}

export function canonicalStoreTargetAmount(value, precision, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 18) return "";
  const candidate = canonicalInput(value);
  const match = UNSIGNED_DECIMAL.exec(candidate);
  if (!match) return "";
  const fraction = match[1] || "";
  if (fraction.length > precision || (precision === 0 && fraction.length)) return "";
  const [integerPart, fractionPart = ""] = candidate.split(".");
  const scaled = BigInt(integerPart) * (10n ** BigInt(precision)) +
    BigInt((fractionPart + "0".repeat(precision)).slice(0, precision) || "0");
  if ((!allowZero && scaled <= 0n) || scaled >= 1_000_000_000_000_000n * (10n ** BigInt(precision))) {
    return "";
  }
  const trimmedFraction = fractionPart.replace(/0+$/u, "");
  return trimmedFraction ? `${BigInt(integerPart)}.${trimmedFraction}` : String(BigInt(integerPart));
}

export function scaledStoreAmount(value, precision, { allowZero = true } = {}) {
  const canonical = canonicalStoreTargetAmount(value, precision, { allowZero });
  if (!canonical) return null;
  const [integerPart, fractionPart = ""] = canonical.split(".");
  return BigInt(integerPart) * (10n ** BigInt(precision)) +
    BigInt((fractionPart + "0".repeat(precision)).slice(0, precision) || "0");
}

export function canonicalStoreAmountFromScaled(value, precision) {
  if (typeof value !== "bigint" || value < 0n || !Number.isSafeInteger(precision) || precision < 0 || precision > 18) {
    return "";
  }
  const scale = 10n ** BigInt(precision);
  const integerPart = value / scale;
  if (precision === 0) return String(integerPart);
  const fraction = String(value % scale).padStart(precision, "0").replace(/0+$/u, "");
  return fraction ? `${integerPart}.${fraction}` : String(integerPart);
}

export function storeAmountsEqual(left, right, precision) {
  const leftScaled = scaledStoreAmount(left, precision);
  const rightScaled = scaledStoreAmount(right, precision);
  return leftScaled !== null && rightScaled !== null && leftScaled === rightScaled;
}

export function normalizeStoreFundingIntent(rows, { accounts, targetCurrencyCode, targetPrecision }) {
  const canonicalAccounts = new Map(list(accounts).map((entry) => [entry.accountKey, entry]));
  const source = list(rows);
  const selected = source.filter((entry) => String(entry?.sourceAccountKey || "").trim());
  if (
    selected.length < 1 || selected.length > 3 ||
    source.slice(0, selected.length).some((entry) => !String(entry?.sourceAccountKey || "").trim()) ||
    source.slice(selected.length).some((entry) => String(entry?.sourceAccountKey || "").trim())
  ) {
    return Object.freeze({ error: "Choose one to three Checking accounts in order without an empty row." });
  }
  if (!CURRENCY_CODE.test(String(targetCurrencyCode || "")) || targetPrecision === null) {
    return Object.freeze({ error: "The Store currency precision is unavailable. Refresh Banking before checkout." });
  }

  const seen = new Set();
  const allocations = [];
  let fixedTotal = 0n;
  for (const [index, row] of selected.entries()) {
    const sourceAccountKey = String(row?.sourceAccountKey || "").trim().toLowerCase();
    if (!canonicalAccounts.has(sourceAccountKey)) {
      return Object.freeze({ error: "Choose only canonical Player Checking accounts." });
    }
    if (seen.has(sourceAccountKey)) {
      return Object.freeze({ error: "Each Checking account may be selected only once." });
    }
    seen.add(sourceAccountKey);
    const final = index === selected.length - 1;
    if (final) {
      if (row?.targetAmount !== null && String(row?.targetAmount ?? "").trim()) {
        return Object.freeze({ error: "The final Checking account must leave its target amount empty for the server-derived remainder." });
      }
      allocations.push(Object.freeze({ sourceAccountKey, targetAmount: null }));
      continue;
    }
    const targetAmount = canonicalStoreTargetAmount(row?.targetAmount, targetPrecision);
    if (!targetAmount) {
      return Object.freeze({
        error: `Enter a positive fixed contribution with no more than ${targetPrecision} decimal places for every non-final account.`,
      });
    }
    fixedTotal += scaledStoreAmount(targetAmount, targetPrecision, { allowZero: false });
    allocations.push(Object.freeze({ sourceAccountKey, targetAmount }));
  }

  return Object.freeze({
    allocations: Object.freeze(allocations),
    targetCurrencyCode,
    targetPrecision,
    fixedTotal: canonicalStoreAmountFromScaled(fixedTotal, targetPrecision),
  });
}

export function storeFundingAvailability(data, targetCurrencyCode) {
  const accounts = storeCheckingAccounts(data);
  const targetPrecision = storeCurrencyPrecision(data, targetCurrencyCode);
  const resourceState = String(data?.resourceStatus?.bankingFx?.state || "");
  const resourceReady = !resourceState || resourceState === "ready";
  return Object.freeze({
    accounts: Object.freeze(accounts),
    targetCurrencyCode: String(targetCurrencyCode || "").trim().toUpperCase(),
    targetPrecision,
    ready: resourceReady && accounts.length > 0 && targetPrecision !== null,
  });
}

const FUNDING_KEYS = Object.freeze({
  bankTransaction: /^btx_[0-9a-f]{32}$/u,
  fixing: /^fxf_[0-9a-f]{32}$/u,
  quote: /^pfq_[0-9a-f]{32}$/u,
  receipt: /^pfr_[0-9a-f]{32}$/u,
});
const FUNDING_QUOTE_FIELDS = Object.freeze([
  "quoteKey", "fundingContextKind", "fundingContextKey", "targetCurrencyCode",
  "targetMinorUnit", "targetAmount", "fixingKey", "policyVersion", "requiresFx",
  "expiresAt", "lines",
]);
const FUNDING_QUOTE_LINE_FIELDS = Object.freeze([
  "lineNumber", "sourceAccountKey", "sourceCurrencyCode", "sourceMinorUnit",
  "targetCurrencyCode", "targetMinorUnit", "postedAmount", "heldAmount",
  "availableAmount", "targetContribution", "sourceDebit", "referenceRate",
  "customerRate", "effectiveRate", "spreadRate", "requiresFx", "roundingDisclosure",
]);
const FUNDING_RECEIPT_FIELDS = Object.freeze([
  "receiptKey", "quoteKey", "bankTransactionKey", "targetAccountKey",
  "fundingContextKind", "fundingContextKey", "targetCurrencyCode", "targetMinorUnit",
  "targetAmount", "targetReserveDrawAmount", "sourceDomain", "sourceAction",
  "createdAt", "lines",
]);
const FUNDING_RECEIPT_LINE_FIELDS = Object.freeze([
  "lineNumber", "sourceAccountKey", "sourceCurrencyCode", "sourceMinorUnit",
  "targetCurrencyCode", "targetMinorUnit", "targetContribution", "sourceDebit",
  "referenceRate", "customerRate", "effectiveRate", "spreadRate", "requiresFx",
]);
const INTERNAL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;

function invalidFundingEvidence(field) {
  throw new ApiRequestError("The Store returned invalid public funding evidence. Refresh before trying again.", {
    code: "INVALID_RESPONSE",
    endpointKey: "store",
    body: { field },
  });
}

function evidenceRecord(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value) || INTERNAL_UUID.test(JSON.stringify(value))) {
    invalidFundingEvidence(field);
  }
  return value;
}

function exactEvidenceFields(value, fields, field) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalidFundingEvidence(field);
  }
}

function evidenceKey(value, pattern, field) {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!pattern.test(candidate)) invalidFundingEvidence(field);
  return candidate;
}

function evidenceCurrency(value, field) {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!CURRENCY_CODE.test(candidate)) invalidFundingEvidence(field);
  return candidate;
}

function evidenceInteger(value, minimum, maximum, field) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalidFundingEvidence(field);
  return value;
}

function evidenceDecimal(value, precision, field, { positive = false } = {}) {
  if (typeof value !== "string") invalidFundingEvidence(field);
  const canonical = canonicalStoreTargetAmount(value, precision, { allowZero: !positive });
  if (!canonical) invalidFundingEvidence(field);
  return canonical;
}

function evidenceTimestamp(value, field) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) invalidFundingEvidence(field);
  return value;
}

function quoteLineEvidence(value, index, targetCurrencyCode, targetMinorUnit) {
  const line = evidenceRecord(value, `fundingQuote.lines[${index}]`);
  exactEvidenceFields(line, FUNDING_QUOTE_LINE_FIELDS, `fundingQuote.lines[${index}]`);
  const sourceCurrencyCode = evidenceCurrency(line.sourceCurrencyCode, "sourceCurrencyCode");
  const sourceMinorUnit = evidenceInteger(line.sourceMinorUnit, 0, 18, "sourceMinorUnit");
  if (
    evidenceInteger(line.lineNumber, 1, 3, "lineNumber") !== index + 1 ||
    evidenceKey(line.sourceAccountKey, ACCOUNT_KEY, "sourceAccountKey") !== line.sourceAccountKey ||
    evidenceCurrency(line.targetCurrencyCode, "targetCurrencyCode") !== targetCurrencyCode ||
    evidenceInteger(line.targetMinorUnit, 0, 18, "targetMinorUnit") !== targetMinorUnit ||
    typeof line.requiresFx !== "boolean" || typeof line.roundingDisclosure !== "string" ||
    !line.roundingDisclosure.trim()
  ) invalidFundingEvidence("fundingQuote.lineBinding");
  const result = Object.freeze({
    ...line,
    postedAmount: evidenceDecimal(line.postedAmount, sourceMinorUnit, "postedAmount"),
    heldAmount: evidenceDecimal(line.heldAmount, sourceMinorUnit, "heldAmount"),
    availableAmount: evidenceDecimal(line.availableAmount, sourceMinorUnit, "availableAmount"),
    targetContribution: evidenceDecimal(line.targetContribution, targetMinorUnit, "targetContribution", { positive: true }),
    sourceDebit: evidenceDecimal(line.sourceDebit, sourceMinorUnit, "sourceDebit", { positive: true }),
    referenceRate: evidenceDecimal(line.referenceRate, 18, "referenceRate", { positive: true }),
    customerRate: evidenceDecimal(line.customerRate, 18, "customerRate", { positive: true }),
    effectiveRate: evidenceDecimal(line.effectiveRate, 18, "effectiveRate", { positive: true }),
    spreadRate: evidenceDecimal(line.spreadRate, 18, "spreadRate"),
  });
  if (
    scaledStoreAmount(result.postedAmount, sourceMinorUnit) - scaledStoreAmount(result.heldAmount, sourceMinorUnit) !==
      scaledStoreAmount(result.availableAmount, sourceMinorUnit)
  ) invalidFundingEvidence("availableAmount");
  if (result.requiresFx) {
    if (
      sourceCurrencyCode === targetCurrencyCode || result.spreadRate !== "0.01" ||
      scaledStoreAmount(result.customerRate, 18) >= scaledStoreAmount(result.referenceRate, 18)
    ) invalidFundingEvidence("requiresFx");
  } else if (
    sourceCurrencyCode !== targetCurrencyCode || sourceMinorUnit !== targetMinorUnit ||
    result.spreadRate !== "0" ||
    result.referenceRate !== "1" || result.customerRate !== "1" || result.effectiveRate !== "1" ||
    !storeAmountsEqual(result.sourceDebit, result.targetContribution, targetMinorUnit)
  ) invalidFundingEvidence("sameCurrencyLine");
  return result;
}

export function validateStoreFundingQuoteEvidence(value, expected) {
  const quote = evidenceRecord(value, "fundingQuote");
  exactEvidenceFields(quote, FUNDING_QUOTE_FIELDS, "fundingQuote");
  const targetCurrencyCode = evidenceCurrency(quote.targetCurrencyCode, "targetCurrencyCode");
  const targetMinorUnit = evidenceInteger(quote.targetMinorUnit, 0, 18, "targetMinorUnit");
  const lines = Array.isArray(quote.lines)
    ? quote.lines.map((line, index) => quoteLineEvidence(line, index, targetCurrencyCode, targetMinorUnit))
    : [];
  const lineAccountKeys = lines.map((line) => line.sourceAccountKey);
  const canonicalLineAccountKeys = [...lineAccountKeys].sort();
  if (
    lines.length < 1 || lines.length > 3 || new Set(lines.map((line) => line.sourceAccountKey)).size !== lines.length ||
    lineAccountKeys.some((accountKey, index) => accountKey !== canonicalLineAccountKeys[index]) ||
    evidenceKey(quote.quoteKey, FUNDING_KEYS.quote, "quoteKey") !== quote.quoteKey ||
    quote.fundingContextKind !== expected.fundingContextKind || quote.fundingContextKey !== expected.commercialQuoteKey ||
    targetCurrencyCode !== expected.targetCurrencyCode ||
    evidenceKey(quote.fixingKey, FUNDING_KEYS.fixing, "fixingKey") !== quote.fixingKey ||
    typeof quote.policyVersion !== "string" || !quote.policyVersion.trim() ||
    typeof quote.requiresFx !== "boolean" || quote.requiresFx !== lines.some((line) => line.requiresFx)
  ) invalidFundingEvidence("fundingQuote.binding");
  const targetAmount = evidenceDecimal(quote.targetAmount, targetMinorUnit, "targetAmount", { positive: true });
  const total = lines.reduce((sum, line) => sum + scaledStoreAmount(line.targetContribution, targetMinorUnit), 0n);
  if (
    !storeAmountsEqual(targetAmount, expected.targetAmount, targetMinorUnit) ||
    total !== scaledStoreAmount(targetAmount, targetMinorUnit) ||
    Date.parse(evidenceTimestamp(quote.expiresAt, "expiresAt")) < Date.parse(expected.commercialExpiresAt)
  ) invalidFundingEvidence("fundingQuote.total");
  if (expected.allocationIntent) {
    if (expected.allocationIntent.allocations.length !== lines.length) invalidFundingEvidence("fundingQuote.intent");
    const allocationsByAccount = new Map(expected.allocationIntent.allocations.map((allocation) => [
      allocation.sourceAccountKey,
      allocation,
    ]));
    for (const line of lines) {
      const allocation = allocationsByAccount.get(line.sourceAccountKey);
      if (
        !allocation ||
        (allocation.targetAmount !== null && !storeAmountsEqual(
          line.targetContribution,
          allocation.targetAmount,
          targetMinorUnit,
        ))
      ) invalidFundingEvidence("fundingQuote.intent");
    }
  }
  return Object.freeze({ ...quote, targetAmount, lines: Object.freeze(lines) });
}

function receiptLineEvidence(value, index, targetCurrencyCode, targetMinorUnit) {
  const line = evidenceRecord(value, `fundingReceipt.lines[${index}]`);
  exactEvidenceFields(line, FUNDING_RECEIPT_LINE_FIELDS, `fundingReceipt.lines[${index}]`);
  const sourceCurrencyCode = evidenceCurrency(line.sourceCurrencyCode, "sourceCurrencyCode");
  const sourceMinorUnit = evidenceInteger(line.sourceMinorUnit, 0, 18, "sourceMinorUnit");
  if (
    evidenceInteger(line.lineNumber, 1, 3, "lineNumber") !== index + 1 ||
    evidenceKey(line.sourceAccountKey, ACCOUNT_KEY, "sourceAccountKey") !== line.sourceAccountKey ||
    evidenceCurrency(line.targetCurrencyCode, "targetCurrencyCode") !== targetCurrencyCode ||
    evidenceInteger(line.targetMinorUnit, 0, 18, "targetMinorUnit") !== targetMinorUnit ||
    typeof line.requiresFx !== "boolean"
  ) invalidFundingEvidence("fundingReceipt.lineBinding");
  const result = Object.freeze({
    ...line,
    targetContribution: evidenceDecimal(line.targetContribution, targetMinorUnit, "targetContribution", { positive: true }),
    sourceDebit: evidenceDecimal(line.sourceDebit, sourceMinorUnit, "sourceDebit", { positive: true }),
    referenceRate: evidenceDecimal(line.referenceRate, 18, "referenceRate", { positive: true }),
    customerRate: evidenceDecimal(line.customerRate, 18, "customerRate", { positive: true }),
    effectiveRate: evidenceDecimal(line.effectiveRate, 18, "effectiveRate", { positive: true }),
    spreadRate: evidenceDecimal(line.spreadRate, 18, "spreadRate"),
  });
  if (result.requiresFx) {
    if (sourceCurrencyCode === targetCurrencyCode || result.spreadRate !== "0.01") invalidFundingEvidence("requiresFx");
  } else if (
    sourceCurrencyCode !== targetCurrencyCode || sourceMinorUnit !== targetMinorUnit ||
    result.spreadRate !== "0" || result.referenceRate !== "1" ||
    result.customerRate !== "1" || result.effectiveRate !== "1" ||
    !storeAmountsEqual(result.sourceDebit, result.targetContribution, targetMinorUnit)
  ) invalidFundingEvidence("sameCurrencyLine");
  return result;
}

export function validateStoreFundingReceiptEvidence(value, { quote, sourceAction }) {
  const receipt = evidenceRecord(value, "fundingReceipt");
  exactEvidenceFields(receipt, FUNDING_RECEIPT_FIELDS, "fundingReceipt");
  const targetMinorUnit = evidenceInteger(receipt.targetMinorUnit, 0, 18, "targetMinorUnit");
  const lines = Array.isArray(receipt.lines)
    ? receipt.lines.map((line, index) => receiptLineEvidence(line, index, quote.targetCurrencyCode, targetMinorUnit))
    : [];
  if (
    lines.length !== quote.lines.length || new Set(lines.map((line) => line.sourceAccountKey)).size !== lines.length ||
    evidenceKey(receipt.receiptKey, FUNDING_KEYS.receipt, "receiptKey") !== receipt.receiptKey ||
    receipt.quoteKey !== quote.quoteKey ||
    evidenceKey(receipt.bankTransactionKey, FUNDING_KEYS.bankTransaction, "bankTransactionKey") !== receipt.bankTransactionKey ||
    evidenceKey(receipt.targetAccountKey, ACCOUNT_KEY, "targetAccountKey") !== receipt.targetAccountKey ||
    receipt.fundingContextKind !== quote.fundingContextKind || receipt.fundingContextKey !== quote.fundingContextKey ||
    receipt.targetCurrencyCode !== quote.targetCurrencyCode || targetMinorUnit !== quote.targetMinorUnit ||
    receipt.sourceDomain !== "store" || receipt.sourceAction !== sourceAction
  ) invalidFundingEvidence("fundingReceipt.binding");
  const targetAmount = evidenceDecimal(receipt.targetAmount, targetMinorUnit, "targetAmount", { positive: true });
  const targetReserveDrawAmount = evidenceDecimal(receipt.targetReserveDrawAmount, targetMinorUnit, "targetReserveDrawAmount");
  if (!storeAmountsEqual(targetAmount, quote.targetAmount, targetMinorUnit)) invalidFundingEvidence("fundingReceipt.total");
  const total = lines.reduce((sum, line) => sum + scaledStoreAmount(line.targetContribution, targetMinorUnit), 0n);
  if (total !== scaledStoreAmount(targetAmount, targetMinorUnit)) invalidFundingEvidence("fundingReceipt.lines");
  for (const [index, line] of lines.entries()) {
    const quoted = quote.lines[index];
    for (const field of FUNDING_RECEIPT_LINE_FIELDS) {
      if (line[field] !== quoted[field]) invalidFundingEvidence("fundingReceipt.immutableLine");
    }
  }
  evidenceTimestamp(receipt.createdAt, "createdAt");
  return Object.freeze({ ...receipt, targetAmount, targetReserveDrawAmount, lines: Object.freeze(lines) });
}
