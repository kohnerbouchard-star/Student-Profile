import {
  runStandardFxOrderSettlementBatch,
  type StandardFxOrderClaim,
  type StandardFxOrderCommandResult,
  StandardFxOrderSettlementError,
  type StandardFxOrderSettlementRepository,
} from "./standardFxOrderSettlementRunner.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const CLAIMED_AT = "2026-08-27T00:00:01.000Z";
const NOW = "2026-08-27T00:00:02.000Z";
const GAME_A = "00000000-0000-4000-8000-000000000001";
const GAME_B = "00000000-0000-4000-8000-000000000002";
const ORDER_A = `fxo_${"a".repeat(32)}`;
const ORDER_B = `fxo_${"b".repeat(32)}`;
const LEASE_A = "10000000-0000-4000-8000-000000000001";
const LEASE_B = "10000000-0000-4000-8000-000000000002";

Deno.test("standard FX settlement runner claims once and settles in deterministic order", async () => {
  const repository = new FakeRepository([
    claim(GAME_B, ORDER_B, LEASE_B, "2026-08-27T00:00:00.000Z"),
    claim(GAME_A, ORDER_A, LEASE_A, "2026-08-26T23:59:59.000Z"),
  ]);
  repository.outcomes.set(ORDER_B, "replayed");
  const result = await run(repository);

  assertEquals(repository.claimCalls, [{
    workerName: "banking-fx-run:test-001",
    limit: 25,
    leaseSeconds: 300,
    now: CLAIMED_AT,
  }]);
  assertEquals(repository.settleCalls.map((value) => value.claim.orderKey), [
    ORDER_A,
    ORDER_B,
  ]);
  assertEquals(result, {
    claimedCount: 2,
    appliedCount: 1,
    replayedCount: 1,
    terminalFailedCount: 0,
    retryableFailedCount: 0,
    failureRecordFailedCount: 0,
    failedCount: 0,
    failureCodes: [],
  });
});

Deno.test("standard FX settlement runner treats Player and Business orders as one owner-neutral queue", async () => {
  const repository = new FakeRepository([
    claim(GAME_A, ORDER_A, LEASE_A, "2026-08-27T00:00:00.000Z"),
    claim(GAME_B, ORDER_B, LEASE_B, "2026-08-27T00:00:00.000Z"),
  ]);
  const result = await run(repository);

  assertEquals(repository.settleCalls.map(({ claim }) => claim.orderKey), [
    ORDER_A,
    ORDER_B,
  ]);
  assertEquals(result.claimedCount, 2);
  const serialized = JSON.stringify(repository.settleCalls);
  assertEquals(serialized.includes("playerId"), false);
  assertEquals(serialized.includes("businessId"), false);
  assertEquals(serialized.includes("ownerFamily"), false);
});

Deno.test("standard FX settlement runner terminalizes only explicit permanent errors", async () => {
  const repository = new FakeRepository([
    claim(GAME_A, ORDER_A, LEASE_A, "2026-08-27T00:00:00.000Z"),
  ]);
  repository.settleErrors.set(
    ORDER_A,
    new StandardFxOrderSettlementError(
      "FUNDING_INSUFFICIENT",
      "Permanent funding invariant failure.",
      500,
      false,
      true,
    ),
  );
  const result = await run(repository);

  assertEquals(repository.failCalls, [{
    claim: repository.claims[0],
    errorCode: "FUNDING_INSUFFICIENT",
    now: NOW,
  }]);
  assertEquals(result.terminalFailedCount, 1);
  assertEquals(result.retryableFailedCount, 0);
  assertEquals(result.failureCodes, ["FUNDING_INSUFFICIENT"]);
});

Deno.test("standard FX settlement runner leaves transient failures for lease recovery", async () => {
  const repository = new FakeRepository([
    claim(GAME_A, ORDER_A, LEASE_A, "2026-08-27T00:00:00.000Z"),
  ]);
  repository.settleErrors.set(
    ORDER_A,
    new StandardFxOrderSettlementError(
      "FX_LIQUIDITY_UNAVAILABLE",
      "Liquidity is temporarily unavailable.",
      500,
      true,
      false,
    ),
  );
  const result = await run(repository);

  assertEquals(repository.failCalls, []);
  assertEquals(result.terminalFailedCount, 0);
  assertEquals(result.retryableFailedCount, 1);
  assertEquals(result.failureCodes, ["FX_LIQUIDITY_UNAVAILABLE"]);
});

