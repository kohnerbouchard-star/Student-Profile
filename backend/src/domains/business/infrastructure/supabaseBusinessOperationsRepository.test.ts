import {
  BusinessOperationsWorkerError,
} from "../services/businessOperationsWorker.ts";
import {
  type BusinessOperationsSupabaseClient,
  SupabaseBusinessOperationsRepository,
} from "./supabaseBusinessOperationsRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const CLAIM_KEY = `bocl_${"1".repeat(32)}`;
const RECEIPT_KEY = `bopr_${"2".repeat(32)}`;
const BUSINESS_KEY = `biz_${"3".repeat(32)}`;
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000001";
const RECOVERY_KEY = `pyrx_${"4".repeat(32)}`;
const PAYROLL_RUN_KEY = `pyr_${"5".repeat(32)}`;
const TAX_ASSESSMENT_KEY = `bgta_${"6".repeat(32)}`;
const TAX_PAYMENT_KEY = `bgtp_${"7".repeat(32)}`;

Deno.test("business operations repository invokes only bounded claim close and release RPCs", async () => {
  const client = new FakeRpcClient([
    ok([recoveryRow()]),
    ok([taxRecoveryRow()]),
    ok([claimRow()]),
    ok([{
      close_receipt_key: RECEIPT_KEY,
      business_key: BUSINESS_KEY,
      payroll_period_key: "payroll:7",
      payroll_status: "completed",
      store_receipt_count: 3,
      gross_wages_due: "100.00",
      gross_wages_paid: "80.00",
      gross_wages_unpaid: "20.00",
      tax_assessed: {},
      tax_paid: {},
      tax_unpaid: {},
      next_due_at: "2026-09-15T00:00:00.000Z",
      replayed: false,
    }]),
    ok([{
      claim_key: CLAIM_KEY,
      claim_status: "released",
      released_at: "2026-09-08T00:01:00.000Z",
      replayed: true,
    }]),
  ]);
  const repository = new SupabaseBusinessOperationsRepository(client);

  const recoveries = await repository.recoverPayrollLiabilities({
    batchLimit: 25,
  });
  const taxRecoveries = await repository.recoverTaxLiabilities({
    batchLimit: 25,
  });
  const claims = await repository.claimDueOperatingPeriods({ batchLimit: 25 });
  const closed = await repository.closeClaimedOperatingPeriod({
    claim: claims[0],
    idempotencyKey: `business-period-close:${CLAIM_KEY}`,
  });
  const released = await repository.releaseOperatingPeriodLease({
    claim: claims[0],
    reasonCode: "BUSINESS_OPERATING_PERIOD_CLOSE_FAILED",
    idempotencyKey: `business-period-release:${CLAIM_KEY}:${LEASE_TOKEN}`,
  });

  assertEquals(recoveries, [{
    recoveryRequestKey: RECOVERY_KEY,
    payrollRunKey: PAYROLL_RUN_KEY,
    businessKey: BUSINESS_KEY,
    payrollStatus: "partially_paid",
    recovered: true,
    liabilityRemaining: true,
    replayed: false,
  }]);
  assertEquals(taxRecoveries, [{
    taxAssessmentKey: TAX_ASSESSMENT_KEY,
    taxPaymentKey: TAX_PAYMENT_KEY,
    businessKey: BUSINESS_KEY,
    taxStatus: "partially_paid",
    recovered: true,
    liabilityRemaining: true,
  }]);
  assertEquals(claims, [{
    claimKey: CLAIM_KEY,
    businessKey: BUSINESS_KEY,
    payrollPeriodKey: "payroll:7",
    periodNumber: "7",
    dueAt: "2026-09-08T00:00:00.000Z",
    leaseToken: LEASE_TOKEN,
    leaseExpiresAt: "2026-09-08T00:05:00.000Z",
  }]);
  assertEquals(closed, {
    closeReceiptKey: RECEIPT_KEY,
    businessKey: BUSINESS_KEY,
    payrollPeriodKey: "payroll:7",
    replayed: false,
  });
  assertEquals(released, {
    claimKey: CLAIM_KEY,
    claimStatus: "released",
    replayed: true,
  });
  assertEquals(client.calls, [
    {
      functionName: "recover_due_business_payroll_liabilities_v1",
      args: { p_batch_limit: 25 },
    },
    {
      functionName: "recover_due_business_tax_liabilities_v1",
      args: { p_batch_limit: 25 },
    },
    {
      functionName: "claim_due_business_operating_periods_v1",
      args: { p_batch_limit: 25 },
    },
    {
      functionName: "close_claimed_business_operating_period_v1",
      args: {
        p_claim_key: CLAIM_KEY,
        p_lease_token: LEASE_TOKEN,
        p_idempotency_key: `business-period-close:${CLAIM_KEY}`,
      },
    },
    {
      functionName: "release_business_operating_period_lease_v1",
      args: {
        p_claim_key: CLAIM_KEY,
        p_lease_token: LEASE_TOKEN,
        p_reason_code: "BUSINESS_OPERATING_PERIOD_CLOSE_FAILED",
        p_idempotency_key:
          `business-period-release:${CLAIM_KEY}:${LEASE_TOKEN}`,
      },
    },
  ]);
});

Deno.test("business operations repository preserves bigint period identity as text", async () => {
  const client = new FakeRpcClient([ok([claimRow({
    period_number: "9223372036854775806",
    payroll_period_key: "payroll:9223372036854775806",
  })])]);
  const repository = new SupabaseBusinessOperationsRepository(client);

  const claims = await repository.claimDueOperatingPeriods({ batchLimit: 1 });

  assertEquals(claims[0].periodNumber, "9223372036854775806");
});

