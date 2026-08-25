import type {
  FxCountryCode,
  FxFixingEngineInput,
  FxFixingEngineResult,
  FxNationalCurrencyCode,
} from "../contracts/fxFixingContracts.ts";
import { FX_NATIONAL_CURRENCY_DEFINITIONS } from "../contracts/fxFixingContracts.ts";
import {
  type FxFixingApplyResult,
  type FxFixingClaim,
  type FxFixingLoadedInput,
  FxFixingRunnerError,
  type FxFixingRunnerRepository,
} from "../services/fxFixingRunner.ts";

interface SupabaseRpcError {
  readonly code?: string;
  readonly message: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseRpcResponse<T> {
  readonly data: T | null;
  readonly error: SupabaseRpcError | null;
}

export interface FxFixingSupabaseClient {
  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<SupabaseRpcResponse<T>>;
}

export interface FxFixingOrchestratorRepository
  extends FxFixingRunnerRepository {
  verifySchedulerToken(input: {
    readonly schedulerName: string;
    readonly tokenSha256: string;
  }): Promise<boolean>;
}

interface ClaimRpcRow {
  readonly game_session_id?: unknown;
  readonly fixing_local_date?: unknown;
  readonly fixing_effective_at?: unknown;
  readonly game_timezone?: unknown;
  readonly lease_token?: unknown;
}

interface LoadRpcRow {
  readonly input_hash?: unknown;
  readonly engine_input?: unknown;
  readonly load_fx_fixing_input_v1?: unknown;
}

interface ApplyRpcRow {
  readonly outcome?: unknown;
  readonly fixing_public_id?: unknown;
  readonly currency_values_inserted?: unknown;
  readonly shocks_consumed?: unknown;
}

const NATIONAL_CURRENCY_CODES = new Set<string>(
  FX_NATIONAL_CURRENCY_DEFINITIONS.map((value) => value.currencyCode),
);
const COUNTRY_CODES = new Set<string>(
  FX_NATIONAL_CURRENCY_DEFINITIONS.map((value) => value.countryCode),
);

export class SupabaseFxFixingRepository
  implements FxFixingOrchestratorRepository {
  constructor(private readonly client: FxFixingSupabaseClient) {}

  async verifySchedulerToken(input: {
    readonly schedulerName: string;
    readonly tokenSha256: string;
  }): Promise<boolean> {
    const response = await this.client.rpc<boolean>(
      "verify_runtime_scheduler_token_v1",
      {
        p_scheduler_name: input.schedulerName,
        p_token_sha256: input.tokenSha256,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_scheduler_authorization_failed");
    }
    return response.data === true;
  }

  async claimDueFixings(input: {
    readonly claimedAt: string;
    readonly limit: number;
    readonly leaseOwner: string;
    readonly leaseSeconds: number;
  }): Promise<readonly FxFixingClaim[]> {
    const response = await this.client.rpc<readonly ClaimRpcRow[]>(
      "claim_due_fx_games_v1",
      {
        p_now: input.claimedAt,
        p_limit: input.limit,
        p_lease_owner: input.leaseOwner,
        p_lease_seconds: input.leaseSeconds,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_claim_failed");
    }
    if (!Array.isArray(response.data)) {
      throw invalidRpcResult("FX fixing claim returned an invalid result.");
    }
    if (response.data.length > input.limit) {
      throw invalidRpcResult("FX fixing claim exceeded the requested limit.");
    }
    return Object.freeze(response.data.map(mapClaim));
  }

  async loadFixingInput(
    claim: FxFixingClaim,
  ): Promise<FxFixingLoadedInput> {
    const response = await this.client.rpc<readonly LoadRpcRow[] | LoadRpcRow>(
      "load_fx_fixing_input_v1",
      {
        p_game_session_id: claim.gameSessionId,
        p_fixing_local_date: claim.fixingLocalDate,
        p_lease_token: claim.leaseToken,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_input_load_failed");
    }

    const row = firstRow(response.data);
    const nested = isRecord(row.load_fx_fixing_input_v1)
      ? row.load_fx_fixing_input_v1
      : row;
    const inputHash = requiredHash(nested.input_hash, "input_hash");
    const engineInput = mapEngineInput(nested.engine_input);

    if (
      engineInput.gameSessionId !== claim.gameSessionId ||
      engineInput.fixingLocalDate !== claim.fixingLocalDate
    ) {
      throw new FxFixingRunnerError(
        "fx_fixing_input_scope_mismatch",
        "FX fixing input did not match its claimed game/date scope.",
        500,
        false,
      );
    }

    return Object.freeze({ engineInput, inputHash });
  }

  async applyFixing(input: {
    readonly claim: FxFixingClaim;
    readonly fixing: FxFixingEngineResult;
    readonly inputHash: string;
    readonly calculatedAt: string;
  }): Promise<FxFixingApplyResult> {
    const response = await this.client.rpc<
      readonly ApplyRpcRow[] | ApplyRpcRow
    >(
      "apply_fx_fixing_v1",
      {
        p_game_session_id: input.claim.gameSessionId,
        p_fixing_local_date: input.claim.fixingLocalDate,
        p_fixing_effective_at: input.claim.fixingEffectiveAt,
        p_lease_token: input.claim.leaseToken,
        p_input_hash: input.inputHash,
        p_calculated_at: input.calculatedAt,
        p_fixing_result: input.fixing,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_apply_failed");
    }

    const row = firstRow(response.data);
    const outcome = row.outcome;
    if (outcome !== "applied" && outcome !== "replayed") {
      throw invalidRpcResult("FX fixing apply returned an invalid outcome.");
    }

    return Object.freeze({
      outcome,
      fixingPublicId: requiredSafeId(
        row.fixing_public_id,
        "fixing_public_id",
      ),
      currencyValuesInserted: requiredCount(
        row.currency_values_inserted,
        "currency_values_inserted",
      ),
      shocksConsumed: requiredCount(row.shocks_consumed, "shocks_consumed"),
    });
  }

  async failFixingClaim(input: {
    readonly claim: FxFixingClaim;
    readonly errorCode: string;
    readonly failedAt: string;
  }): Promise<void> {
    const response = await this.client.rpc<boolean>(
      "fail_fx_fixing_claim_v1",
      {
        p_game_session_id: input.claim.gameSessionId,
        p_fixing_local_date: input.claim.fixingLocalDate,
        p_lease_token: input.claim.leaseToken,
        p_error_code: input.errorCode,
        p_failed_at: input.failedAt,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_failure_record_failed");
    }
    if (response.data !== true) {
      throw invalidRpcResult(
        "FX fixing failure record did not confirm the claimed scope.",
      );
    }
  }
}

function mapClaim(row: ClaimRpcRow): FxFixingClaim {
  return Object.freeze({
    gameSessionId: requiredUuid(row.game_session_id, "game_session_id"),
    fixingLocalDate: requiredLocalDate(
      row.fixing_local_date,
      "fixing_local_date",
    ),
    fixingEffectiveAt: requiredTimestamp(
      row.fixing_effective_at,
      "fixing_effective_at",
    ),
    gameTimezone: requiredTimezone(row.game_timezone, "game_timezone"),
    leaseToken: requiredUuid(row.lease_token, "lease_token"),
  });
}

function mapEngineInput(value: unknown): FxFixingEngineInput {
  if (!isRecord(value)) {
    throw invalidRpcResult("FX fixing engine input must be a JSON object.");
  }

  const currencies = value.currencies;
  const storyShocks = value.storyShocks ?? [];
  if (!Array.isArray(currencies) || !Array.isArray(storyShocks)) {
    throw invalidRpcResult("FX fixing currencies or Story shocks are invalid.");
  }
  return Object.freeze({
    gameSessionId: requiredUuid(value.gameSessionId, "gameSessionId"),
    fixingLocalDate: requiredLocalDate(
      value.fixingLocalDate,
      "fixingLocalDate",
    ),
    policyVersion: requiredSafeId(value.policyVersion, "policyVersion"),
    policy: mapEnginePolicy(value.policy),
    currencies: Object.freeze(
      currencies.map((currency, index) => mapEngineCurrency(currency, index)),
    ),
    storyShocks: Object.freeze(
      storyShocks.map((shock, index) => mapStoryShock(shock, index)),
    ),
  });
}

function mapEnginePolicy(
  value: unknown,
): FxFixingEngineInput["policy"] {
  if (!isRecord(value) || !isRecord(value.parameters)) {
    throw invalidRpcResult("FX fixing policy evidence is invalid.");
  }
  const parameters = value.parameters;
  if (
    !isRecord(parameters.gdp) || !isRecord(parameters.inflation) ||
    !isRecord(parameters.realInterest) || !isRecord(parameters.trade) ||
    !isRecord(parameters.confidenceStability)
  ) {
    throw invalidRpcResult("FX fixing policy parameters are invalid.");
  }
  if (value.fixingLocalTime !== "08:00:00") {
    throw invalidRpcResult("FX fixing policy boundary is invalid.");
  }
  if (parameters.numeraireCurrencyCode !== "ECO") {
    throw invalidRpcResult("FX fixing policy numeraire is invalid.");
  }

  return Object.freeze({
    fixingLocalTime: "08:00:00" as const,
    normalMovementCapBasisPoints: requiredInteger(
      value.normalMovementCapBasisPoints,
      "policy.normalMovementCapBasisPoints",
    ),
    crisisMovementCapBasisPoints: requiredInteger(
      value.crisisMovementCapBasisPoints,
      "policy.crisisMovementCapBasisPoints",
    ),
    parameters: Object.freeze({
      numeraireCurrencyCode: "ECO" as const,
      gdp: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.gdp.capBasisPoints,
          "policy.parameters.gdp.capBasisPoints",
        ),
        levelWeightBasisPoints: requiredInteger(
          parameters.gdp.levelWeightBasisPoints,
          "policy.parameters.gdp.levelWeightBasisPoints",
        ),
        growthWeightBasisPoints: requiredInteger(
          parameters.gdp.growthWeightBasisPoints,
          "policy.parameters.gdp.growthWeightBasisPoints",
        ),
        levelNormalizer: requiredDecimalText(
          parameters.gdp.levelNormalizer,
          "policy.parameters.gdp.levelNormalizer",
        ),
        growthNormalizer: requiredDecimalText(
          parameters.gdp.growthNormalizer,
          "policy.parameters.gdp.growthNormalizer",
        ),
      }),
      inflation: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.inflation.capBasisPoints,
          "policy.parameters.inflation.capBasisPoints",
        ),
        normalizer: requiredDecimalText(
          parameters.inflation.normalizer,
          "policy.parameters.inflation.normalizer",
        ),
      }),
      realInterest: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.realInterest.capBasisPoints,
          "policy.parameters.realInterest.capBasisPoints",
        ),
        normalizer: requiredDecimalText(
          parameters.realInterest.normalizer,
          "policy.parameters.realInterest.normalizer",
        ),
      }),
      trade: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.trade.capBasisPoints,
          "policy.parameters.trade.capBasisPoints",
        ),
        tradeBalanceWeightBasisPoints: requiredInteger(
          parameters.trade.tradeBalanceWeightBasisPoints,
          "policy.parameters.trade.tradeBalanceWeightBasisPoints",
        ),
        exportStrengthWeightBasisPoints: requiredInteger(
          parameters.trade.exportStrengthWeightBasisPoints,
          "policy.parameters.trade.exportStrengthWeightBasisPoints",
        ),
        inverseImportDependencyWeightBasisPoints: requiredInteger(
          parameters.trade.inverseImportDependencyWeightBasisPoints,
          "policy.parameters.trade.inverseImportDependencyWeightBasisPoints",
        ),
        tradeBalanceNormalizer: requiredDecimalText(
          parameters.trade.tradeBalanceNormalizer,
          "policy.parameters.trade.tradeBalanceNormalizer",
        ),
        exportStrengthNormalizer: requiredDecimalText(
          parameters.trade.exportStrengthNormalizer,
          "policy.parameters.trade.exportStrengthNormalizer",
        ),
        importDependencyNormalizer: requiredDecimalText(
          parameters.trade.importDependencyNormalizer,
          "policy.parameters.trade.importDependencyNormalizer",
        ),
      }),
      confidenceStability: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.confidenceStability.capBasisPoints,
          "policy.parameters.confidenceStability.capBasisPoints",
        ),
        signalWeightBasisPoints: requiredInteger(
          parameters.confidenceStability.signalWeightBasisPoints,
          "policy.parameters.confidenceStability.signalWeightBasisPoints",
        ),
        confidenceNormalizer: requiredDecimalText(
          parameters.confidenceStability.confidenceNormalizer,
          "policy.parameters.confidenceStability.confidenceNormalizer",
        ),
        indexNormalizer: requiredDecimalText(
          parameters.confidenceStability.indexNormalizer,
          "policy.parameters.confidenceStability.indexNormalizer",
        ),
      }),
      exchangeRateIndexWeightBasisPoints: requiredZero(
        parameters.exchangeRateIndexWeightBasisPoints,
        "policy.parameters.exchangeRateIndexWeightBasisPoints",
      ),
      bilateralTradeExposureWeightBasisPoints: requiredZero(
        parameters.bilateralTradeExposureWeightBasisPoints,
        "policy.parameters.bilateralTradeExposureWeightBasisPoints",
      ),
    }),
  });
}

