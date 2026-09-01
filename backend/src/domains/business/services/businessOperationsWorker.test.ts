import {
  type BusinessOperatingPeriodClaim,
  type BusinessOperatingPeriodCloseResult,
  type BusinessOperatingPeriodReleaseResult,
  BusinessOperationsWorkerError,
  type BusinessOperationsWorkerRepository,
  type BusinessPayrollLiabilityRecoveryResult,
  type BusinessTaxLiabilityRecoveryResult,
  runBusinessOperationsWorker,
} from "./businessOperationsWorker.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const BUSINESS_KEY = `biz_${"1".repeat(32)}`;
const LEASE_ONE = "00000000-0000-4000-8000-000000000001";
const LEASE_TWO = "00000000-0000-4000-8000-000000000002";
const RECOVERY_KEY = `pyrx_${"4".repeat(32)}`;
const PAYROLL_RUN_KEY = `pyr_${"5".repeat(32)}`;
const TAX_ASSESSMENT_KEY = `bgta_${"8".repeat(32)}`;
const TAX_PAYMENT_KEY = `bgtp_${"9".repeat(32)}`;

Deno.test("business operations worker closes due claims in deterministic order and counts replay", async () => {
  const repository = new FakeRepository([
    claim(2, LEASE_TWO, "2026-09-15T00:00:00.000Z"),
    claim(1, LEASE_ONE, "2026-09-08T00:00:00.000Z"),
  ]);
  repository.replayedClaims.add(claimKey(2));

  const result = await runBusinessOperationsWorker({ repository });

  assertEquals(result, {
    recoveryScannedCount: 0,
    recoveredCount: 0,
    recoveryReplayedCount: 0,
    recoveryDeferredCount: 0,
    taxRecoveryScannedCount: 0,
    taxRecoveredCount: 0,
    taxRecoveryDeferredCount: 0,
    claimedCount: 2,
    closedCount: 1,
    replayedCount: 1,
    failedCount: 0,
    releasedCount: 0,
    releaseFailedCount: 0,
  });
  assertEquals(repository.closedClaims, [claimKey(1), claimKey(2)]);
  assertEquals(repository.closeIdempotencyKeys, [
    `business-period-close:${claimKey(1)}`,
    `business-period-close:${claimKey(2)}`,
  ]);
  assertEquals(repository.callOrder.slice(0, 3), [
    "recover-payroll",
    "recover-tax",
    "claim",
  ]);
});

Deno.test("business operations worker recovers prior payroll before claiming new periods", async () => {
  const repository = new FakeRepository([], [
    recovery({
      payrollStatus: "partially_paid",
      recovered: true,
      liabilityRemaining: true,
    }),
    recovery({
      recoveryRequestKey: `pyrx_${"6".repeat(32)}`,
      payrollRunKey: `pyr_${"7".repeat(32)}`,
      payrollStatus: "unpaid",
      recovered: false,
      liabilityRemaining: true,
      replayed: true,
    }),
  ]);

  const result = await runBusinessOperationsWorker({ repository });

  assertEquals(result, {
    recoveryScannedCount: 2,
    recoveredCount: 1,
    recoveryReplayedCount: 1,
    recoveryDeferredCount: 2,
    taxRecoveryScannedCount: 0,
    taxRecoveredCount: 0,
    taxRecoveryDeferredCount: 0,
    claimedCount: 0,
    closedCount: 0,
    replayedCount: 0,
    failedCount: 0,
    releasedCount: 0,
    releaseFailedCount: 0,
  });
  assertEquals(repository.callOrder, [
    "recover-payroll",
    "recover-tax",
    "claim",
  ]);
});

