import type {
  FinancialMarketInstrumentDefinition,
} from "../contracts/financialMarketContracts.ts";
import {
  isFinancialMarketPublicId,
} from "../contracts/financialMarketContracts.ts";

export interface FinancialMarketPublicPayloadPolicy {
  readonly maximumDepth: number;
  readonly maximumObjectKeys: number;
  readonly maximumArrayLength: number;
  readonly maximumStringLength: number;
  readonly maximumNumericMagnitude: number;
  readonly maximumNumericDecimalPlaces: number;
}

export interface FinancialMarketPublicPayloadIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface FinancialMarketPublicPayloadReport {
  readonly valid: boolean;
  readonly issues: readonly FinancialMarketPublicPayloadIssue[];
}

export interface FinancialMarketActivationDecision {
  readonly allowed: false;
  readonly reasons: readonly string[];
  readonly shortSellingSupported: false;
  readonly derivativesSupported: false;
  readonly realWorldFeedsSupported: false;
  readonly physicalDeliverySupported: false;
}

export const DEFAULT_FINANCIAL_MARKET_PUBLIC_PAYLOAD_POLICY:
  FinancialMarketPublicPayloadPolicy = Object.freeze({
    maximumDepth: 12,
    maximumObjectKeys: 100,
    maximumArrayLength: 500,
    maximumStringLength: 600,
    maximumNumericMagnitude: 1_000_000_000_000_000,
    maximumNumericDecimalPlaces: 8,
  });

export const FINANCIAL_MARKET_PROHIBITED_FEATURES = Object.freeze({
  shortSellingSupported: false,
  derivativesSupported: false,
  realWorldFeedsSupported: false,
  physicalDeliverySupported: false,
  unrestrictedComplexConvertiblePricingSupported: false,
  automaticFullUniverseActivationSupported: false,
});

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const FORBIDDEN_PUBLIC_KEYS = new Set([
  "id",
  "uuid",
  "gameSessionId",
  "playerSessionId",
  "playerId",
  "sessionToken",
  "sessionTokenHash",
  "accessCode",
  "serviceRoleKey",
  "serviceRole",
  "password",
  "credential",
  "credentialHash",
  "internalId",
  "internalUuid",
]);
const SERVER_SETTLEMENT_KEYS = new Set([
  "executionPrice",
  "grossValue",
  "feeAmount",
  "settlementValue",
  "cashDelta",
  "assetDelta",
  "cashBalanceAfter",
  "holdingQuantityAfter",
  "averageCostAfter",
]);
const APPROVED_INSTRUMENT_TYPES = new Set<FinancialMarketInstrumentDefinition["instrumentType"]>([
  "common_equity",
  "preferred_equity",
  "convertible_preferred",
  "corporate_bond",
  "sovereign_bond",
  "agency_bond",
  "etf",
  "listed_fund",
  "listed_trust",
  "broad_market_index",
  "country_index",
  "sector_index",
  "industry_index",
  "commodity_benchmark",
  "economic_reference_benchmark",
]);

export function validateFinancialMarketPublicPayload(
  payload: unknown,
  policy: FinancialMarketPublicPayloadPolicy =
    DEFAULT_FINANCIAL_MARKET_PUBLIC_PAYLOAD_POLICY,
): FinancialMarketPublicPayloadReport {
  validatePolicy(policy);
  const issues: FinancialMarketPublicPayloadIssue[] = [];
  inspect(payload, "$", 0, policy, issues);
  return {
    valid: issues.length === 0,
    issues: [...issues].sort((a, b) =>
      a.path.localeCompare(b.path) || a.code.localeCompare(b.code)
    ),
  };
}

export function assertBrowserOrderRequestOwnsNoSettlementValues(
  requestBody: unknown,
): void {
  if (!isPlainObject(requestBody)) {
    throw new Error("Order request body must be an object.");
  }
  const offending = Object.keys(requestBody).filter((key) =>
    SERVER_SETTLEMENT_KEYS.has(key)
  ).sort();
  if (offending.length > 0) {
    throw new Error(
      `Browser-controlled settlement fields are prohibited: ${offending.join(",")}.`,
    );
  }
  const report = validateFinancialMarketPublicPayload(requestBody);
  if (!report.valid) {
    throw new Error(
      `Order request violates public contract: ${report.issues.map((entry) =>
        `${entry.path}:${entry.code}`
      ).join(",")}`,
    );
  }
}

export function decideFinancialMarketActivation(
  instrument: FinancialMarketInstrumentDefinition,
  input: {
    readonly issuerActive: boolean;
    readonly listingReviewed: boolean;
    readonly sourceChecksumVerified: boolean;
    readonly humanApprovalRecorded: boolean;
  },
): FinancialMarketActivationDecision {
  const reasons: string[] = [];
  if (!isFinancialMarketPublicId(instrument.instrumentPublicId) ||
    !isFinancialMarketPublicId(instrument.issuerPublicId)) {
    reasons.push("malformed_public_identity");
  }
  if (!APPROVED_INSTRUMENT_TYPES.has(instrument.instrumentType)) {
    reasons.push("unsupported_instrument_type");
  }
  if (instrument.status !== "approved_inactive") {
    reasons.push("definition_not_approved_inactive");
  }
  if (instrument.activationAuthorized !== false) {
    reasons.push("definition_activation_flag_invalid");
  }
  if (!input.issuerActive) reasons.push("issuer_inactive");
  if (!input.listingReviewed) reasons.push("listing_not_reviewed");
  if (!input.sourceChecksumVerified) reasons.push("source_checksum_unverified");
  if (!input.humanApprovalRecorded) reasons.push("human_approval_missing");
  reasons.push("controller_hold_activation_prohibited");
  return {
    allowed: false,
    reasons: [...new Set(reasons)].sort(),
    shortSellingSupported: false,
    derivativesSupported: false,
    realWorldFeedsSupported: false,
    physicalDeliverySupported: false,
  };
}

