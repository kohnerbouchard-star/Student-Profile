import {
  type StockMarketBuyQuoteInput,
  type StockMarketBuySettlementInput,
  type StockMarketSellSettlementInput,
  StockMarketTradingError,
  type PlayerStockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";

export const G = "00000000-0000-4000-8000-000000000001";
export const S = "00000000-0000-4000-8000-000000000011";
export const P = "00000000-0000-4000-8000-000000000021";
export const Q = "sbq_11111111111111111111111111111111";
export const A = "bac_22222222222222222222222222222222";
export const B = "bac_33333333333333333333333333333333";
const T = "btx_44444444444444444444444444444444";

export function deps(options: {
  repo?: PlayerStockMarketTradingRepository;
  resolve?: () => Promise<any>;
} = {}): any {
  return {
    createServiceClient: () => ({}),
    readSupabaseEnv: () => ({ ok: true, value: {
      supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "anon",
      supabaseServiceRoleKey: "service-role",
    } }),
    hashSessionToken: async () => "hash",
    resolvePlayerSession: options.resolve ?? (() => Promise.resolve({
      ok: true, session: { id: S, game_session_id: G, player_id: P },
    })),
    createRepository: () => options.repo ?? new MockRepository(),
  };
}

export function req(
  body: Record<string, unknown>,
  options: {
    method?: string;
    token?: string | null;
    runner?: boolean;
    idempotency?: string;
    query?: string;
  } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.token !== null) headers.set("x-player-session-token", options.token ?? "token");
  if (options.runner) headers.set("x-stock-market-runner-secret", "secret");
  if (options.idempotency) headers.set("x-idempotency-key", options.idempotency);
  return new Request(`https://example.test/players/me/stocks/orders${options.query ?? ""}`, {
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" ? undefined : JSON.stringify(body),
  });
}

export function quoteBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action: "create_buy_quote", ticker: "AURA", quantity: 3,
    expectedPrice: 100, expectedTickIndex: 42,
    allocations: [{ sourceAccountKey: A, targetAmount: 300 }],
    idempotencyKey: "stock-op-0001", ...overrides,
  };
}

export function retiredOrderBody() {
  return {
    ticker: "AURA", expectedPrice: 100, side: "buy", quantity: 3,
    idempotencyKey: "retired-order-0001",
  };
}

export class MockRepository implements PlayerStockMarketTradingRepository {
  readonly inputs: any[] = [];
  constructor(private readonly error: StockMarketTradingError | null = null) {}
  async createBuyQuote(input: StockMarketBuyQuoteInput) {
    this.inputs.push({ operation: "quote", ...input });
    if (this.error) throw this.error;
    return {
      quoteKey: Q, ticker: "AURA", listingCurrencyCode: "XAL", quantity: 3,
      quotedPrice: 100, priceTickIndex: 42, grossValue: 300,
      expiresAt: "2026-08-30T13:05:00.000Z",
      funding: { quote_key: "pfq_55555555555555555555555555555555" },
    } as const;
  }
  async settleBuyQuote(input: StockMarketBuySettlementInput) {
    this.inputs.push({ operation: "buy", ...input });
    if (this.error) throw this.error;
    return {
      quoteKey: Q, ticker: "AURA", listingCurrencyCode: "XAL", quantity: 3,
      executionPrice: 100, priceTickIndex: 42, grossValue: 300,
      holdingQuantityAfter: 8, averageCostAfter: 95,
      filledAt: "2026-08-30T13:04:00.000Z", alreadyCompleted: false,
      funding: { receipt_key: "pfr_66666666666666666666666666666666" },
    } as const;
  }
  async settleSell(input: StockMarketSellSettlementInput) {
    this.inputs.push({ operation: "sell", ...input });
    if (this.error) throw this.error;
    return {
      ticker: "AURA", listingCurrencyCode: "XAL", quantity: 2,
      executionPrice: 105, priceTickIndex: 43, grossValue: 210,
      holdingQuantityAfter: 6, averageCostAfter: 95,
      filledAt: "2026-08-30T13:06:00.000Z", destinationAccountKey: A,
      settlementTransactionKey: T, alreadyCompleted: false,
    } as const;
  }
}

export async function expectError(response: Response, status: number, code: string) {
  const body = await response.json();
  assertEquals([response.status, body.error.code], [status, code]);
}
export function assertNoUuid(value: unknown) {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(JSON.stringify(value))) {
    throw new Error("UUID leaked");
  }
}
export function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
