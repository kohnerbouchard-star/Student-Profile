import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { PlayerBankingFxError } from "../contracts/playerBankingFxContracts.ts";
import { SupabasePlayerBankingFxRepository } from "./supabasePlayerBankingFxRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const ACCOUNT = `bac_${"a".repeat(32)}`;
const TARGET_ACCOUNT = `bac_${"b".repeat(32)}`;
const QUOTE = `fxq_${"c".repeat(32)}`;
const ORDER = `fxo_${"d".repeat(32)}`;
const RECEIPT = `fxr_${"e".repeat(32)}`;
const FIXING = `fxf_${"f".repeat(32)}`;

Deno.test("Player Banking FX repository composes hold-aware accounts with current fixing and orders", async () => {
  const client = new RpcClient({
    get_player_banking_fx_overview_v1: {
      fixing: fixingRow(),
      currencies: [
        { currency_code: "NRC", minor_unit: 2 },
        { currency_code: "ECO", minor_unit: 2 },
      ],
      orders: [orderRow("pending"), orderRow("completed")],
    },
    list_player_bank_accounts_v1: [{
      account_key: ACCOUNT,
      account_kind: "checking",
      currency_code: "ECO",
      posted_amount: "1000.00",
      held_amount: "100.00",
      available_amount: "900.00",
    }],
  });
  const repository = new SupabasePlayerBankingFxRepository(client as never);
  const overview = await repository.readOverview(scope());

  assertEquals(client.calls, [
    ["get_player_banking_fx_overview_v1", rpcScope()],
    ["list_player_bank_accounts_v1", rpcScope()],
  ]);
  assertEquals(overview.accounts, [{
    accountKey: ACCOUNT,
    accountKind: "checking",
    accountType: "checking",
    balance: 1000,
    currencyCode: "ECO",
    postedAmount: 1000,
    heldAmount: 100,
    availableAmount: 900,
  }]);
  assertEquals(overview.fixing.fixingKey, FIXING);
  assertEquals(overview.currencies, [
    { currencyCode: "ECO", minorUnit: 2 },
    { currencyCode: "NRC", minorUnit: 2 },
  ]);
  assertEquals(overview.pendingOrders.length, 1);
  assertEquals(overview.completedOrders.length, 1);
  assertNoUuid(overview);
});

Deno.test("Player Banking FX repository performs cursor reads with one-row lookahead", async () => {
  const client = new RpcClient({
    list_player_fx_rate_history_v1: [historyRow(), historyRow()],
    list_player_fx_orders_v1: {
      orders: [orderRow("pending")],
      has_more: true,
    },
  });
  const repository = new SupabasePlayerBankingFxRepository(client as never);
  const history = await repository.listHistory({
    ...scope(),
    sourceCurrencyCode: "ECO",
    targetCurrencyCode: "NRC",
    range: "7d",
    limit: 1,
    cursor: "fxc_history",
    beforeAt: "2026-08-25T00:00:00.000Z",
    beforeKey: FIXING,
  });
  const orders = await repository.listOrders({
    ...scope(),
    status: "pending",
    limit: 20,
    cursor: null,
    beforeAt: null,
    beforeKey: null,
  });

  assertEquals(client.calls[0], ["list_player_fx_rate_history_v1", {
    ...rpcScope(),
    p_source_currency_code: "ECO",
    p_target_currency_code: "NRC",
    p_range: "7d",
    p_limit: 2,
    p_before_at: "2026-08-25T00:00:00.000Z",
    p_before_key: FIXING,
  }]);
  assertEquals(client.calls[1], ["list_player_fx_orders_v1", {
    ...rpcScope(),
    p_status: "pending",
    p_limit: 21,
    p_before_at: null,
    p_before_key: null,
  }]);
  assertEquals(history.items, [{
    fixingKey: FIXING,
    effectiveAt: "2026-08-26T00:00:00.000Z",
    sourceCurrencyCode: "ECO",
    targetCurrencyCode: "NRC",
    referenceRate: "1.2",
  }]);
  assertEquals(history.hasMore, true);
  assertEquals(orders.items[0]?.orderKey, ORDER);
  assertEquals(orders.hasMore, true);
});

