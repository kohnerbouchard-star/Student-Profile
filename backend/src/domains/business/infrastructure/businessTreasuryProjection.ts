import {
  BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
  BUSINESS_TREASURY_BUSINESS_KEY_PATTERN,
  BUSINESS_TREASURY_FIXING_KEY_PATTERN,
  type BusinessTreasuryAccountV1,
  type BusinessTreasuryFxOrderV1,
  type BusinessTreasuryFxQuoteV1,
  type BusinessTreasuryMutationResultV1,
  type BusinessTreasuryRateV1,
  type BusinessTreasurySnapshotV1,
} from "../contracts/businessTreasuryContracts.ts";
import {
  projectTreasuryOrder,
  projectTreasuryQuote,
  projectTreasuryReceipt,
} from "./businessTreasuryFxProjection.ts";
import {
  assertNoInternalUuid,
  type BusinessTreasuryRow,
  currency,
  decimal,
  first,
  invalidTreasuryResult,
  iso,
  minorUnit,
  money,
  mutation,
  oneRow,
  publicKey,
  rows,
  token,
} from "./businessTreasuryProjectionSupport.ts";

export function projectBusinessTreasurySnapshot(
  value: unknown,
): BusinessTreasurySnapshotV1 {
  assertNoInternalUuid(value);
  const root = oneRow(value, "Business treasury snapshot");
  return Object.freeze({
    businessKey: publicKey(
      first(root, "business_key", "businessKey"),
      BUSINESS_TREASURY_BUSINESS_KEY_PATTERN,
      "Business key",
    ),
    reportingCurrencyCode: currency(
      first(root, "reporting_currency_code", "reportingCurrencyCode"),
      "reporting currency",
    ),
    generatedAt: iso(
      first(root, "generated_at", "generatedAt"),
      "treasury generation time",
    ),
    accounts: Object.freeze(
      rows(first(root, "accounts"), "Business treasury accounts")
        .map(projectTreasuryAccount),
    ),
    rates: Object.freeze(
      rows(first(root, "rates"), "Business treasury rates")
        .map(projectTreasuryRate),
    ),
    orders: Object.freeze(
      rows(first(root, "orders"), "Business treasury orders")
        .map(projectTreasuryOrder),
    ),
    receipts: Object.freeze(
      rows(first(root, "receipts"), "Business treasury receipts")
        .map(projectTreasuryReceipt),
    ),
  });
}

export function projectBusinessTreasuryAccountMutation(
  value: unknown,
): BusinessTreasuryMutationResultV1<BusinessTreasuryAccountV1> {
  return mutation(
    value,
    ["account"],
    projectTreasuryAccount,
    "Business treasury account",
  );
}

export function projectBusinessTreasuryQuoteMutation(
  value: unknown,
): BusinessTreasuryMutationResultV1<BusinessTreasuryFxQuoteV1> {
  return mutation(
    value,
    ["quote", "fx_quote", "fxQuote"],
    projectTreasuryQuote,
    "Business treasury FX quote",
  );
}

export function projectBusinessTreasuryOrderMutation(
  value: unknown,
  label: string,
): BusinessTreasuryMutationResultV1<BusinessTreasuryFxOrderV1> {
  return mutation(
    value,
    ["order", "fx_order", "fxOrder"],
    projectTreasuryOrder,
    label,
  );
}

function projectTreasuryAccount(
  row: BusinessTreasuryRow,
): BusinessTreasuryAccountV1 {
  const currencyCode = currency(
    first(row, "currency_code", "currencyCode"),
    "account currency",
  );
  const precision = minorUnit(
    first(row, "minor_unit", "minorUnit", "precision"),
    "account precision",
  );
  const accountKind = String(
    first(row, "account_kind", "accountKind") ?? "",
  ).trim().toLowerCase();
  if (accountKind !== "checking") invalidTreasuryResult("account kind");
  return Object.freeze({
    accountKey: publicKey(
      first(row, "account_key", "accountKey", "public_key", "publicKey"),
      BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN,
      "account key",
    ),
    accountKind,
    status: token(first(row, "status"), "account status", 40),
    currencyCode,
    precision,
    posted: money(
      first(row, "posted_amount", "postedAmount"),
      currencyCode,
      precision,
      "posted amount",
    ),
    held: money(
      first(row, "held_amount", "heldAmount"),
      currencyCode,
      precision,
      "held amount",
    ),
    available: money(
      first(row, "available_amount", "availableAmount"),
      currencyCode,
      precision,
      "available amount",
    ),
  });
}

function projectTreasuryRate(row: BusinessTreasuryRow): BusinessTreasuryRateV1 {
  return Object.freeze({
    fixingKey: publicKey(
      first(row, "fixing_key", "fixingKey"),
      BUSINESS_TREASURY_FIXING_KEY_PATTERN,
      "fixing key",
    ),
    sourceCurrencyCode: currency(
      first(row, "source_currency_code", "sourceCurrencyCode"),
      "rate source currency",
    ),
    targetCurrencyCode: currency(
      first(row, "target_currency_code", "targetCurrencyCode"),
      "rate target currency",
    ),
    referenceRate: decimal(
      first(row, "reference_rate", "referenceRate"),
      "reference rate",
      true,
    ),
    effectiveAt: iso(
      first(row, "effective_at", "effectiveAt"),
      "rate effective time",
    ),
    calculatedAt: iso(
      first(row, "calculated_at", "calculatedAt"),
      "rate calculation time",
    ),
    policyVersion: token(
      first(row, "policy_version", "policyVersion"),
      "rate policy version",
      120,
    ),
  });
}