function mapEngineCurrency(
  value: unknown,
  index: number,
): FxFixingEngineInput["currencies"][number] {
  if (!isRecord(value)) {
    throw invalidRpcResult(`FX fixing currency ${index} is invalid.`);
  }
  return Object.freeze({
    currencyCode: requiredNationalCurrencyCode(
      value.currencyCode,
      `currencies[${index}].currencyCode`,
    ),
    countryCode: requiredCountryCode(
      value.countryCode,
      `currencies[${index}].countryCode`,
    ),
    previousUnitsPerEco: requiredDecimalText(
      value.previousUnitsPerEco,
      `currencies[${index}].previousUnitsPerEco`,
    ),
    snapshotId: requiredUuid(
      value.snapshotId,
      `currencies[${index}].snapshotId`,
    ),
    snapshotSequence: requiredNonNegativeInteger(
      value.snapshotSequence,
      `currencies[${index}].snapshotSequence`,
    ),
    realGdpIndex: requiredDecimalText(
      value.realGdpIndex,
      `currencies[${index}].realGdpIndex`,
    ),
    gdpGrowthRate: requiredDecimalText(
      value.gdpGrowthRate,
      `currencies[${index}].gdpGrowthRate`,
    ),
    inflationRate: requiredDecimalText(
      value.inflationRate,
      `currencies[${index}].inflationRate`,
    ),
    interestRate: requiredDecimalText(
      value.interestRate,
      `currencies[${index}].interestRate`,
    ),
    consumerConfidenceIndex: requiredDecimalText(
      value.consumerConfidenceIndex,
      `currencies[${index}].consumerConfidenceIndex`,
    ),
    businessConfidenceIndex: requiredDecimalText(
      value.businessConfidenceIndex,
      `currencies[${index}].businessConfidenceIndex`,
    ),
    importDependencyIndex: requiredDecimalText(
      value.importDependencyIndex,
      `currencies[${index}].importDependencyIndex`,
    ),
    currencyStabilityIndex: requiredDecimalText(
      value.currencyStabilityIndex,
      `currencies[${index}].currencyStabilityIndex`,
    ),
    tradeBalanceIndex: requiredDecimalText(
      value.tradeBalanceIndex,
      `currencies[${index}].tradeBalanceIndex`,
    ),
    exportStrengthIndex: requiredDecimalText(
      value.exportStrengthIndex,
      `currencies[${index}].exportStrengthIndex`,
    ),
    marketRiskIndex: requiredDecimalText(
      value.marketRiskIndex,
      `currencies[${index}].marketRiskIndex`,
    ),
    politicalStabilityIndex: requiredDecimalText(
      value.politicalStabilityIndex,
      `currencies[${index}].politicalStabilityIndex`,
    ),
  });
}