Deno.test("standard FX settlement runner never widens terminal authority when failure recording fails", async () => {
  const repository = new FakeRepository([
    claim(GAME_A, ORDER_A, LEASE_A, "2026-08-27T00:00:00.000Z"),
  ]);
  repository.settleErrors.set(
    ORDER_A,
    new StandardFxOrderSettlementError(
      "FX_ORDER_RESERVATION_CONFLICT",
      "Reservation evidence is permanently invalid.",
      500,
      false,
      true,
    ),
  );
  repository.failError = new Error("temporary database outage");
  const result = await run(repository);

  assertEquals(repository.failCalls.length, 1);
  assertEquals(result.terminalFailedCount, 0);
  assertEquals(result.failureRecordFailedCount, 1);
  assertEquals(result.failedCount, 1);
});

Deno.test("standard FX settlement runner rejects duplicate or future claims before commands", async () => {
  for (
    const claims of [
      [
        claim(GAME_A, ORDER_A, LEASE_A, "2026-08-27T00:00:00.000Z"),
        claim(GAME_B, ORDER_A, LEASE_B, "2026-08-27T00:00:00.000Z"),
      ],
      [claim(GAME_A, ORDER_A, LEASE_A, "2026-08-27T00:00:02.000Z")],
    ]
  ) {
    const repository = new FakeRepository(claims);
    await assertRejectsCode(
      () => run(repository),
      "standard_fx_order_claim_result_invalid",
    );
    assertEquals(repository.settleCalls, []);
    assertEquals(repository.failCalls, []);
  }
});

class FakeRepository implements StandardFxOrderSettlementRepository {
  readonly claimCalls: unknown[] = [];
  readonly settleCalls: {
    readonly claim: StandardFxOrderClaim;
    readonly now: string;
  }[] = [];
  readonly failCalls: {
    readonly claim: StandardFxOrderClaim;
    readonly errorCode: string;
    readonly now: string;
  }[] = [];
  readonly outcomes = new Map<
    string,
    StandardFxOrderCommandResult["outcome"]
  >();
  readonly settleErrors = new Map<string, Error>();
  failError: Error | null = null;

  constructor(readonly claims: readonly StandardFxOrderClaim[]) {}

  claimDueOrders(input: unknown): Promise<readonly StandardFxOrderClaim[]> {
    this.claimCalls.push(input);
    return Promise.resolve(this.claims);
  }

  settleOrder(input: {
    readonly claim: StandardFxOrderClaim;
    readonly now: string;
  }): Promise<StandardFxOrderCommandResult> {
    this.settleCalls.push(input);
    const error = this.settleErrors.get(input.claim.orderKey);
    if (error) return Promise.reject(error);
    return Promise.resolve({
      outcome: this.outcomes.get(input.claim.orderKey) ?? "applied",
      orderKey: input.claim.orderKey,
      status: "settled",
    });
  }

  failOrder(input: {
    readonly claim: StandardFxOrderClaim;
    readonly errorCode: string;
    readonly now: string;
  }): Promise<StandardFxOrderCommandResult> {
    this.failCalls.push(input);
    if (this.failError) return Promise.reject(this.failError);
    return Promise.resolve({
      outcome: "applied",
      orderKey: input.claim.orderKey,
      status: "failed",
    });
  }
}

function run(repository: FakeRepository) {
  return runStandardFxOrderSettlementBatch({
    repository,
    workerName: "banking-fx-run:test-001",
    claimedAt: CLAIMED_AT,
    limit: 25,
    leaseSeconds: 300,
  }, { now: () => new Date(NOW) });
}

function claim(
  gameSessionId: string,
  orderKey: string,
  leaseToken: string,
  settlesAt: string,
): StandardFxOrderClaim {
  return { gameSessionId, orderKey, leaseToken, settlesAt };
}

async function assertRejectsCode(
  runAction: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await runAction();
  } catch (error) {
    assertEquals((error as { readonly code?: string }).code, code);
    return;
  }
  throw new Error(`Expected ${code} rejection.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