Deno.test("Player Banking FX repository calls exact immutable quote and settlement RPCs", async () => {
  const client = new RpcClient({
    create_player_fx_quote_v1: { outcome: "applied", quote: quoteRow() },
    submit_player_standard_fx_order_v1: {
      outcome: "applied",
      order: orderRow("pending"),
    },
    execute_player_instant_fx_v1: {
      replayed: true,
      order: orderRow("completed"),
    },
    cancel_player_standard_fx_order_v1: {
      outcome: "replayed",
      order: orderRow("cancelled"),
    },
  });
  const repository = new SupabasePlayerBankingFxRepository(client as never);
  const quote = await repository.createQuote({
    ...scope(),
    sourceAccountKey: ACCOUNT,
    targetCurrencyCode: "NRC",
    sourceAmount: "100.5",
    product: "standard",
    idempotencyKey: "fx-quote-request-001",
  });
  const standard = await repository.submitStandard({
    ...scope(),
    quoteKey: QUOTE,
    idempotencyKey: "fx-standard-request-001",
  });
  const instant = await repository.executeInstant({
    ...scope(),
    quoteKey: QUOTE,
    idempotencyKey: "fx-instant-request-001",
  });
  const cancel = await repository.cancelStandard({
    ...scope(),
    orderKey: ORDER,
    idempotencyKey: "fx-cancel-request-001",
  });

  assertEquals(client.calls, [
    ["create_player_fx_quote_v1", {
      ...rpcScope(),
      p_source_account_key: ACCOUNT,
      p_target_currency_code: "NRC",
      p_source_amount: "100.5",
      p_product: "standard",
      p_idempotency_key: "fx-quote-request-001",
    }],
    ["submit_player_standard_fx_order_v1", {
      ...rpcScope(),
      p_quote_key: QUOTE,
      p_idempotency_key: "fx-standard-request-001",
    }],
    ["execute_player_instant_fx_v1", {
      ...rpcScope(),
      p_quote_key: QUOTE,
      p_idempotency_key: "fx-instant-request-001",
    }],
    ["cancel_player_standard_fx_order_v1", {
      ...rpcScope(),
      p_order_key: ORDER,
      p_idempotency_key: "fx-cancel-request-001",
    }],
  ]);
  assertEquals(quote.outcome, "applied");
  assertEquals(quote.value.quoteKey, QUOTE);
  assertEquals(standard.value.status, "pending");
  assertEquals(instant.outcome, "replayed");
  assertEquals(cancel.outcome, "replayed");
  assertNoUuid({ quote, standard, instant, cancel });
});

Deno.test("Player Banking FX repository fails closed on internal or malformed result identities", async () => {
  for (
    const invalidKey of [
      GAME,
      "fxq_not-public",
      `fxq_${"G".repeat(32)}`,
    ]
  ) {
    const client = new RpcClient({
      create_player_fx_quote_v1: {
        quote: { ...quoteRow(), quote_key: invalidKey },
      },
    });
    const repository = new SupabasePlayerBankingFxRepository(client as never);
    await assertRejectsCode(
      () =>
        repository.createQuote({
          ...scope(),
          sourceAccountKey: ACCOUNT,
          targetCurrencyCode: "NRC",
          sourceAmount: "1",
          product: "instant",
          idempotencyKey: "fx-invalid-result-001",
        }),
      "player_banking_fx_result_invalid",
    );
  }
});

