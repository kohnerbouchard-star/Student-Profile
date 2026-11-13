import {
  type PlayerGameDashboardReadDependencies,
  SupabasePlayerGameDashboardRepository,
} from "./supabasePlayerGameDashboardRepository.ts";

export type Row = Record<string, unknown>;
type Response = { data: unknown; error: { message: string } | null };
type Operation = readonly unknown[];
export const input = {
  gameSessionId: "game",
  playerSessionId: "session",
  playerId: "me",
  playerDisplayName: "Session name",
  playerRosterLabel: "Session roster",
};
export const instant = new Date("2026-11-14T12:00:00Z");

export function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
export function ok(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function failure(
  action: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected rejection");
}

// Deliberately records fluent calls rather than deriving expected scopes from them.
// Responses are independently supplied, so missing filters cannot hide in fixtures.
export class Client {
  calls: { table: string; operations: Operation[] }[] = [];
  rpcCalls: unknown[] = [];
  responses: Record<string, Response> = {
    game_sessions: {
      data: { id: "game", name: "Game", status: "active" },
      error: null,
    },
  };
  positions: Response = { data: [], error: null };
  from(table: string) {
    const operations: Operation[] = [];
    this.calls.push({ table, operations });
    const result = this.responses[table] ?? { data: [], error: null };
    const promise = Promise.resolve(
      result as { data: unknown[] | null; error: null },
    );
    const builder = {
      select: (columns: string) => {
        operations.push(["select", columns]);
        return builder;
      },
      eq: (column: string, value: unknown) => {
        operations.push(["eq", column, value]);
        return builder;
      },
      in: (column: string, values: readonly unknown[]) => {
        operations.push(["in", column, values]);
        return builder;
      },
      order: (column: string, options?: { readonly ascending?: boolean }) => {
        operations.push(["order", column, options]);
        return builder;
      },
      limit: (count: number) => {
        operations.push(["limit", count]);
        return builder;
      },
      maybeSingle: () => {
        operations.push(["maybeSingle"]);
        return Promise.resolve(result);
      },
      then: promise.then.bind(promise),
    };
    return builder;
  }
  rpc<Data = unknown>(name: string, args?: unknown) {
    this.rpcCalls.push([name, args]);
    return Promise.resolve(
      this.positions as { data: Data | null; error: null },
    );
  }
  rows(table: string, data: unknown): void {
    this.responses[table] = { data, error: null };
  }
}
export function setup() {
  const client = new Client();
  const calls: unknown[] = [];
  const dependencies: PlayerGameDashboardReadDependencies = {
    stockMarketReadRepository: {
      read: async (value) => {
        calls.push(["market", value]);
        return { gameSessionId: "game", tickIndex: 17, stocks: [] };
      },
    },
    stockMarketOpenStateReadRepository: {
      read: async (game, now) => {
        calls.push(["open", game, now]);
        return true;
      },
    },
    playerContractsReadQuery: {
      read: async (value) => {
        calls.push(["contracts", value]);
        return { available: [], progress: [] };
      },
    },
    storeListingsReadQuery: {
      read: async (game) => {
        calls.push(["store", game]);
        return [];
      },
    },
  };
  return {
    client,
    calls,
    dependencies,
    read: () =>
      new SupabasePlayerGameDashboardRepository(
        client,
        dependencies,
        () => instant,
      ).read(input),
  };
}
export function countries(client: Client, assignments: Row[], profiles: Row[]) {
  client.rows("player_country_assignments", assignments);
  client.rows("country_profiles", profiles);
}
export function position(overrides: Row = {}): Row {
  return {
    game_session_id: "game",
    listing_currency_code: "ECO",
    player_id: "me",
    stock_asset_id: "stock",
    ticker: "OLD",
    quantity: "2",
    average_cost: "3",
    realized_pnl: "1.25",
    ...overrides,
  };
}
