import { BusinessTreasuryError } from "../contracts/businessTreasuryContracts.ts";
import {
  projectBusinessTreasurySnapshot,
  SupabaseBusinessTreasuryRepository,
} from "./supabaseBusinessTreasuryRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const ACCOUNT_ZERO = `bac_${"0".repeat(32)}`;
const ACCOUNT_THREE = `bac_${"3".repeat(32)}`;
const ACCOUNT_EIGHTEEN = `bac_${"8".repeat(32)}`;
const QUOTE_KEY = `fxq_${"b".repeat(32)}`;
const ORDER_KEY = `fxo_${"c".repeat(32)}`;
const RECEIPT_KEY = `fxr_${"d".repeat(32)}`;
const FIXING_KEY = `fxf_${"e".repeat(32)}`;
const TRANSACTION_KEY = `btx_${"f".repeat(32)}`;
const LONG_DECIMAL = "99999999999999999999.123456789012345678";

Deno.test(
  "Business treasury repository maps exact evidence including zero-decimal instant fees",
  async () => {
    const client = new RpcClient({
      get_business_treasury_overview_v1: snapshotRow(),
    });
    const repository = new SupabaseBusinessTreasuryRepository(client as never);
    const snapshot = await repository.readSnapshot(scope());

    assertEquals(client.calls, [[
      "get_business_treasury_overview_v1",
      rpcScope(),
    ]]);
    assertEquals(snapshot.businessKey, BUSINESS_KEY);
    assertEquals(snapshot.accounts.map((entry) => entry.precision), [0, 3, 18]);
    assertEquals(snapshot.accounts[2]?.posted.amount, LONG_DECIMAL);
    assertEquals(snapshot.rates[0], {
      fixingKey: FIXING_KEY,
      sourceCurrencyCode: "ATOM",
      targetCurrencyCode: "MILLI",
      referenceRate: "1.234567890123456789",
      effectiveAt: "2026-08-31T08:00:00.000Z",
      calculatedAt: "2026-08-31T07:59:59.000Z",
      policyVersion: "fx-policy-v1",
    });
    assertEquals(snapshot.orders[0]?.completedAt, null);
    assertEquals(snapshot.orders[0]?.receiptKey, null);
    assertEquals(snapshot.receipts[0], {
      receiptKey: RECEIPT_KEY,
      orderKey: ORDER_KEY,
      quoteKey: QUOTE_KEY,
      bankTransactionKey: TRANSACTION_KEY,
      product: "instant",
      sourceAccountKey: ACCOUNT_ZERO,
      targetAccountKey: ACCOUNT_THREE,
      sourceAmount: {
        amount: "12",
        currencyCode: "WHOLE",
        precision: 0,
      },
      feeAmount: {
        amount: "0",
        currencyCode: "WHOLE",
        precision: 0,
      },
      targetAmount: {
        amount: "42.125",
        currencyCode: "MILLI",
        precision: 3,
      },
      referenceRate: "3.456789012345678901",
      customerRate: "3.439505067283950506",
      spreadRate: "0.005000000000000000",
      feeRate: "0.020000000000000000",
      reserveDrawAmount: {
        amount: "1.000",
        currencyCode: "MILLI",
        precision: 3,
      },
      reserveRepaymentAmount: {
        amount: "1",
        currencyCode: "WHOLE",
        precision: 0,
      },
      fixingKey: FIXING_KEY,
      completedAt: "2026-08-31T08:00:03.000Z",
    });
    assertNoUuid(snapshot);
  },
);

