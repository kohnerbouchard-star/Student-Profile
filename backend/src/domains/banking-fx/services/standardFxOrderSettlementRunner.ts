export interface StandardFxOrderClaim {
  /**
   * The leased order is deliberately owner-neutral. Player-or-Business owner
   * resolution remains atomic inside the database settlement command.
   */
  readonly gameSessionId: string;
  readonly orderKey: string;
  readonly leaseToken: string;
  readonly settlesAt: string;
}

export interface StandardFxOrderCommandResult {
  readonly outcome: "applied" | "replayed";
  readonly orderKey: string;
  readonly status: "settled" | "failed";
}

export interface StandardFxOrderSettlementRepository {
  /** Claims every due standard order without filtering by owner family. */
  claimDueOrders(input: {
    readonly workerName: string;
    readonly limit: number;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<readonly StandardFxOrderClaim[]>;
  settleOrder(input: {
    readonly claim: StandardFxOrderClaim;
    readonly now: string;
  }): Promise<StandardFxOrderCommandResult>;
  failOrder(input: {
    readonly claim: StandardFxOrderClaim;
    readonly errorCode: string;
    readonly now: string;
  }): Promise<StandardFxOrderCommandResult>;
}

export interface StandardFxOrderSettlementResult {
  readonly claimedCount: number;
  readonly appliedCount: number;
  readonly replayedCount: number;
  readonly terminalFailedCount: number;
  readonly retryableFailedCount: number;
  readonly failureRecordFailedCount: number;
  readonly failedCount: number;
  readonly failureCodes: readonly string[];
}

export class StandardFxOrderSettlementError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500,
    readonly retryable = true,
    readonly terminal = false,
  ) {
    super(message);
    this.name = "StandardFxOrderSettlementError";
  }
}

export async function runStandardFxOrderSettlementBatch(
  input: {
    readonly repository: StandardFxOrderSettlementRepository;
    readonly workerName: string;
    readonly claimedAt: string;
    readonly limit?: number;
    readonly leaseSeconds?: number;
  },
  dependencies: { readonly now?: () => Date } = {},
): Promise<StandardFxOrderSettlementResult> {
  const limit = input.limit ?? 25;
  const leaseSeconds = input.leaseSeconds ?? 300;
  if (
    !isTimestamp(input.claimedAt) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(input.workerName) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger(leaseSeconds) ||
    leaseSeconds < 15 ||
    leaseSeconds > 300
  ) {
    throw new StandardFxOrderSettlementError(
      "invalid_standard_fx_order_settlement_input",
      "Standard FX order settlement input is invalid.",
      400,
      false,
    );
  }

  const claims = await input.repository.claimDueOrders({
    workerName: input.workerName,
    limit,
    leaseSeconds,
    now: input.claimedAt,
  });
  const ordered = [...claims].sort((left, right) =>
    compare(left.settlesAt, right.settlesAt) ||
    compare(left.orderKey, right.orderKey)
  );
  assertClaims(ordered, input.claimedAt, limit);

  let appliedCount = 0;
  let replayedCount = 0;
  let terminalFailedCount = 0;
  let retryableFailedCount = 0;
  let failureRecordFailedCount = 0;
  const failureCodes: string[] = [];
  const now = dependencies.now ?? (() => new Date());

  for (const claim of ordered) {
    try {
      const result = await input.repository.settleOrder({
        claim,
        now: safeNowIso(now),
      });
      assertCommandResult(result, claim, "settled");
      if (result.outcome === "applied") appliedCount += 1;
      else replayedCount += 1;
    } catch (error) {
      const failure = normalizeFailure(error);
      failureCodes.push(failure.code);
      if (!failure.terminal) {
        retryableFailedCount += 1;
        continue;
      }

      try {
        const failed = await input.repository.failOrder({
          claim,
          errorCode: failure.code,
          now: safeNowIso(now),
        });
        assertCommandResult(failed, claim, "failed");
        terminalFailedCount += 1;
      } catch {
        failureRecordFailedCount += 1;
      }
    }
  }

  return Object.freeze({
    claimedCount: ordered.length,
    appliedCount,
    replayedCount,
    terminalFailedCount,
    retryableFailedCount,
    failureRecordFailedCount,
    failedCount: failureCodes.length,
    failureCodes: Object.freeze(failureCodes),
  });
}

function assertClaims(
  claims: readonly StandardFxOrderClaim[],
  claimedAt: string,
  limit: number,
): void {
  if (claims.length > limit) throw invalidClaimResult();
  const orderKeys = new Set<string>();
  const leaseTokens = new Set<string>();
  for (const claim of claims) {
    if (
      !isUuid(claim.gameSessionId) ||
      !/^fxo_[0-9a-f]{32}$/u.test(claim.orderKey) ||
      !isUuid(claim.leaseToken) ||
      !isTimestamp(claim.settlesAt) ||
      Date.parse(claim.settlesAt) > Date.parse(claimedAt) ||
      orderKeys.has(claim.orderKey) ||
      leaseTokens.has(claim.leaseToken)
    ) throw invalidClaimResult();
    orderKeys.add(claim.orderKey);
    leaseTokens.add(claim.leaseToken);
  }
}

function assertCommandResult(
  result: StandardFxOrderCommandResult,
  claim: StandardFxOrderClaim,
  expectedStatus: "settled" | "failed",
): void {
  if (
    result.orderKey !== claim.orderKey ||
    result.status !== expectedStatus ||
    (result.outcome !== "applied" && result.outcome !== "replayed")
  ) {
    throw new StandardFxOrderSettlementError(
      "standard_fx_order_command_result_invalid",
      "Standard FX order command returned an invalid result.",
    );
  }
}

function normalizeFailure(error: unknown): StandardFxOrderSettlementError {
  if (error instanceof StandardFxOrderSettlementError) return error;
  return new StandardFxOrderSettlementError(
    "standard_fx_order_settlement_failed",
    "Standard FX order settlement failed.",
  );
}

function invalidClaimResult(): StandardFxOrderSettlementError {
  return new StandardFxOrderSettlementError(
    "standard_fx_order_claim_result_invalid",
    "Standard FX order claim returned an invalid result.",
  );
}

function safeNowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new StandardFxOrderSettlementError(
      "banking_fx_orchestrator_clock_invalid",
      "Banking FX orchestrator clock returned an invalid timestamp.",
    );
  }
  return value.toISOString();
}

function isTimestamp(value: string): boolean {
  return typeof value === "string" && value.length <= 40 &&
    Number.isFinite(Date.parse(value));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
