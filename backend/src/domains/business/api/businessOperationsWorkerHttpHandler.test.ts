import {
  BUSINESS_OPERATIONS_WORKER_INTERNAL_HEADER,
  handleBusinessOperationsWorkerRequest,
} from "./businessOperationsWorkerHttpHandler.ts";
import type {
  BusinessOperatingPeriodClaim,
  BusinessOperatingPeriodCloseResult,
  BusinessOperatingPeriodReleaseResult,
  BusinessPayrollLiabilityRecoveryResult,
  BusinessTaxLiabilityRecoveryResult,
  BusinessOperationsWorkerRepository,
} from "../services/businessOperationsWorker.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SECRET = "business-operations-runner-secret";
const CLAIM_KEY = `bocl_${"1".repeat(32)}`;
const BUSINESS_KEY = `biz_${"2".repeat(32)}`;
const RECEIPT_KEY = `bopr_${"3".repeat(32)}`;
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000001";
const RECOVERY_KEY = `pyrx_${"4".repeat(32)}`;
const PAYROLL_RUN_KEY = `pyr_${"5".repeat(32)}`;
const TAX_ASSESSMENT_KEY = `bgta_${"6".repeat(32)}`;
const TAX_PAYMENT_KEY = `bgtp_${"7".repeat(32)}`;

Deno.test("business operations worker HTTP boundary permits POST only", async () => {
  const response = await handleBusinessOperationsWorkerRequest(
    new Request("https://example.test/business-operations-worker", {
      method: "GET",
    }),
    dependencies(),
  );

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST");
});

Deno.test("business operations worker HTTP boundary rejects browser credentials before repository access", async () => {
  for (
    const [name, value] of [
      ["authorization", "Bearer user-token"],
      ["cookie", "session=browser"],
      ["origin", "https://econovaria.com"],
      ["x-econovaria-csrf-token", "csrf"],
      ["x-player-session-token", "player"],
      ["x-econovaria-player-session-token", "player"],
      ["x-econovaria-game-id", "game"],
      ["sec-fetch-site", "same-origin"],
    ] as const
  ) {
    let created = false;
    const response = await handleBusinessOperationsWorkerRequest(
      request(undefined, { [name]: value }),
      dependencies({
        createRepository: () => {
          created = true;
          return new FakeRepository([]);
        },
      }),
    );
    const body = await readJson(response);

    assertEquals(response.status, 403);
    assertEquals(
      body.error.code,
      "browser_business_operations_request_forbidden",
    );
    assertEquals(created, false);
  }
});

Deno.test("business operations worker HTTP boundary requires injected internal authority", async () => {
  const missingConfig = await handleBusinessOperationsWorkerRequest(
    request(),
    dependencies({ readRunnerSecret: () => undefined }),
  );
  const invalid = await handleBusinessOperationsWorkerRequest(
    request(undefined, {
      [BUSINESS_OPERATIONS_WORKER_INTERNAL_HEADER]: "wrong",
    }),
    dependencies(),
  );

  assertEquals(missingConfig.status, 500);
  assertEquals(invalid.status, 401);
});

Deno.test("business operations worker HTTP boundary accepts only a byte-empty body", async () => {
  for (const body of [" ", "{}", "null"]) {
    let created = false;
    const response = await handleBusinessOperationsWorkerRequest(
      request(body),
      dependencies({
        createRepository: () => {
          created = true;
          return new FakeRepository([]);
        },
      }),
    );
    const payload = await readJson(response);

    assertEquals(response.status, 400);
    assertEquals(
      payload.error.code,
      "invalid_business_operations_worker_request",
    );
    assertEquals(created, false);
  }
});

Deno.test("business operations worker HTTP response contains aggregate counts only", async () => {
  const response = await handleBusinessOperationsWorkerRequest(
    request(),
    dependencies({
      createRepository: () =>
        new FakeRepository([claim()], [{
          recoveryRequestKey: RECOVERY_KEY,
          payrollRunKey: PAYROLL_RUN_KEY,
          businessKey: BUSINESS_KEY,
          payrollStatus: "partially_paid",
          recovered: true,
          liabilityRemaining: true,
          replayed: false,
        }], [{
          taxAssessmentKey: TAX_ASSESSMENT_KEY,
          taxPaymentKey: TAX_PAYMENT_KEY,
          businessKey: BUSINESS_KEY,
          taxStatus: "paid",
          recovered: true,
          liabilityRemaining: false,
        }]),
    }),
  );
  const bodyText = await response.text();
  const body = JSON.parse(bodyText);

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    recoveryScannedCount: 1,
    recoveredCount: 1,
    recoveryReplayedCount: 0,
    recoveryDeferredCount: 1,
    taxRecoveryScannedCount: 1,
    taxRecoveredCount: 1,
    taxRecoveryDeferredCount: 0,
    claimedCount: 1,
    closedCount: 1,
    replayedCount: 0,
    failedCount: 0,
    releasedCount: 0,
    releaseFailedCount: 0,
  });
  assertEquals(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assertEquals(response.headers.has("access-control-allow-origin"), false);
  for (
    const forbidden of [
      CLAIM_KEY,
      BUSINESS_KEY,
      RECEIPT_KEY,
      LEASE_TOKEN,
      "payroll:1",
      RECOVERY_KEY,
      PAYROLL_RUN_KEY,
      "partially_paid",
      TAX_ASSESSMENT_KEY,
      TAX_PAYMENT_KEY,
      "paid",
    ]
  ) {
    assertEquals(bodyText.includes(forbidden), false);
  }
});