Deno.test("Player Banking FX repository maps the stable conflict and liquidity error contract", async () => {
  const cases = [
    ["FX_LIQUIDITY_UNAVAILABLE", "FX_LIQUIDITY_UNAVAILABLE", 409, true],
    ["FX_QUOTE_EXPIRED", "FX_QUOTE_EXPIRED", 409, false],
    [
      "FX_QUOTE_SOURCE_PRECISION_INVALID",
      "FX_QUOTE_SOURCE_PRECISION_INVALID",
      400,
      false,
    ],
    ["FX_RATE_VERSION_STALE", "FX_RATE_VERSION_STALE", 409, true],
    ["FX_QUOTE_CONSUMED", "FX_QUOTE_CONSUMED", 409, false],
    ["IDEMPOTENCY_KEY_CONFLICT", "FX_QUOTE_CONFLICT", 409, false],
    ["INSUFFICIENT_FUNDS", "FUNDING_INSUFFICIENT", 409, false],
    ["FX_QUOTE_PRODUCT_MISMATCH", "FX_PRODUCT_MISMATCH", 409, false],
    [
      "FX_ORDER_CANCELLATION_NOT_ALLOWED",
      "FX_ORDER_NOT_CANCELLABLE",
      409,
      false,
    ],
  ] as const;
  for (const [sourceCode, publicCode, status, retryable] of cases) {
    const client = new RpcClient({}, {
      code: "P0001",
      message: `${sourceCode} operation rejected`,
    });
    const repository = new SupabasePlayerBankingFxRepository(client as never);
    try {
      await repository.createQuote({
        ...scope(),
        sourceAccountKey: ACCOUNT,
        targetCurrencyCode: "NRC",
        sourceAmount: "1",
        product: "instant",
        idempotencyKey: "fx-error-contract-001",
      });
      throw new Error(`Expected ${sourceCode} to reject.`);
    } catch (error) {
      if (!(error instanceof PlayerBankingFxError)) throw error;
      assertEquals([error.code, error.status, error.retryable], [
        publicCode,
        status,
        retryable,
      ]);
    }
  }
});

class RpcClient {
  readonly calls: [string, unknown][] = [];

  constructor(
    private readonly responses: Readonly<Record<string, unknown>>,
    private readonly error: {
      readonly code?: string;
      readonly message?: string;
      readonly details?: string;
      readonly hint?: string;
    } | null = null,
  ) {}

  rpc(command: string, args: unknown) {
    this.calls.push([command, args]);
    return Promise.resolve({
      data: this.responses[command] ?? null,
      error: this.error,
    });
  }
}

function scope() {
  return { gameSessionId: GAME, playerId: PLAYER };
}

function rpcScope() {
  return { p_game_session_id: GAME, p_player_id: PLAYER };
}

function fixingRow() {
  return {
    fixing_key: FIXING,
    effective_at: "2026-08-26T00:00:00.000Z",
    calculated_at: "2026-08-26T00:00:01.000Z",
    next_fixing_at: "2026-08-27T00:00:00.000Z",
    overdue: false,
    policy_version: "fx-policy-v1",
  };
}

function quoteRow() {
  return {
    quote_key: QUOTE,
    product: "standard",
    source_account_key: ACCOUNT,
    target_account_key: TARGET_ACCOUNT,
    source_currency_code: "ECO",
    target_currency_code: "NRC",
    source_minor_unit: 2,
    target_minor_unit: 2,
    source_amount_mode: "source_debit",
    source_amount: "100.50",
    reference_rate: "1.2",
    customer_rate: "1.194",
    spread_rate: "0.005",
    fee_amount: "0",
    target_amount: "119.99",
    fixing_key: FIXING,
    policy_version: "fx-policy-v1",
    expires_at: "2026-08-26T00:02:00.000Z",
    settles_at: "2026-08-27T00:00:00.000Z",
    requires_fx: true,
    rounding_disclosure: "Target credit is rounded once to NRC minor units.",
  };
}

function orderRow(status: string) {
  return {
    order_key: ORDER,
    quote_key: QUOTE,
    product: "standard",
    status,
    source_currency_code: "ECO",
    target_currency_code: "NRC",
    source_amount: "100.50",
    fee_amount: "0",
    target_amount: "119.99",
    submitted_at: "2026-08-26T00:00:20.000Z",
    settles_at: "2026-08-27T00:00:00.000Z",
    completed_at: status === "completed" ? "2026-08-27T00:00:01.000Z" : null,
    receipt_key: status === "completed" ? RECEIPT : null,
  };
}

function historyRow() {
  return {
    fixing_key: FIXING,
    effective_at: "2026-08-26T00:00:00.000Z",
    source_currency_code: "ECO",
    target_currency_code: "NRC",
    reference_rate: "1.2",
  };
}

async function assertRejectsCode(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await action();
    throw new Error(`Expected rejection ${code}.`);
  } catch (error) {
    if (!(error instanceof PlayerBankingFxError)) throw error;
    assertEquals(error.code, code);
  }
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
      .test(serialized)
  ) {
    throw new Error(`Player FX result leaked an internal UUID: ${serialized}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