Deno.test("business operations worker recovers prior tax after payroll and before new periods", async () => {
  const repository = new FakeRepository([], [], [
    taxRecovery({ recovered: true, liabilityRemaining: true }),
    taxRecovery({
      taxAssessmentKey: `bgta_${"a".repeat(32)}`,
      taxPaymentKey: null,
      taxStatus: "unpaid",
      recovered: false,
      liabilityRemaining: true,
    }),
  ]);

  const result = await runBusinessOperationsWorker({ repository });

  assertEquals(result, {
    recoveryScannedCount: 0,
    recoveredCount: 0,
    recoveryReplayedCount: 0,
    recoveryDeferredCount: 0,
    taxRecoveryScannedCount: 2,
    taxRecoveredCount: 1,
    taxRecoveryDeferredCount: 2,
    claimedCount: 0,
    closedCount: 0,
    replayedCount: 0,
    failedCount: 0,
    releasedCount: 0,
    releaseFailedCount: 0,
  });
  assertEquals(repository.callOrder, [
    "recover-payroll",
    "recover-tax",
    "claim",
  ]);
});

Deno.test("business operations worker releases a failed claim without exposing its identity", async () => {
  const repository = new FakeRepository([claim(1, LEASE_ONE)]);
  repository.closeFailures.add(claimKey(1));

  const result = await runBusinessOperationsWorker({ repository });

  assertEquals(result, {
    recoveryScannedCount: 0,
    recoveredCount: 0,
    recoveryReplayedCount: 0,
    recoveryDeferredCount: 0,
    taxRecoveryScannedCount: 0,
    taxRecoveredCount: 0,
    taxRecoveryDeferredCount: 0,
    claimedCount: 1,
    closedCount: 0,
    replayedCount: 0,
    failedCount: 1,
    releasedCount: 1,
    releaseFailedCount: 0,
  });
  assertEquals(repository.releaseReasons, [
    "BUSINESS_OPERATING_PERIOD_CLOSE_FAILED",
  ]);
  assertEquals(repository.releaseIdempotencyKeys, [
    `business-period-release:${claimKey(1)}:${LEASE_ONE}`,
  ]);
});

Deno.test("business operations worker records lease-release failure as aggregate evidence", async () => {
  const repository = new FakeRepository([claim(1, LEASE_ONE)]);
  repository.closeFailures.add(claimKey(1));
  repository.releaseFailures.add(claimKey(1));

  const result = await runBusinessOperationsWorker({ repository });

  assertEquals(result.failedCount, 1);
  assertEquals(result.releasedCount, 0);
  assertEquals(result.releaseFailedCount, 1);
});

Deno.test("business operations worker rejects malformed or duplicate claim evidence before close", async () => {
  const duplicate = claim(1, LEASE_ONE);
  const repository = new FakeRepository([duplicate, duplicate]);

  await assertRejectsCode(
    () => runBusinessOperationsWorker({ repository }),
    "business_operating_period_claim_result_invalid",
  );
  assertEquals(repository.closedClaims, []);
});

Deno.test("business operations worker rejects contradictory payroll recovery evidence before claims", async () => {
  const repository = new FakeRepository([], [{
    ...recovery(),
    payrollStatus: "completed",
    liabilityRemaining: true,
  }]);

  await assertRejectsCode(
    () => runBusinessOperationsWorker({ repository }),
    "business_payroll_recovery_result_invalid",
  );
  assertEquals(repository.callOrder, ["recover-payroll"]);
});

Deno.test("business operations worker rejects contradictory tax recovery evidence before claims", async () => {
  const repository = new FakeRepository([], [], [{
    ...taxRecovery(),
    taxStatus: "paid",
    liabilityRemaining: true,
  }]);

  await assertRejectsCode(
    () => runBusinessOperationsWorker({ repository }),
    "business_tax_recovery_result_invalid",
  );
  assertEquals(repository.callOrder, ["recover-payroll", "recover-tax"]);
});

class FakeRepository implements BusinessOperationsWorkerRepository {
  readonly closedClaims: string[] = [];
  readonly closeIdempotencyKeys: string[] = [];
  readonly releaseReasons: string[] = [];
  readonly releaseIdempotencyKeys: string[] = [];
  readonly replayedClaims = new Set<string>();
  readonly closeFailures = new Set<string>();
  readonly releaseFailures = new Set<string>();
  readonly callOrder: string[] = [];

