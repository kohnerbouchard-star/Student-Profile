import {
  type BusinessSnapshotDto,
  PlayerBusinessError,
  type PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";

export const GAME_ID = "00000000-0000-4000-8000-000000000001";
export const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
export const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
export const QUOTE_KEY = `bsq_${"b".repeat(32)}`;
export const RECEIPT_KEY = `bsr_${"c".repeat(32)}`;
export const SOURCE_ACCOUNT_KEY = `bac_${"d".repeat(32)}`;
export const TARGET_ACCOUNT_KEY = `bac_${"e".repeat(32)}`;
export const FUNDING_QUOTE_KEY = `pfq_${"f".repeat(32)}`;
export const FUNDING_RECEIPT_KEY = `pfr_${"1".repeat(32)}`;
export const BANK_TRANSACTION_KEY = `btx_${"2".repeat(32)}`;
export const FIXING_KEY = `fxf_${"3".repeat(32)}`;
export const IDEMPOTENCY_KEY = "business-store-test-0001";

export class CapturingRepository implements PlayerBusinessRepository {
  readonly calls: Array<{
    readonly command: string;
    readonly args: Readonly<Record<string, unknown>>;
  }> = [];

  readBusiness(_input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto> {
    return Promise.reject(
      new Error("readBusiness is not used by Business Store tests."),
    );
  }

  execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    this.calls.push({ command, args });
    if (command === "create_business_store_quote_v2") {
      return Promise.resolve(quoteRow());
    }
    if (command === "purchase_business_store_quote_v2") {
      return Promise.resolve(receiptRow());
    }
    return Promise.reject(new Error(`Unexpected command: ${command}`));
  }
}

export class RetiredPaymentRepository extends CapturingRepository {
  override execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    if (command === "purchase_business_store_quote_v2") {
      return Promise.reject(
        new PlayerBusinessError(
          "business_store_procurement_payment_retired",
          "This pre-C4 procurement quote cannot be paid. Create a funded Business Store quote.",
          410,
        ),
      );
    }
    return super.execute(command, args);
  }
}

export function quoteRow(): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    quote_key: QUOTE_KEY,
    item_key: "steel_plate",
    item_name: "Steel Plate",
    quantity: 3,
    country_code: "NRC",
    item_currency_code: "NRC",
    settlement_currency_code: "SOLV",
    item_minor_unit: 2,
    settlement_minor_unit: 2,
    base_unit_price: 8,
    base_unit_amount: "8.00",
    inflation_multiplier: 1.05,
    location_multiplier: 1.1,
    scarcity_multiplier: 1.08,
    item_local_final_unit_price: 9.98,
    item_local_final_total_price: 29.94,
    item_local_final_unit_amount: "9.98",
    item_local_final_total_amount: "29.94",
    exchange_rate: 1.00233801,
    final_unit_price: 10,
    final_total_price: 30.01,
    final_unit_amount: "10.00",
    final_total_amount: "30.01",
    pricing_version: "store-pricing-v1:country-snapshot:test:1",
    expires_at: "2026-08-21T01:03:00.000Z",
    replayed: false,
    funding_quote_key: FUNDING_QUOTE_KEY,
    funding_target_account_key: TARGET_ACCOUNT_KEY,
    funding_quote: fundingQuoteRow(),
  };
}

export function receiptRow(): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    receipt_key: RECEIPT_KEY,
    quote_key: QUOTE_KEY,
    item_key: "steel_plate",
    item_name: "Steel Plate",
    quantity: 3,
    final_unit_price: 10,
    final_total_price: 30.01,
    settlement_minor_unit: 2,
    final_unit_amount: "10.00",
    final_total_amount: "30.01",
    currency_code: "SOLV",
    warehouse_quantity_owned: 8,
    warehouse_average_unit_cost: 9.8765,
    warehouse_average_unit_cost_minor_unit: 4,
    warehouse_average_unit_cost_amount: "9.8765",
    completed_at: "2026-08-21T01:00:01.000Z",
    already_completed: false,
    funding_quote_key: FUNDING_QUOTE_KEY,
    funding_receipt_key: FUNDING_RECEIPT_KEY,
    funding_target_account_key: TARGET_ACCOUNT_KEY,
    funding_receipt: fundingReceiptRow(),
  };
}

export function fundingQuoteRow(): Record<string, unknown> {
  return {
    quote_key: FUNDING_QUOTE_KEY,
    funding_context_kind: "business.store-procurement",
    funding_context_key: QUOTE_KEY,
    target_currency_code: "SOLV",
    target_minor_unit: 2,
    target_amount: "30.01",
    fixing_key: FIXING_KEY,
    policy_version: "purchase-funding-v1",
    requires_fx: true,
    expires_at: "2026-08-21T01:03:00.000Z",
    lines: [fundingQuoteLineRow()],
  };
}

export function fundingQuoteLineRow(): Record<string, unknown> {
  return {
    line_number: 1,
    source_account_key: SOURCE_ACCOUNT_KEY,
    source_currency_code: "NRC",
    source_minor_unit: 18,
    target_currency_code: "SOLV",
    target_minor_unit: 2,
    posted_amount: "100.123456789012345678",
    held_amount: "0",
    available_amount: "100.123456789012345678",
    target_contribution: "30.01",
    source_debit: "29.940032700000000001",
    reference_rate: "1.007777777777777777",
    customer_rate: "1.002738888888888888",
    effective_rate: "1.002338010688042761",
    spread_rate: "0.005",
    requires_fx: true,
    rounding_disclosure: "Source debit is rounded up to the source minor unit.",
  };
}

function fundingReceiptRow(): Record<string, unknown> {
  return {
    receipt_key: FUNDING_RECEIPT_KEY,
    quote_key: FUNDING_QUOTE_KEY,
    bank_transaction_key: BANK_TRANSACTION_KEY,
    target_account_key: TARGET_ACCOUNT_KEY,
    funding_context_kind: "business.store-procurement",
    funding_context_key: QUOTE_KEY,
    target_currency_code: "SOLV",
    target_minor_unit: 2,
    target_amount: "30.01",
    target_reserve_draw_amount: "0",
    source_domain: "business",
    source_action: "store-procurement",
    created_at: "2026-08-21T01:00:01.000Z",
    lines: [{
      line_number: 1,
      source_account_key: SOURCE_ACCOUNT_KEY,
      source_currency_code: "NRC",
      source_minor_unit: 18,
      target_currency_code: "SOLV",
      target_minor_unit: 2,
      target_contribution: "30.01",
      source_debit: "29.940032700000000001",
      reference_rate: "1.007777777777777777",
      customer_rate: "1.002738888888888888",
      effective_rate: "1.002338010688042761",
      spread_rate: "0.005",
      requires_fx: true,
    }],
  };
}

export function handlerDependencies(repository: CapturingRepository) {
  return {
    createServiceClient: () => ({} as never),
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: () =>
      Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID }),
    createRepository: () => repository,
  };
}

export function request(path: string, body: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "session-token",
    },
    body: JSON.stringify(body),
  });
}

export async function assertBusinessError(
  run: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const candidate = error as { status?: unknown; code?: unknown };
    assertEqual(candidate.status, status);
    assertEqual(candidate.code, code);
    return;
  }
  throw new Error("Expected Business error.");
}

export function assertThrows(run: () => unknown): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error("Expected operation to throw.");
}

export function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
      .test(serialized)
  ) throw new Error(`Internal UUID leaked: ${serialized}`);
}

export function assertEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
