import {
  type StandardFxOrderClaim,
  StandardFxOrderSettlementError,
} from "../services/standardFxOrderSettlementRunner.ts";
import {
  type StandardFxOrderSettlementClient,
  SupabaseStandardFxOrderSettlementRepository,
} from "./supabaseStandardFxOrderSettlementRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const LEASE = "10000000-0000-4000-8000-000000000001";
const ORDER = `fxo_${"a".repeat(32)}`;
const RECEIPT = `fxr_${"b".repeat(32)}`;
const NOW = "2026-08-27T00:00:01.000Z";
const CLAIM: StandardFxOrderClaim = {
  gameSessionId: GAME,
  orderKey: ORDER,
  leaseToken: LEASE,
  settlesAt: "2026-08-27T00:00:00.000Z",
};

Deno.test("standard FX settlement repository verifies the shared FX scheduler digest", async () => {
  const client = new FakeClient({
    verify_runtime_scheduler_token_v1: true,
  });
  const repository = new SupabaseStandardFxOrderSettlementRepository(client);
  assertEquals(
    await repository.verifySchedulerToken({
      schedulerName: "econovaria-fx-runtime-scheduler-v1",
      tokenSha256: "c".repeat(64),
    }),
    true,
  );
  assertEquals(client.calls, [["verify_runtime_scheduler_token_v1", {
    p_scheduler_name: "econovaria-fx-runtime-scheduler-v1",
    p_token_sha256: "c".repeat(64),
  }]]);
});

Deno.test("standard FX settlement repository calls the bounded leased claim RPC", async () => {
  const client = new FakeClient({
    claim_due_standard_fx_orders_v1: [{
      game_session_id: GAME,
      order_key: ORDER,
      lease_token: LEASE,
      settles_at: CLAIM.settlesAt,
    }],
  });
  const repository = new SupabaseStandardFxOrderSettlementRepository(client);
  assertEquals(
    await repository.claimDueOrders({
      workerName: "banking-fx-run:test-001",
      limit: 25,
      leaseSeconds: 300,
      now: NOW,
    }),
    [CLAIM],
  );
  assertEquals(client.calls[0], ["claim_due_standard_fx_orders_v1", {
    p_worker_name: "banking-fx-run:test-001",
    p_limit: 25,
    p_lease_seconds: 300,
    p_now: NOW,
  }]);
  const serialized = JSON.stringify(client.calls[0]);
  assertEquals(serialized.includes("player"), false);
  assertEquals(serialized.includes("business"), false);
  assertEquals(serialized.includes("owner"), false);
});

Deno.test("standard FX settlement repository binds settlement and failure commands to the lease", async () => {
  const client = new FakeClient({
    settle_standard_fx_order_v1: command("settled", RECEIPT),
    fail_standard_fx_order_v1: command("failed", null),
  });
  const repository = new SupabaseStandardFxOrderSettlementRepository(client);
  assertEquals(await repository.settleOrder({ claim: CLAIM, now: NOW }), {
    outcome: "applied",
    orderKey: ORDER,
    status: "settled",
  });
  assertEquals(
    await repository.failOrder({
      claim: CLAIM,
      errorCode: "FUNDING_INSUFFICIENT",
      now: NOW,
    }),
    {
      outcome: "applied",
      orderKey: ORDER,
      status: "failed",
    },
  );
  assertEquals(client.calls, [
    ["settle_standard_fx_order_v1", {
      p_game_session_id: GAME,
      p_order_key: ORDER,
      p_lease_token: LEASE,
      p_now: NOW,
    }],
    ["fail_standard_fx_order_v1", {
      p_game_session_id: GAME,
      p_order_key: ORDER,
      p_lease_token: LEASE,
      p_error_code: "FUNDING_INSUFFICIENT",
      p_now: NOW,
    }],
  ]);
});

Deno.test("standard FX settlement repository fails closed on malformed command evidence", async () => {
  for (
    const value of [
      command("pending", null),
      {
        outcome: "applied",
        order: { order_key: GAME, status: "settled", receipt_key: RECEIPT },
      },
      {
        outcome: "applied",
        order: { order_key: ORDER, status: "settled", receipt_key: GAME },
      },
    ]
  ) {
    const client = new FakeClient({ settle_standard_fx_order_v1: value });
    await assertRejectsCode(
      () =>
        new SupabaseStandardFxOrderSettlementRepository(client).settleOrder({
          claim: CLAIM,
          now: NOW,
        }),
      "standard_fx_order_rpc_result_invalid",
    );
  }
});

Deno.test("standard FX settlement repository terminalizes only reviewed permanent errors", async () => {
  for (
    const [sourceCode, terminal, retryable] of [
      ["FUNDING_INSUFFICIENT", true, false],
      ["BANK_ACCOUNT_NOT_FOUND", true, false],
      ["FX_ORDER_RESERVATION_CONFLICT", true, false],
      ["FX_ORDER_OWNER_INVALID", true, false],
      ["BUSINESS_ACCOUNT_OWNER_INVALID", true, false],
      ["FX_LIQUIDITY_UNAVAILABLE", false, true],
      ["FX_ORDER_LEASE_INVALID", false, true],
      ["57014", false, true],
    ] as const
  ) {
    const client = new FakeClient({}, {
      code: sourceCode === "57014" ? sourceCode : "P0001",
      message: sourceCode,
    });
    try {
      await new SupabaseStandardFxOrderSettlementRepository(client)
        .settleOrder({ claim: CLAIM, now: NOW });
      throw new Error(`Expected ${sourceCode} to reject.`);
    } catch (error) {
      if (!(error instanceof StandardFxOrderSettlementError)) throw error;
      assertEquals([error.terminal, error.retryable], [terminal, retryable]);
    }
  }
});

class FakeClient implements StandardFxOrderSettlementClient {
  readonly calls: [string, unknown][] = [];

  constructor(
    private readonly responses: Readonly<Record<string, unknown>>,
    private readonly error: {
      readonly code?: string;
      readonly message?: string;
    } | null = null,
  ) {}

  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<{
    readonly data: T | null;
    readonly error: {
      readonly code?: string;
      readonly message?: string;
    } | null;
  }> {
    this.calls.push([functionName, args]);
    return Promise.resolve({
      data: (this.responses[functionName] ?? null) as T | null,
      error: this.error,
    });
  }
}

function command(status: string, receiptKey: string | null) {
  return {
    outcome: "applied",
    order: { order_key: ORDER, status, receipt_key: receiptKey },
  };
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
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