Deno.test(
  "Business treasury repository binds exact RPC arguments including optional target account",
  async () => {
    const client = new RpcClient({
      ensure_business_banking_account_v1: {
        outcome: "replayed",
        account: accountRow(ACCOUNT_THREE, "MILLI", 3, "12.345"),
      },
      create_business_fx_quote_v1: {
        outcome: "applied",
        quote: quoteRow(),
      },
      submit_business_standard_fx_order_v1: {
        outcome: "applied",
        order: orderRow("pending"),
      },
      execute_business_instant_fx_v1: {
        outcome: "replayed",
        order: orderRow("completed"),
      },
      cancel_business_standard_fx_order_v1: {
        outcome: "applied",
        order: orderRow("cancelled"),
      },
    });
    const repository = new SupabaseBusinessTreasuryRepository(client as never);

    const opened = await repository.openCheckingAccount({
      ...scope(),
      currencyCode: "MILLI",
      idempotencyKey: "business-account-open-001",
    });
    const quoteWithoutTarget = await repository.createQuote({
      ...scope(),
      sourceAccountKey: ACCOUNT_EIGHTEEN,
      targetAccountKey: null,
      targetCurrencyCode: "MILLI",
      sourceAmount: "12.345678901234567890",
      product: "instant",
      idempotencyKey: "business-fx-quote-001",
    });
    await repository.createQuote({
      ...scope(),
      sourceAccountKey: ACCOUNT_EIGHTEEN,
      targetAccountKey: ACCOUNT_THREE,
      targetCurrencyCode: "MILLI",
      sourceAmount: "12.345678901234567890",
      product: "instant",
      idempotencyKey: "business-fx-quote-002",
    });
    await repository.submitStandard({
      ...scope(),
      quoteKey: QUOTE_KEY,
      idempotencyKey: "business-fx-standard-001",
    });
    const instant = await repository.executeInstant({
      ...scope(),
      quoteKey: QUOTE_KEY,
      idempotencyKey: "business-fx-instant-001",
    });
    await repository.cancelStandard({
      ...scope(),
      orderKey: ORDER_KEY,
      idempotencyKey: "business-fx-cancel-001",
    });

    assertEquals(client.calls, [
      ["ensure_business_banking_account_v1", {
        ...rpcScope(),
        p_currency_code: "MILLI",
        p_idempotency_key: "business-account-open-001",
      }],
      ["create_business_fx_quote_v1", {
        ...rpcScope(),
        p_source_account_key: ACCOUNT_EIGHTEEN,
        p_target_currency_code: "MILLI",
        p_target_account_key: null,
        p_source_amount: "12.345678901234567890",
        p_product: "instant",
        p_idempotency_key: "business-fx-quote-001",
      }],
      ["create_business_fx_quote_v1", {
        ...rpcScope(),
        p_source_account_key: ACCOUNT_EIGHTEEN,
        p_target_currency_code: "MILLI",
        p_target_account_key: ACCOUNT_THREE,
        p_source_amount: "12.345678901234567890",
        p_product: "instant",
        p_idempotency_key: "business-fx-quote-002",
      }],
      ["submit_business_standard_fx_order_v1", {
        ...rpcScope(),
        p_quote_key: QUOTE_KEY,
        p_idempotency_key: "business-fx-standard-001",
      }],
      ["execute_business_instant_fx_v1", {
        ...rpcScope(),
        p_quote_key: QUOTE_KEY,
        p_idempotency_key: "business-fx-instant-001",
      }],
      ["cancel_business_standard_fx_order_v1", {
        ...rpcScope(),
        p_order_key: ORDER_KEY,
        p_idempotency_key: "business-fx-cancel-001",
      }],
    ]);
    assertEquals(opened.outcome, "replayed");
    assertEquals(
      quoteWithoutTarget.value.sourceAmount.amount,
      "12.345678901234567890",
    );
    assertEquals(instant.outcome, "replayed");
  },
);

Deno.test(
  "Business treasury projections reject UUIDs, numeric money, and invalid currency precision",
  () => {
    const hiddenUuid = {
      ...snapshotRow(),
      internal_id: "00000000-0000-0000-0000-000000000099",
    };
    assertTreasuryError(
      () => projectBusinessTreasurySnapshot(hiddenUuid),
      "business_treasury_result_invalid",
    );

    const numericMoney = snapshotRow();
    numericMoney.accounts = [{
      ...accountRow(ACCOUNT_ZERO, "WHOLE", 0, "10"),
      posted_amount: 10,
    }];
    assertTreasuryError(
      () => projectBusinessTreasurySnapshot(numericMoney),
      "business_treasury_result_invalid",
    );

    const stringPrecision = snapshotRow();
    stringPrecision.accounts = [{
      ...accountRow(ACCOUNT_ZERO, "WHOLE", 0, "10"),
      minor_unit: "0",
    }];
    assertTreasuryError(
      () => projectBusinessTreasurySnapshot(stringPrecision),
      "business_treasury_result_invalid",
    );

    const excessiveScale = snapshotRow();
    excessiveScale.accounts = [
      accountRow(ACCOUNT_THREE, "MILLI", 3, "1.0001"),
    ];
    assertTreasuryError(
      () => projectBusinessTreasurySnapshot(excessiveScale),
      "business_treasury_result_invalid",
    );
  },
);

class RpcClient {
  readonly calls: [string, unknown][] = [];