export function assertInstrumentTradableUnderPurePolicy(input: {
  readonly instrument: FinancialMarketInstrumentDefinition;
  readonly issuerActive: boolean;
  readonly listingActive: boolean;
  readonly gameActive: boolean;
  readonly marketPaused: boolean;
}): void {
  if (input.instrument.status !== "approved_inactive" ||
    input.instrument.activationAuthorized !== false) {
    throw new Error("instrument_definition_not_approved");
  }
  if (!input.issuerActive) throw new Error("issuer_inactive");
  if (!input.listingActive) throw new Error("listing_inactive");
  if (!input.gameActive) throw new Error("game_ended");
  if (input.marketPaused) throw new Error("market_paused");
  throw new Error("controller_hold_runtime_trading_prohibited");
}

export function assertProhibitedFinancialMarketFeaturesRemainDisabled(
  value: typeof FINANCIAL_MARKET_PROHIBITED_FEATURES =
    FINANCIAL_MARKET_PROHIBITED_FEATURES,
): void {
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled !== false) throw new Error(`${key} must remain disabled.`);
  }
}

function inspect(
  value: unknown,
  path: string,
  depth: number,
  policy: FinancialMarketPublicPayloadPolicy,
  issues: FinancialMarketPublicPayloadIssue[],
): void {
  if (depth > policy.maximumDepth) {
    issues.push(issue("payload_depth_exceeded", path, "Payload nesting is too deep."));
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > policy.maximumStringLength) {
      issues.push(issue("string_too_long", path, "String exceeds the public bound."));
    }
    if (UUID_PATTERN.test(value)) {
      issues.push(issue("internal_uuid_exposed", path, "Public payload contains a UUID."));
    }
    if (/^-?(?:0|[1-9][0-9]*)\.[0-9]+$/.test(value)) {
      const decimals = value.split(".")[1].length;
      if (decimals > policy.maximumNumericDecimalPlaces) {
        issues.push(issue("numeric_precision_exceeded", path, "Decimal string precision is too high."));
      }
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > policy.maximumNumericMagnitude) {
      issues.push(issue("numeric_value_out_of_bounds", path, "Numeric value is invalid or too large."));
      return;
    }
    const rendered = value.toString();
    if (rendered.includes(".") && !/[eE]/.test(rendered) &&
      rendered.split(".")[1].length > policy.maximumNumericDecimalPlaces) {
      issues.push(issue("numeric_precision_exceeded", path, "Numeric precision is too high."));
    }
    return;
  }
  if (typeof value === "bigint" || typeof value === "symbol" ||
    typeof value === "function" || value === undefined) {
    issues.push(issue("unsupported_public_value", path, "Payload contains an unsupported value."));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > policy.maximumArrayLength) {
      issues.push(issue("array_too_long", path, "Array exceeds the public bound."));
    }
    value.slice(0, policy.maximumArrayLength + 1).forEach((entry, index) =>
      inspect(entry, `${path}[${index}]`, depth + 1, policy, issues)
    );
    return;
  }
  if (!isPlainObject(value)) {
    issues.push(issue("non_plain_public_object", path, "Payload object must be plain."));
    return;
  }
  const keys = Object.keys(value).sort();
  if (keys.length > policy.maximumObjectKeys) {
    issues.push(issue("object_too_wide", path, "Object has too many fields."));
  }
  for (const key of keys) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) {
      issues.push(issue("private_identifier_key", `${path}.${key}`, "Private identifier key is prohibited."));
    }
    inspect(value[key], `${path}.${key}`, depth + 1, policy, issues);
  }
}

function validatePolicy(policy: FinancialMarketPublicPayloadPolicy): void {
  if (!Number.isInteger(policy.maximumDepth) || policy.maximumDepth < 1 ||
    !Number.isInteger(policy.maximumObjectKeys) || policy.maximumObjectKeys < 1 ||
    !Number.isInteger(policy.maximumArrayLength) || policy.maximumArrayLength < 1 ||
    !Number.isInteger(policy.maximumStringLength) || policy.maximumStringLength < 1 ||
    !Number.isFinite(policy.maximumNumericMagnitude) || policy.maximumNumericMagnitude <= 0 ||
    !Number.isInteger(policy.maximumNumericDecimalPlaces) ||
    policy.maximumNumericDecimalPlaces < 0 || policy.maximumNumericDecimalPlaces > 12) {
    throw new Error("Public payload policy is invalid.");
  }
}

function issue(
  code: string,
  path: string,
  message: string,
): FinancialMarketPublicPayloadIssue {
  return { code, path, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