Deno.test("business operations worker HTTP response reports partial work without private failure details", async () => {
  const repository = new FakeRepository([claim()]);
  repository.failClose = true;
  const response = await handleBusinessOperationsWorkerRequest(
    request(),
    dependencies({ createRepository: () => repository }),
  );
  const bodyText = await response.text();
  const body = JSON.parse(bodyText);

  assertEquals(response.status, 503);
  assertEquals(body.error.code, "business_operating_period_batch_incomplete");
  assertEquals(body.summary, {
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
  assertEquals(bodyText.includes(CLAIM_KEY), false);
  assertEquals(bodyText.includes("forced close failure"), false);
});

class FakeRepository implements BusinessOperationsWorkerRepository {
  failClose = false;

  constructor(
    readonly claims: readonly BusinessOperatingPeriodClaim[],
    readonly recoveries: readonly BusinessPayrollLiabilityRecoveryResult[] = [],
    readonly taxRecoveries: readonly BusinessTaxLiabilityRecoveryResult[] = [],
  ) {}

  recoverPayrollLiabilities(): Promise<
    readonly BusinessPayrollLiabilityRecoveryResult[]
  > {
    return Promise.resolve(this.recoveries);
  }

  recoverTaxLiabilities(): Promise<
    readonly BusinessTaxLiabilityRecoveryResult[]
  > {
    return Promise.resolve(this.taxRecoveries);
  }

  claimDueOperatingPeriods(): Promise<readonly BusinessOperatingPeriodClaim[]> {
    return Promise.resolve(this.claims);
  }

  closeClaimedOperatingPeriod(input: {
    readonly claim: BusinessOperatingPeriodClaim;
  }): Promise<BusinessOperatingPeriodCloseResult> {
    if (this.failClose) {
      return Promise.reject(new Error("forced close failure"));
    }
    return Promise.resolve({
      closeReceiptKey: RECEIPT_KEY,
      businessKey: input.claim.businessKey,
      payrollPeriodKey: input.claim.payrollPeriodKey,
      replayed: false,
    });
  }

  releaseOperatingPeriodLease(input: {
    readonly claim: BusinessOperatingPeriodClaim;
  }): Promise<BusinessOperatingPeriodReleaseResult> {
    return Promise.resolve({
      claimKey: input.claim.claimKey,
      claimStatus: "released",
      replayed: false,
    });
  }
}

function claim(): BusinessOperatingPeriodClaim {
  return {
    claimKey: CLAIM_KEY,
    businessKey: BUSINESS_KEY,
    payrollPeriodKey: "payroll:1",
    periodNumber: "1",
    dueAt: "2026-09-08T00:00:00.000Z",
    leaseToken: LEASE_TOKEN,
    leaseExpiresAt: "2026-09-08T00:05:00.000Z",
  };
}

function dependencies(
  overrides: Partial<{
    createRepository: () => BusinessOperationsWorkerRepository;
    readRunnerSecret: () => string | undefined;
  }> = {},
) {
  return {
    createRepository: overrides.createRepository ??
      (() => new FakeRepository([])),
    readRunnerSecret: overrides.readRunnerSecret ?? (() => SECRET),
  };
}

function request(
  body?: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): Request {
  const headers = new Headers({
    [BUSINESS_OPERATIONS_WORKER_INTERNAL_HEADER]: SECRET,
    apikey: "sb_publishable_test",
    ...extraHeaders,
  });
  return new Request("https://example.test/business-operations-worker", {
    method: "POST",
    headers,
    body,
  });
}

async function readJson(
  response: Response,
): Promise<{ readonly error: { readonly code: string } }> {
  return await response.json() as { readonly error: { readonly code: string } };
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}