  constructor(
    private readonly responses: Readonly<Record<string, unknown>>,
    private readonly error: {
      readonly code?: string;
      readonly message?: string;
      readonly details?: string | null;
      readonly hint?: string | null;
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
  return { gameSessionId: GAME_ID, playerId: PLAYER_ID };
}

function rpcScope() {
  return { p_game_session_id: GAME_ID, p_player_id: PLAYER_ID };
}

function snapshotRow(): Record<string, unknown> & { accounts: unknown[] } {
  return {
    business_key: BUSINESS_KEY,
    reporting_currency_code: "MILLI",
    generated_at: "2026-08-31T08:00:04.000Z",
    accounts: [
      accountRow(ACCOUNT_ZERO, "WHOLE", 0, "10"),
      accountRow(ACCOUNT_THREE, "MILLI", 3, "123.456"),
      accountRow(ACCOUNT_EIGHTEEN, "ATOM", 18, LONG_DECIMAL),
    ],
    rates: [{
      fixing_key: FIXING_KEY,
      source_currency_code: "ATOM",
      target_currency_code: "MILLI",
      reference_rate: "1.234567890123456789",
      effective_at: "2026-08-31T08:00:00.000Z",
      calculated_at: "2026-08-31T07:59:59.000Z",
      policy_version: "fx-policy-v1",
    }],
    orders: [orderRow("pending")],
    receipts: [receiptRow()],
  };
}

function accountRow(
  accountKey: string,
  currencyCode: string,
  precision: number,
  postedAmount: string,
) {
  const zero = precision === 0 ? "0" : `0.${"0".repeat(precision)}`;
  return {
    account_key: accountKey,
    account_kind: "checking",
    status: "active",
    currency_code: currencyCode,
    minor_unit: precision,
    posted_amount: postedAmount,
    held_amount: zero,
    available_amount: postedAmount,
  };
}

function quoteRow() {
  return {
    quote_key: QUOTE_KEY,
    product: "instant",
    source_account_key: ACCOUNT_EIGHTEEN,
    target_account_key: ACCOUNT_THREE,
    source_currency_code: "ATOM",
    target_currency_code: "MILLI",
    source_minor_unit: 18,
    target_minor_unit: 3,
    source_amount: "12.345678901234567890",
    reference_rate: "3.456789012345678901",
    customer_rate: "3.439505067283950506",
    spread_rate: "0.005000000000000000",
    fee_rate: "0.020000000000000000",
    fee_amount: "0.246913578024691358",
    target_amount: "42.125",
    fixing_key: FIXING_KEY,
    policy_version: "fx-policy-v1",
    expires_at: "2026-08-31T08:02:00.000Z",
    settles_at: "2026-08-31T08:00:02.000Z",
    requires_fx: true,
    rounding_disclosure: "Target credit is rounded once to MILLI minor units.",
  };
}

function orderRow(status: string) {
  const standard = status !== "completed";
  return {
    order_key: ORDER_KEY,
    quote_key: QUOTE_KEY,
    product: standard ? "standard" : "instant",
    status,
    source_account_key: ACCOUNT_EIGHTEEN,
    target_account_key: ACCOUNT_THREE,
    source_currency_code: "ATOM",
    target_currency_code: "MILLI",
    source_minor_unit: 18,
    target_minor_unit: 3,
    source_amount: "12.345678901234567890",
    fee_amount: standard ? "0.000000000000000000" : "0.246913578024691358",
    target_amount: "42.125",
    reference_rate: "3.456789012345678901",
    customer_rate: "3.439505067283950506",
    spread_rate: "0.005000000000000000",
    fee_rate: standard ? "0.000000000000000000" : "0.020000000000000000",
    fixing_key: FIXING_KEY,
    submitted_at: "2026-08-31T08:00:01.000Z",
    settles_at: "2026-09-01T08:00:00.000Z",
    completed_at: status === "completed" ? "2026-08-31T08:00:03.000Z" : null,
    receipt_key: status === "completed" ? RECEIPT_KEY : null,
  };
}

function receiptRow() {
  return {
    receipt_key: RECEIPT_KEY,
    order_key: ORDER_KEY,
    quote_key: QUOTE_KEY,
    bank_transaction_key: TRANSACTION_KEY,
    product: "instant",
    source_account_key: ACCOUNT_ZERO,
    target_account_key: ACCOUNT_THREE,
    source_currency_code: "WHOLE",
    target_currency_code: "MILLI",
    source_minor_unit: 0,
    target_minor_unit: 3,
    source_amount: "12",
    fee_amount: "0",
    target_amount: "42.125",
    reference_rate: "3.456789012345678901",
    customer_rate: "3.439505067283950506",
    spread_rate: "0.005000000000000000",
    fee_rate: "0.020000000000000000",
    reserve_draw_amount: "1.000",
    reserve_repayment_amount: "1",
    fixing_key: FIXING_KEY,
    completed_at: "2026-08-31T08:00:03.000Z",
  };
}

function assertTreasuryError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    if (!(error instanceof BusinessTreasuryError)) throw error;
    assertEquals(error.code, code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu
      .test(serialized)
  ) throw new Error(`Internal UUID leaked: ${serialized}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