function mapStoryShock(
  value: unknown,
  index: number,
): NonNullable<FxFixingEngineInput["storyShocks"]>[number] {
  if (!isRecord(value)) {
    throw invalidRpcResult(`FX Story shock ${index} is invalid.`);
  }
  return Object.freeze({
    shockId: requiredSafeId(value.shockId, `storyShocks[${index}].shockId`),
    currencyCode: requiredNationalCurrencyCode(
      value.currencyCode,
      `storyShocks[${index}].currencyCode`,
    ),
    basisPoints: requiredInteger(
      value.basisPoints,
      `storyShocks[${index}].basisPoints`,
    ),
  });
}

function firstRow(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isRecord(candidate)) {
    throw invalidRpcResult("FX fixing RPC returned no result row.");
  }
  return candidate;
}

function requiredUuid(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(text)
  ) {
    throw invalidRpcResult(`FX fixing ${field} is not a UUID.`);
  }
  return text;
}

function requiredHash(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a SHA-256 digest.`);
  }
  return text;
}

function requiredLocalDate(value: unknown, field: string): string {
  const text = requiredText(value, field);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    throw invalidRpcResult(`FX fixing ${field} is not a local date.`);
  }
  return text;
}

function requiredTimestamp(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!Number.isFinite(Date.parse(text))) {
    throw invalidRpcResult(`FX fixing ${field} is not a timestamp.`);
  }
  return text;
}

function requiredTimezone(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a timezone name.`);
  }
  return text;
}

