import type {
  FxFixingEngineInput,
  FxFixingEngineResult,
} from "../contracts/fxFixingContracts.ts";

export interface FxFixingClaim {
  readonly gameSessionId: string;
  readonly fixingLocalDate: string;
  readonly fixingEffectiveAt: string;
  readonly gameTimezone: string;
  readonly leaseToken: string;
}

export interface FxFixingApplyResult {
  readonly outcome: "applied" | "replayed";
  readonly fixingPublicId: string;
  readonly currencyValuesInserted: number;
  readonly shocksConsumed: number;
}

export interface FxFixingLoadedInput {
  readonly engineInput: FxFixingEngineInput;
  readonly inputHash: string;
}

export interface FxFixingRunnerRepository {
  claimDueFixings(input: {
    readonly claimedAt: string;
    readonly limit: number;
    readonly leaseOwner: string;
    readonly leaseSeconds: number;
  }): Promise<readonly FxFixingClaim[]>;
  loadFixingInput(claim: FxFixingClaim): Promise<FxFixingLoadedInput>;
  applyFixing(input: {
    readonly claim: FxFixingClaim;
    readonly fixing: FxFixingEngineResult;
    readonly inputHash: string;
    readonly calculatedAt: string;
  }): Promise<FxFixingApplyResult>;
  failFixingClaim(input: {
    readonly claim: FxFixingClaim;
    readonly errorCode: string;
    readonly failedAt: string;
  }): Promise<void>;
}

export interface FxFixingRunnerResult {
  readonly dueCount: number;
  readonly appliedCount: number;
  readonly replayedCount: number;
  readonly failedCount: number;
  readonly failureRecordFailedCount: number;
  readonly failureCodes: readonly string[];
}

export type CalculateFxFixing = (
  input: FxFixingEngineInput,
) => FxFixingEngineResult;

export class FxFixingRunnerError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    status = 500,
    retryable = false,
  ) {
    super(message);
    this.name = "FxFixingRunnerError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export async function runFxFixingRunner(
  input: {
    readonly repository: FxFixingRunnerRepository;
    readonly calculate: CalculateFxFixing;
    readonly claimedAt: string;
    readonly runId: string;
    readonly limit?: number;
    readonly leaseSeconds?: number;
  },
  dependencies: {
    readonly now?: () => Date;
  } = {},
): Promise<FxFixingRunnerResult> {
  // Keep a full five-minute lease for a deliberately small sequential batch.
  // This leaves twelve seconds per game before a later worker may reclaim it.
  const limit = input.limit ?? 25;
  const leaseSeconds = input.leaseSeconds ?? 300;

  if (
    !isTimestamp(input.claimedAt) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(input.runId) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(leaseSeconds) ||
    leaseSeconds < 30 ||
    leaseSeconds > 300
  ) {
    throw new FxFixingRunnerError(
      "invalid_fx_fixing_runner_input",
      "FX fixing runner input is invalid.",
      400,
      false,
    );
  }

  const claimed = await input.repository.claimDueFixings({
    claimedAt: input.claimedAt,
    limit,
    leaseOwner: input.runId,
    leaseSeconds,
  });
  const ordered = [...claimed].sort((left, right) =>
    compareCodeUnits(left.fixingEffectiveAt, right.fixingEffectiveAt) ||
    compareCodeUnits(left.gameSessionId, right.gameSessionId)
  );
  assertDistinctClaims(ordered);

  let appliedCount = 0;
  let replayedCount = 0;
  let failureRecordFailedCount = 0;
  const failureCodes: string[] = [];
  const now = dependencies.now ?? (() => new Date());

  for (const claim of ordered) {
    try {
      const loaded = await input.repository.loadFixingInput(claim);
      const fixingInput = loaded.engineInput;
      assertInputScope(claim, fixingInput);
      if (!/^[0-9a-f]{64}$/.test(loaded.inputHash)) {
        throw new FxFixingRunnerError(
          "fx_fixing_input_hash_invalid",
          "FX fixing repository returned an invalid input evidence hash.",
          500,
          false,
        );
      }

      let fixing: FxFixingEngineResult;
      try {
        fixing = input.calculate(fixingInput);
      } catch (error) {
        throw new FxFixingRunnerError(
          readErrorCode(error, "fx_fixing_engine_failed"),
          "FX fixing calculation failed.",
          500,
          false,
        );
      }
      assertResultEvidence(claim, fixingInput, fixing);

      const canonicalInputJson = String(fixing.canonicalInputJson ?? "");
      if (!canonicalInputJson) {
        throw new FxFixingRunnerError(
          "fx_fixing_engine_result_invalid",
          "FX fixing calculation returned no canonical input evidence.",
          500,
          false,
        );
      }
      const calculatedAt = now().toISOString();
      const applied = await input.repository.applyFixing({
        claim,
        fixing,
        inputHash: loaded.inputHash,
        calculatedAt,
      });

      if (applied.outcome === "applied") {
        appliedCount += 1;
      } else if (applied.outcome === "replayed") {
        replayedCount += 1;
      } else {
        throw new FxFixingRunnerError(
          "fx_fixing_apply_result_invalid",
          "FX fixing persistence returned an invalid outcome.",
          500,
          false,
        );
      }
    } catch (error) {
      const errorCode = readErrorCode(error, "fx_fixing_runner_failed");
      failureCodes.push(errorCode);

      try {
        await input.repository.failFixingClaim({
          claim,
          errorCode,
          failedAt: safeNowIso(now),
        });
      } catch (_failureRecordError) {
        failureRecordFailedCount += 1;
      }
    }
  }

  return Object.freeze({
    dueCount: ordered.length,
    appliedCount,
    replayedCount,
    failedCount: failureCodes.length,
    failureRecordFailedCount,
    failureCodes: Object.freeze(failureCodes),
  });
}