Deno.test("business operations repository rejects malformed or plural command results", async () => {
  const malformedRecovery = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([ok([{ ...recoveryRow(), recovered: "true" }])]),
  );
  await assertRejectsCode(
    () => malformedRecovery.recoverPayrollLiabilities({ batchLimit: 25 }),
    "business_operations_repository_result_invalid",
  );

  const malformedTaxRecovery = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([ok([{ ...taxRecoveryRow(), tax_payment_key: 42 }])]),
  );
  await assertRejectsCode(
    () => malformedTaxRecovery.recoverTaxLiabilities({ batchLimit: 25 }),
    "business_operations_repository_result_invalid",
  );

  const malformedClaim = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([ok([{ ...claimRow(), lease_token: "uuid" }])]),
  );
  await assertRejectsCode(
    () => malformedClaim.claimDueOperatingPeriods({ batchLimit: 25 }),
    "business_operations_repository_result_invalid",
  );

  const pluralClose = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([ok([{}, {}])]),
  );
  await assertRejectsCode(
    () =>
      pluralClose.closeClaimedOperatingPeriod({
        claim: mappedClaim(),
        idempotencyKey: `business-period-close:${CLAIM_KEY}`,
      }),
    "business_operations_repository_result_invalid",
  );
});

Deno.test("business operations repository maps a stable payroll recovery limit error", async () => {
  const repository = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([
      failed("BUSINESS_PAYROLL_RECOVERY_BATCH_LIMIT_INVALID"),
    ]),
  );

  await assertRejectsCode(
    () => repository.recoverPayrollLiabilities({ batchLimit: 101 }),
    "business_payroll_recovery_batch_limit_invalid",
  );
});

Deno.test("business operations repository maps a stable tax recovery limit error", async () => {
  const repository = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([
      failed("BUSINESS_TAX_RECOVERY_BATCH_LIMIT_INVALID"),
    ]),
  );

  await assertRejectsCode(
    () => repository.recoverTaxLiabilities({ batchLimit: 101 }),
    "business_tax_recovery_batch_limit_invalid",
  );
});

Deno.test("business operations repository maps stable lease and schema errors without raw details", async () => {
  const stale = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([failed("BUSINESS_OPERATING_PERIOD_LEASE_EXPIRED")]),
  );
  await assertRejectsCode(
    () => stale.claimDueOperatingPeriods({ batchLimit: 25 }),
    "business_operating_period_lease_expired",
  );

  const missing = new SupabaseBusinessOperationsRepository(
    new FakeRpcClient([failed("function is absent", "PGRST202")]),
  );
  await assertRejectsCode(
    () => missing.claimDueOperatingPeriods({ batchLimit: 25 }),
    "business_operations_schema_not_applied",
  );
});

class FakeRpcClient implements BusinessOperationsSupabaseClient {
  readonly calls: Array<{
    readonly functionName: string;
    readonly args: Readonly<Record<string, unknown>> | undefined;
  }> = [];

  constructor(private readonly responses: readonly RpcResponse[]) {}

  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ readonly data: T | null; readonly error: RpcError | null }> {
    this.calls.push({ functionName, args });
    const response = this.responses[this.calls.length - 1];
    if (!response) throw new Error(`No RPC response for ${functionName}`);
    return Promise.resolve(
      response as {
        readonly data: T | null;
        readonly error: RpcError | null;
      },
    );
  }
}

interface RpcError {
  readonly message?: string;
  readonly code?: string;
}

interface RpcResponse {
  readonly data: unknown;
  readonly error: RpcError | null;
}

function ok(data: unknown): RpcResponse {
  return { data, error: null };
}

function failed(message: string, code = "P0001"): RpcResponse {
  return { data: null, error: { message, code } };
}

function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    claim_key: CLAIM_KEY,
    business_key: BUSINESS_KEY,
    payroll_period_key: "payroll:7",
    period_number: 7,
    due_at: "2026-09-08T00:00:00.000Z",
    lease_token: LEASE_TOKEN,
    lease_expires_at: "2026-09-08T00:05:00.000Z",
    ...overrides,
  };
}

function recoveryRow(overrides: Record<string, unknown> = {}) {
  return {
    recovery_request_key: RECOVERY_KEY,
    payroll_run_key: PAYROLL_RUN_KEY,
    business_key: BUSINESS_KEY,
    payroll_status: "partially_paid",
    recovered: true,
    liability_remaining: true,
    replayed: false,
    ...overrides,
  };
}

function taxRecoveryRow(overrides: Record<string, unknown> = {}) {
  return {
    tax_assessment_key: TAX_ASSESSMENT_KEY,
    tax_payment_key: TAX_PAYMENT_KEY,
    business_key: BUSINESS_KEY,
    tax_status: "partially_paid",
    recovered: true,
    liability_remaining: true,
    ...overrides,
  };
}

function mappedClaim() {
  return {
    claimKey: CLAIM_KEY,
    businessKey: BUSINESS_KEY,
    payrollPeriodKey: "payroll:7",
    periodNumber: "7",
    dueAt: "2026-09-08T00:00:00.000Z",
    leaseToken: LEASE_TOKEN,
    leaseExpiresAt: "2026-09-08T00:05:00.000Z",
  };
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