  constructor(
    readonly claims: readonly BusinessOperatingPeriodClaim[],
    readonly recoveries: readonly BusinessPayrollLiabilityRecoveryResult[] = [],
    readonly taxRecoveries: readonly BusinessTaxLiabilityRecoveryResult[] = [],
  ) {}

  recoverPayrollLiabilities(): Promise<
    readonly BusinessPayrollLiabilityRecoveryResult[]
  > {
    this.callOrder.push("recover-payroll");
    return Promise.resolve(this.recoveries);
  }

  recoverTaxLiabilities(): Promise<
    readonly BusinessTaxLiabilityRecoveryResult[]
  > {
    this.callOrder.push("recover-tax");
    return Promise.resolve(this.taxRecoveries);
  }

  claimDueOperatingPeriods(): Promise<readonly BusinessOperatingPeriodClaim[]> {
    this.callOrder.push("claim");
    return Promise.resolve(this.claims);
  }

  closeClaimedOperatingPeriod(input: {
    readonly claim: BusinessOperatingPeriodClaim;
    readonly idempotencyKey: string;
  }): Promise<BusinessOperatingPeriodCloseResult> {
    this.closedClaims.push(input.claim.claimKey);
    this.closeIdempotencyKeys.push(input.idempotencyKey);
    if (this.closeFailures.has(input.claim.claimKey)) {
      return Promise.reject(
        new Error("business operating period close failed"),
      );
    }
    return Promise.resolve({
      closeReceiptKey: receiptKey(Number(input.claim.periodNumber)),
      businessKey: input.claim.businessKey,
      payrollPeriodKey: input.claim.payrollPeriodKey,
      replayed: this.replayedClaims.has(input.claim.claimKey),
    });
  }

  releaseOperatingPeriodLease(input: {
    readonly claim: BusinessOperatingPeriodClaim;
    readonly reasonCode: string;
    readonly idempotencyKey: string;
  }): Promise<BusinessOperatingPeriodReleaseResult> {
    this.releaseReasons.push(input.reasonCode);
    this.releaseIdempotencyKeys.push(input.idempotencyKey);
    if (this.releaseFailures.has(input.claim.claimKey)) {
      return Promise.reject(new Error("release failed"));
    }
    return Promise.resolve({
      claimKey: input.claim.claimKey,
      claimStatus: "released",
      replayed: false,
    });
  }
}

function taxRecovery(
  overrides: Partial<BusinessTaxLiabilityRecoveryResult> = {},
): BusinessTaxLiabilityRecoveryResult {
  return {
    taxAssessmentKey: TAX_ASSESSMENT_KEY,
    taxPaymentKey: TAX_PAYMENT_KEY,
    businessKey: BUSINESS_KEY,
    taxStatus: "partially_paid",
    recovered: true,
    liabilityRemaining: true,
    ...overrides,
  };
}

function recovery(
  overrides: Partial<BusinessPayrollLiabilityRecoveryResult> = {},
): BusinessPayrollLiabilityRecoveryResult {
  return {
    recoveryRequestKey: RECOVERY_KEY,
    payrollRunKey: PAYROLL_RUN_KEY,
    businessKey: BUSINESS_KEY,
    payrollStatus: "completed",
    recovered: true,
    liabilityRemaining: false,
    replayed: false,
    ...overrides,
  };
}

function claim(
  periodNumber: number,
  leaseToken: string,
  dueAt = "2026-09-08T00:00:00.000Z",
): BusinessOperatingPeriodClaim {
  return {
    claimKey: claimKey(periodNumber),
    businessKey: BUSINESS_KEY,
    payrollPeriodKey: `payroll:${periodNumber}`,
    periodNumber: String(periodNumber),
    dueAt,
    leaseToken,
    leaseExpiresAt: "2026-09-15T00:05:00.000Z",
  };
}

function claimKey(number: number): string {
  return `bocl_${number.toString(16).padStart(32, "0")}`;
}

function receiptKey(number: number): string {
  return `bopr_${number.toString(16).padStart(32, "0")}`;
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof BusinessOperationsWorkerError && error.code === code) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected ${code}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}