function assertDistinctClaims(claims: readonly FxFixingClaim[]): void {
  const scopes = new Set<string>();
  for (const claim of claims) {
    const key = `${claim.gameSessionId}:${claim.fixingLocalDate}`;
    if (scopes.has(key)) {
      throw new FxFixingRunnerError(
        "duplicate_fx_fixing_claim",
        "FX fixing repository returned a duplicate game/date claim.",
        500,
        false,
      );
    }
    scopes.add(key);
  }
}

function assertInputScope(
  claim: FxFixingClaim,
  input: FxFixingEngineInput,
): void {
  if (
    input.gameSessionId !== claim.gameSessionId ||
    input.fixingLocalDate !== claim.fixingLocalDate
  ) {
    throw new FxFixingRunnerError(
      "fx_fixing_input_scope_mismatch",
      "FX fixing input did not match its claimed game/date scope.",
      500,
      false,
    );
  }
}

function assertResultEvidence(
  claim: FxFixingClaim,
  input: FxFixingEngineInput,
  result: FxFixingEngineResult,
): void {
  if (
    result.gameSessionId !== claim.gameSessionId ||
    result.fixingLocalDate !== claim.fixingLocalDate ||
    result.policyVersion !== input.policyVersion
  ) {
    throw new FxFixingRunnerError(
      "fx_fixing_result_evidence_mismatch",
      "FX fixing result did not match its claimed input evidence.",
      500,
      false,
    );
  }

  const expected = new Map<
    string,
    FxFixingEngineInput["currencies"][number] | null
  >([
    ["ECO", null],
  ]);
  for (const currency of input.currencies) {
    if (expected.has(currency.currencyCode)) throw invalidResultEvidence();
    expected.set(currency.currencyCode, currency);
  }
  if (result.values.length !== expected.size) throw invalidResultEvidence();

  const seen = new Set<string>();
  for (const value of result.values) {
    if (seen.has(value.currencyCode) || !expected.has(value.currencyCode)) {
      throw invalidResultEvidence();
    }
    seen.add(value.currencyCode);
    const source = expected.get(value.currencyCode) ?? null;
    if (source === null) {
      if (
        value.currencyCode !== "ECO" || value.countryCode !== null ||
        value.snapshotId !== null || value.snapshotSequence !== null ||
        value.previousUnitsPerEco !== "1.000000000000000000" ||
        value.unitsPerEco !== "1.000000000000000000" ||
        value.appliedStoryShockIds.length !== 0
      ) {
        throw invalidResultEvidence();
      }
      continue;
    }
    if (
      value.countryCode !== source.countryCode ||
      value.snapshotId !== source.snapshotId ||
      value.snapshotSequence !== source.snapshotSequence
    ) {
      throw invalidResultEvidence();
    }
  }
}

function invalidResultEvidence(): FxFixingRunnerError {
  return new FxFixingRunnerError(
    "fx_fixing_result_evidence_mismatch",
    "FX fixing result did not match its claimed input evidence.",
    500,
    false,
  );
}

function readErrorCode(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { readonly code?: unknown }).code === "string"
  ) {
    const code = (error as { readonly code: string }).code;
    if (/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(code)) return code;
  }
  return fallback;
}

function isTimestamp(value: string): boolean {
  return value.trim() === value && Number.isFinite(Date.parse(value));
}

function safeNowIso(now: () => Date): string {
  try {
    const value = now();
    return Number.isFinite(value.getTime())
      ? value.toISOString()
      : new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
