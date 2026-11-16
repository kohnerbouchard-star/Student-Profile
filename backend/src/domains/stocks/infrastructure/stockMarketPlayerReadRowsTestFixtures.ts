import { SupabaseStockMarketPlayerReadRepository } from "./supabaseStockMarketPlayerReadRepository.ts";
import { StockMarketPlayerReadError } from "../contracts/stockMarketPlayerReadContracts.ts";

export const input = {
  action: "read_portfolio" as const,
  gameSessionId: "game",
  playerSessionId: "session",
  limit: 7,
};
export const now = new Date("2026-11-14T12:00:00Z");
export const session = {
  id: "session",
  game_session_id: "game",
  player_id: "derived-player",
  status: "active",
  expires_at: "2026-11-14T12:00:01Z",
  revoked_at: null,
};
export const holding = {
  game_session_id: "game",
  player_id: "derived-player",
  player_session_id: "old-session",
  stock_asset_id: "asset",
  ticker: "OLD",
  quantity: "3",
  average_cost: "1.23456789",
  realized_pnl: "-2",
};
export const asset = {
  id: "asset",
  game_session_id: "game",
  ticker: "NEW",
  company_name: "Name",
  sector_key: "sector",
  country_code: "country",
  listing_currency_code: "ECO",
  current_price: "2.3456789",
};
export const order = {
  id: "order",
  stock_asset_id: "asset",
  ticker: "OLD",
  side: "sell",
  quantity: "3",
  execution_price: "2.5",
  gross_value: "7.5",
  status: "rejected",
  rejection_reason: "",
  idempotency_key: "key",
  created_at: "date",
};
export const trade = { ...order, id: "trade", order_id: "order" };

export type Response = {
  data: unknown;
  error: { message: string; code?: string } | null;
};
export function ok(data: unknown): Response {
  return { data, error: null };
}
export function fixture(
  overrides: Record<string, Response | Promise<Response>> = {},
) {
  return new Client({
    player_sessions: ok([session]),
    account_balances: ok([{ balance: "10", currency_code: "ECO" }]),
    rpc: ok([holding]),
    game_session_stock_assets: ok([asset]),
    stock_orders: ok([order]),
    stock_trades: ok([trade]),
    ...overrides,
  });
}
export function repository(client: Client) {
  return new SupabaseStockMarketPlayerReadRepository(client as never, {
    now: () => now,
  });
}
class Client {
  readonly calls: unknown[][] = [];
  constructor(
    readonly responses: Record<string, Response | Promise<Response>>,
  ) {}
  from(table: string) {
    this.calls.push(["from", table]);
    return new Query(this, table);
  }
  rpc(name: string, args: unknown) {
    this.calls.push(["rpc", name, args]);
    return Promise.resolve(this.responses.rpc);
  }
}
class Query {
  constructor(
    private readonly client: Client,
    private readonly table: string,
  ) {}
  select(columns: string) {
    this.client.calls.push(["select", columns]);
    return this;
  }
  eq(column: string, value: unknown) {
    this.client.calls.push(["eq", column, value]);
    return this;
  }
  in(column: string, value: unknown) {
    this.client.calls.push(["in", column, value]);
    return this;
  }
  order(column: string, value: unknown) {
    this.client.calls.push(["order", column, value]);
    return this;
  }
  limit(value: number) {
    this.client.calls.push(["limit", value]);
    return this;
  }
  then(resolve: (response: Response) => unknown) {
    this.client.calls.push(["await", this.table]);
    return Promise.resolve(this.client.responses[this.table]).then(resolve);
  }
}
export async function rejects(
  run: () => Promise<unknown>,
  code: string,
  status: number,
) {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof StockMarketPlayerReadError)) throw error;
    eq(error.code, code);
    eq(error.status, status);
    return;
  }
  throw Error(`Expected ${code}`);
}
export function eq(actual: unknown, expected: unknown): void {
  if (Object.is(actual, expected)) return;
  if (
    actual && expected && typeof actual === "object" &&
    typeof expected === "object"
  ) {
    eq(
      Object.keys(actual).sort().join(","),
      Object.keys(expected).sort().join(","),
    );
    for (const key of Object.keys(expected)) {
      eq(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
      );
    }
    return;
  }
  throw Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
