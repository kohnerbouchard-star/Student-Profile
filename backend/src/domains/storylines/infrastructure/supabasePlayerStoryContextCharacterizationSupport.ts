import { SupabasePlayerStoryContextRepository } from "./supabasePlayerStoryContextRepository.ts";

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[] | null>;
export interface Response {
  data: Row[] | null;
  error:
    | { message: string; code?: string; details?: string; hint?: string }
    | null;
}
export interface Call {
  table: string;
  operations: unknown[][];
}

// Intentionally returns supplied rows verbatim: query contracts are asserted separately.
export class RecordingClient {
  calls: Call[] = [];
  admitted: string[] = [];
  pending = new Map<string, (response: Response) => void>();
  constructor(
    readonly tables: Tables = {},
    readonly errors: Record<string, Response["error"]> = {},
    readonly deferred = false,
  ) {}
  from(table: string) {
    const call: Call = { table, operations: [] };
    this.calls.push(call);
    const client = this;
    const query = {
      select(columns: string) {
        call.operations.push(["select", columns]);
        return query;
      },
      eq(column: string, value: unknown) {
        call.operations.push(["eq", column, value]);
        return query;
      },
      in(column: string, values: readonly unknown[]) {
        call.operations.push(["in", column, values]);
        return query;
      },
      order(column: string, options: unknown) {
        call.operations.push(["order", column, options]);
        return query;
      },
      then<TResult1 = Response, TResult2 = never>(
        resolve?:
          | ((value: Response) => TResult1 | PromiseLike<TResult1>)
          | null,
        reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        client.admitted.push(table);
        const response = {
          data: client.tables[table] ?? null,
          error: client.errors[table] ?? null,
        };
        const promise = client.deferred
          ? new Promise<Response>((done) => client.pending.set(table, done))
          : Promise.resolve(response);
        return promise.then(resolve, reject);
      },
    };
    return query;
  }
  release(table: string) {
    const done = this.pending.get(table);
    if (!done) throw new Error(`No pending read: ${table}`);
    this.pending.delete(table);
    done({
      data: this.tables[table] ?? null,
      error: this.errors[table] ?? null,
    });
  }
}
export const initialTables = [
  "players",
  "player_country_assignments",
  "account_balances",
  "game_session_stock_assets",
  "stock_holdings",
  "game_session_contracts",
  "player_contract_progress",
  "player_story_relationships",
  "game_session_story_flags",
];
export function read(tables: Tables) {
  return new SupabasePlayerStoryContextRepository(new RecordingClient(tables))
    .listPlayerStoryContexts("game-1");
}
export function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}
export function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}
export async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
