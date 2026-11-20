import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";

export const GAME_ID = "00000000-0000-4000-8000-000000000101";

export const STAFF_ID = "00000000-0000-4000-8000-000000000201";

export const PLAYER_ID = "00000000-0000-4000-8000-000000000301";

export const LOOKUP_DIGEST = "c".repeat(64);

export class FakeRpcClient implements AdminMutationRpcClient {
  readonly calls: { name: string; args: Record<string, unknown> }[] = [];
  readonly queries: QueryCall[] = [];

  constructor(
    private readonly response: (
      name: string,
      args: Record<string, unknown>,
    ) => unknown,
    private readonly error: { message?: string; code?: string } | null = null,
    private readonly queryResponse?: (
      query: QueryCall,
    ) => { data: unknown; error: { message?: string } | null },
  ) {}

  rpc<T>(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    return Promise.resolve({
      data: this.response(name, args) as T | null,
      error: this.error,
    });
  }

  from(table: string) {
    if (!this.queryResponse) throw new Error(`Unexpected table read: ${table}`);
    return new FakeQuery(table, this.queries, this.queryResponse);
  }
}

export interface QueryCall {
  readonly table: string;
  readonly columns: string;
  readonly filters: readonly { column: string; value: unknown }[];
}

export class FakeQuery {
  private columns = "";
  private readonly filters: { column: string; value: unknown }[] = [];

  constructor(
    private readonly table: string,
    private readonly queries: QueryCall[],
    private readonly response: (
      query: QueryCall,
    ) => { data: unknown; error: { message?: string } | null },
  ) {}

  select(columns: string) {
    this.columns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle() {
    const query = {
      table: this.table,
      columns: this.columns,
      filters: [...this.filters],
    };
    this.queries.push(query);
    return Promise.resolve(this.response(query));
  }
}

export function successResponse(
  args: Record<string, unknown>,
  attendance: Record<string, unknown>,
): unknown {
  return [{
    response_status: 200,
    was_replayed: false,
    response_body: {
      attendance,
      context: args.p_response_context,
    },
  }];
}

export function identity(idempotencyKey: string) {
  return { idempotencyKey, requestId: `${idempotencyKey}-request` };
}

export function attendanceLookupClient(
  queryResponse: (
    query: QueryCall,
  ) => { data: unknown; error: { message?: string } | null },
): FakeRpcClient {
  return new FakeRpcClient(
    (name, args) =>
      name === "admin_read_mutation_replay_v1"
        ? [{ has_replay: false, response_status: null, response_body: null }]
        : successResponse(args, {
          attendance_id: "00000000-0000-4000-8000-000000000401",
          attendance_status: "present",
          attendance_date: "2026-08-05",
          clocked_in_at: "2026-08-05T09:00:00.000Z",
          was_created: true,
          ledger_entry_id: null,
          reward_amount: 2,
          currency_code: "ECO",
        }),
    null,
    queryResponse,
  );
}

export function scanInput(idempotencyKey: string) {
  return {
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    body: { playerId: "SECRET-4826", deviceTimezone: "UTC" },
    identity: identity(idempotencyKey),
  };
}

export function attendanceLookupDependencies(
  overrides: {
    hashValue: (value: string) => Promise<string>;
  },
) {
  return {
    now: () => new Date("2026-08-05T09:00:00.000Z"),
    deriveCredentialLookupDigest: () => Promise.resolve(LOOKUP_DIGEST),
    hashValue: overrides.hashValue,
    readAttendanceWindow: () =>
      Promise.resolve({
        timezone: "UTC",
        lateCutoff: "10:00",
        presentRewardAmount: 2,
        currencyCode: "ECO",
        currencyMode: "fixed",
      }),
    resolveRewardPolicy: () =>
      Promise.resolve({
        configuredBaseAmount: 2,
        effectiveAmount: 2,
        baseCurrencyCode: "ECO",
        currencyCode: "ECO",
        currencyMode: "fixed" as const,
        countryCode: null,
        incomeModifier: 1,
        exchangeRateIndex: 1,
      }),
  };
}

export function attendancePlayerRow() {
  return {
    id: PLAYER_ID,
    display_name: "Avery Stone",
    roster_label: "A-1",
    player_identifier: "RFID:04A1B2C3",
    status: "active",
  };
}

export function hasFilter(
  query: QueryCall | undefined,
  column: string,
  value: unknown,
): boolean {
  return query?.filters.some((filter) =>
    filter.column === column && filter.value === value
  ) ?? false;
}

export async function assertAdminMutationError(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AdminMutationError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      assertEquals(error.message.includes("internal details"), false);
      return;
    }
    throw error;
  }
  throw new Error(`Expected AdminMutationError ${code}.`);
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
