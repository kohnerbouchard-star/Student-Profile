import type { StandardFxOrderSettlementOrchestratorRepository } from "../infrastructure/supabaseStandardFxOrderSettlementRepository.ts";
import {
  type StandardFxOrderClaim,
  type StandardFxOrderCommandResult,
  StandardFxOrderSettlementError,
} from "../services/standardFxOrderSettlementRunner.ts";
import {
  BANKING_FX_SCHEDULER_HEADER,
  BANKING_FX_SCHEDULER_NAME,
  handleBankingFxOrchestratorRequest,
} from "./bankingFxOrchestratorHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const LEASE = "10000000-0000-4000-8000-000000000001";
const RUN_UUID = "90000000-0000-4000-8000-000000000001";
const ORDER = `fxo_${"a".repeat(32)}`;
const TOKEN = "b".repeat(64);
const TOKEN_HASH = "c".repeat(64);
const NOW = "2026-08-27T00:00:01.000Z";

Deno.test("Banking FX orchestrator exposes POST only with no browser CORS path", async () => {
  let created = false;
  const response = await handleBankingFxOrchestratorRequest(
    new Request("https://scheduler.internal/banking-fx-orchestrator", {
      method: "OPTIONS",
    }),
    dependencies(new FakeRepository(), { onCreate: () => created = true }),
  );
  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST");
  assertEquals(response.headers.get("access-control-allow-origin"), null);
  assertEquals(created, false);
});

Deno.test("Banking FX orchestrator rejects malformed tokens before runtime access", async () => {
  let created = false;
  for (const token of [undefined, "short", "g".repeat(64)]) {
    const headers = new Headers();
    if (token) headers.set(BANKING_FX_SCHEDULER_HEADER, token);
    const response = await handleBankingFxOrchestratorRequest(
      new Request("https://scheduler.internal/banking-fx-orchestrator", {
        method: "POST",
        headers,
      }),
      dependencies(new FakeRepository(), { onCreate: () => created = true }),
    );
    assertEquals(response.status, 401);
    assertEquals((await response.json()).error.code, "invalid_scheduler_token");
  }
  assertEquals(created, false);
});

Deno.test("Banking FX orchestrator authenticates the shared fixed FX scheduler", async () => {
  const repository = new FakeRepository();
  repository.authorized = false;
  const response = await handleBankingFxOrchestratorRequest(
    request(),
    dependencies(repository),
  );
  assertEquals(response.status, 401);
  assertEquals(repository.verifyCalls, [{
    schedulerName: BANKING_FX_SCHEDULER_NAME,
    tokenSha256: TOKEN_HASH,
  }]);
  assertEquals(repository.claimCalls, []);
});

Deno.test("Banking FX orchestrator rejects caller-selected scope after authentication", async () => {
  const repository = new FakeRepository();
  const response = await handleBankingFxOrchestratorRequest(
    request({ gameSessionId: GAME }),
    dependencies(repository),
  );
  assertEquals(response.status, 400);
  assertEquals(
    (await response.json()).error.code,
    "invalid_banking_fx_orchestrator_request",
  );
  assertEquals(repository.claimCalls, []);
});

Deno.test("Banking FX orchestrator settles bounded claims without leaking lease scope", async () => {
  const repository = new FakeRepository();
  repository.claims = [claim()];
  const response = await handleBankingFxOrchestratorRequest(
    request({}),
    dependencies(repository),
  );
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    claimedCount: 1,
    appliedCount: 1,
    replayedCount: 0,
    terminalFailedCount: 0,
    retryableFailedCount: 0,
    failureRecordFailedCount: 0,
    failedCount: 0,
    failureCodes: [],
  });
  assertEquals(repository.claimCalls, [{
    workerName: `banking-fx-run:20260827000001000:${RUN_UUID}`,
    limit: 25,
    leaseSeconds: 300,
    now: NOW,
  }]);
  assertEquals(repository.settleCalls.length, 1);
  assertEquals(repository.failCalls, []);
  assertFalse(JSON.stringify(body).includes(GAME));
  assertFalse(JSON.stringify(body).includes(LEASE));
});

Deno.test("Banking FX orchestrator leaves transient failures to lease recovery", async () => {
  const repository = new FakeRepository();
  repository.claims = [claim()];
  repository.settleError = new StandardFxOrderSettlementError(
    "FX_LIQUIDITY_UNAVAILABLE",
    "Liquidity temporarily unavailable.",
    500,
    true,
    false,
  );
  const response = await handleBankingFxOrchestratorRequest(
    request(),
    dependencies(repository),
  );
  const body = await response.json();
  assertEquals(response.status, 500);
  assertEquals(body.error.retryable, true);
  assertEquals(body.summary.retryableFailedCount, 1);
  assertEquals(body.summary.terminalFailedCount, 0);
  assertEquals(repository.failCalls, []);
});

Deno.test("Banking FX orchestrator terminalizes only an explicit permanent error", async () => {
  const repository = new FakeRepository();
  repository.claims = [claim()];
  repository.settleError = new StandardFxOrderSettlementError(
    "FUNDING_INSUFFICIENT",
    "Permanent funding invariant failure.",
    500,
    false,
    true,
  );
  const response = await handleBankingFxOrchestratorRequest(
    request(),
    dependencies(repository),
  );
  const body = await response.json();
  assertEquals(response.status, 500);
  assertEquals(body.error.retryable, false);
  assertEquals(body.summary.terminalFailedCount, 1);
  assertEquals(body.summary.retryableFailedCount, 0);
  assertEquals(repository.failCalls.length, 1);
});

class FakeRepository
  implements StandardFxOrderSettlementOrchestratorRepository {
  authorized = true;
  claims: readonly StandardFxOrderClaim[] = [];
  settleError: Error | null = null;
  readonly verifyCalls: unknown[] = [];
  readonly claimCalls: unknown[] = [];
  readonly settleCalls: unknown[] = [];
  readonly failCalls: unknown[] = [];

  verifySchedulerToken(input: unknown): Promise<boolean> {
    this.verifyCalls.push(input);
    return Promise.resolve(this.authorized);
  }

  claimDueOrders(input: unknown): Promise<readonly StandardFxOrderClaim[]> {
    this.claimCalls.push(input);
    return Promise.resolve(this.claims);
  }

  settleOrder(input: {
    readonly claim: StandardFxOrderClaim;
    readonly now: string;
  }): Promise<StandardFxOrderCommandResult> {
    this.settleCalls.push(input);
    if (this.settleError) return Promise.reject(this.settleError);
    return Promise.resolve({
      outcome: "applied",
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
    return Promise.resolve({
      outcome: "applied",
      orderKey: input.claim.orderKey,
      status: "failed",
    });
  }
}

function dependencies(
  repository: FakeRepository,
  overrides: { readonly onCreate?: () => void } = {},
) {
  return {
    createRepository: () => {
      overrides.onCreate?.();
      return repository;
    },
    now: () => new Date(NOW),
    randomUuid: () => RUN_UUID,
    hashSchedulerToken: async () => TOKEN_HASH,
  };
}

function request(body?: unknown): Request {
  return new Request("https://scheduler.internal/banking-fx-orchestrator", {
    method: "POST",
    headers: {
      [BANKING_FX_SCHEDULER_HEADER]: TOKEN,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function claim(): StandardFxOrderClaim {
  return {
    gameSessionId: GAME,
    orderKey: ORDER,
    leaseToken: LEASE,
    settlesAt: "2026-08-27T00:00:00.000Z",
  };
}

function assertFalse(value: boolean): void {
  if (value) throw new Error("Expected value to be false.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