function requiredCode(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a canonical code.`);
  }
  return text;
}

function requiredNationalCurrencyCode(
  value: unknown,
  field: string,
): FxNationalCurrencyCode {
  const code = requiredCode(value, field);
  if (!NATIONAL_CURRENCY_CODES.has(code)) {
    throw invalidRpcResult(`FX fixing ${field} is not a national currency.`);
  }
  return code as FxNationalCurrencyCode;
}

function requiredCountryCode(value: unknown, field: string): FxCountryCode {
  const code = requiredCode(value, field);
  if (!COUNTRY_CODES.has(code)) {
    throw invalidRpcResult(`FX fixing ${field} is not a canonical country.`);
  }
  return code as FxCountryCode;
}

function requiredSafeId(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a safe identifier.`);
  }
  return text;
}

function requiredDecimalText(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not exact decimal text.`);
  }
  return text;
}

function requiredInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw invalidRpcResult(`FX fixing ${field} is not an integer.`);
  }
  return number;
}

function requiredNonNegativeInteger(value: unknown, field: string): number {
  const number = requiredInteger(value, field);
  if (number < 0) {
    throw invalidRpcResult(`FX fixing ${field} is negative.`);
  }
  return number;
}

function requiredZero(value: unknown, field: string): 0 {
  if (requiredInteger(value, field) !== 0) {
    throw invalidRpcResult(`FX fixing ${field} must be zero.`);
  }
  return 0;
}

function requiredCount(value: unknown, field: string): number {
  const number = requiredInteger(value, field);
  if (number < 0) {
    throw invalidRpcResult(`FX fixing ${field} is negative.`);
  }
  return number;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw invalidRpcResult(`FX fixing ${field} is not text.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidRpcResult(message: string): FxFixingRunnerError {
  return new FxFixingRunnerError(
    "fx_fixing_rpc_result_invalid",
    message,
    500,
    false,
  );
}

function mapRpcError(
  error: SupabaseRpcError,
  fallbackCode: string,
): FxFixingRunnerError {
  const normalized = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    normalized.includes("does not exist") ||
    normalized.includes("schema cache")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_schema_not_applied",
      "Canonical FX fixing schema is not available.",
      500,
      false,
    );
  }
  if (
    normalized.includes("fx_macro_snapshot_set_incomplete") ||
    normalized.includes("fx_fixing_input_incomplete") ||
    normalized.includes("fx_input_macro_cohort_incomplete") ||
    normalized.includes("fx_input_currency_mapping_incomplete")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_input_incomplete",
      "A complete macro snapshot set is not available for this fixing.",
      409,
      true,
    );
  }
  if (
    normalized.includes("fx_fixing_claim_stale") ||
    normalized.includes("fx_fixing_lease")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_claim_stale",
      "The FX fixing claim is no longer current.",
      409,
      true,
    );
  }
  if (
    error.code === "23505" ||
    normalized.includes("fx_input_hash_conflict") ||
    normalized.includes("fx_fixing_conflict")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_conflict",
      "The FX fixing conflicts with existing immutable evidence.",
      409,
      false,
    );
  }

  return new FxFixingRunnerError(
    fallbackCode,
    "Canonical FX fixing persistence failed.",
    500,
    true,
  );
}
