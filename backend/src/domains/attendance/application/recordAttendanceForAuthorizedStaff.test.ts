import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  recordAttendanceForAuthorizedStaff,
  recordAttendanceScanForAuthorizedStaff,
  recordManualAttendanceForAuthorizedStaff,
} from "./recordAttendanceForAuthorizedStaff.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const PLAYER_ID = "00000000-0000-4000-8000-000000000301";
const LOOKUP_DIGEST = "c".repeat(64);

Deno.test("manual attendance uses one atomic RPC and excludes dynamic defaults from its fingerprint", async () => {
  const client = new FakeRpcClient((_name, args) =>
    successResponse(args, {
      id: "00000000-0000-4000-8000-000000000401",
      game_session_id: GAME_ID,
      player_id: PLAYER_ID,
      attendance_date: "2026-08-05",
      status: "present",
      clocked_in_at: "2026-08-05T01:02:03.000Z",
    })
  );
  const result = await recordManualAttendanceForAuthorizedStaff({
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    body: {
      studentId: PLAYER_ID,
      action: "mark-present",
      reason: "Verified by teacher",
    },
    identity: identity("manual-attendance-key-0001"),
    now: new Date("2026-08-05T01:02:03.000Z"),
  }, client);

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0]?.name, "admin_record_attendance_v1");
  assertEquals(client.calls[0]?.args.p_operation, "manual");
  assertEquals(client.calls[0]?.args.p_attendance_date, "2026-08-05");
  assertEquals(
    client.calls[0]?.args.p_clocked_in_at,
    "2026-08-05T01:02:03.000Z",
  );
  assertEquals(client.calls[0]?.args.p_reward_amount, null);
  assertEquals(client.calls[0]?.args.p_currency_code, null);
  const fingerprint = JSON.stringify(
    client.calls[0]?.args.p_request_payload,
  );
  assertEquals(fingerprint.includes("2026-08-05"), false);
  assertEquals(fingerprint.includes("01:02:03"), false);
  assertEquals(result.corrected, true);
  assertEquals(result.status, 200);
});

Deno.test("manual attendance unwraps v606 action envelopes and derives each correction status", async () => {
  const client = new FakeRpcClient((_name, args) =>
    successResponse(args, {
      id: "00000000-0000-4000-8000-000000000401",
      game_session_id: GAME_ID,
      player_id: args.p_player_id,
      attendance_date: args.p_attendance_date,
      status: args.p_status,
      clocked_in_at: args.p_clocked_in_at,
    })
  );
  const cases = [
    ["attendance-mark-present", "present"],
    ["attendance-mark-late", "late"],
    ["attendance-mark-absent", "absent"],
    ["attendance-mark-excused", "excused"],
  ] as const;

  for (const [action, expectedStatus] of cases) {
    await recordManualAttendanceForAuthorizedStaff({
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      body: {
        action,
        payload: {
          playerId: PLAYER_ID,
          recordDate: "2026-08-04",
          note: `v606 ${expectedStatus}`,
        },
      },
      identity: identity(`manual-${expectedStatus}-key-0001`),
      now: new Date("2026-08-05T01:02:03.000Z"),
    }, client);
  }

  assertEquals(
    client.calls.map((call) => call.args.p_status),
    cases.map(([, status]) => status),
  );
  assertEquals(
    client.calls.map((call) => call.args.p_player_id),
    cases.map(() => PLAYER_ID),
  );
  assertEquals(
    client.calls.map((call) => call.args.p_attendance_date),
    cases.map(() => "2026-08-04"),
  );
  assertEquals(client.calls[2]?.args.p_clocked_in_at, null);
  assertEquals(client.calls[3]?.args.p_clocked_in_at, null);
});

Deno.test("manual correction honors an explicit status inside the v606 payload", async () => {
  const client = new FakeRpcClient((_name, args) =>
    successResponse(args, {
      id: "00000000-0000-4000-8000-000000000401",
      game_session_id: GAME_ID,
      player_id: args.p_player_id,
      attendance_date: args.p_attendance_date,
      status: args.p_status,
      clocked_in_at: args.p_clocked_in_at,
    })
  );

  await recordManualAttendanceForAuthorizedStaff({
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    body: {
      action: "manual-attendance-correction",
      payload: {
        studentId: PLAYER_ID,
        status: "late",
        attendanceDate: "2026-08-03",
        clockedInAt: "2026-08-03T00:15:00.000Z",
        reason: "Teacher correction",
      },
    },
    identity: identity("manual-payload-status-key-0001"),
    now: new Date("2026-08-05T01:02:03.000Z"),
  }, client);

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0]?.args.p_player_id, PLAYER_ID);
  assertEquals(client.calls[0]?.args.p_status, "late");
  assertEquals(client.calls[0]?.args.p_attendance_date, "2026-08-03");
  assertEquals(
    client.calls[0]?.args.p_clocked_in_at,
    "2026-08-03T00:15:00.000Z",
  );
  assertEquals(client.calls[0]?.args.p_note, "Teacher correction");
});

Deno.test("manual attendance maps a same-key different-payload RPC conflict to 409", async () => {
  const client = new FakeRpcClient(() => null, {
    message: "ADMIN_MUTATION_IDEMPOTENCY_CONFLICT",
  });

  await assertAdminMutationError(
    () =>
      recordManualAttendanceForAuthorizedStaff({
        gameSessionId: GAME_ID,
        staffUserId: STAFF_ID,
        body: {
          playerId: PLAYER_ID,
          status: "absent",
          reason: "Changed after the original present request",
        },
        identity: identity("manual-attendance-key-0001"),
        now: new Date("2026-08-05T01:02:03.000Z"),
      }, client),
    "idempotency_key_conflict",
    409,
  );
  assertEquals(client.calls.length, 1);
  assertEquals(
    client.calls[0]?.args.p_idempotency_key,
    "manual-attendance-key-0001",
  );
  assertEquals(client.calls[0]?.args.p_status, "absent");
});

Deno.test("scanner attendance keeps lookup/policy local and sends only a peppered lookup digest to the RPC", async () => {
  const client = new FakeRpcClient((name, args) =>
    name === "admin_read_mutation_replay_v1"
      ? [{ has_replay: false, response_status: null, response_body: null }]
      : successResponse(args, {
        attendance_id: "00000000-0000-4000-8000-000000000401",
        attendance_status: "present",
        attendance_date: "2026-08-05",
        clocked_in_at: "2026-08-05T09:00:00.000Z",
        was_created: true,
        ledger_entry_id: "00000000-0000-4000-8000-000000000501",
        reward_amount: 2,
        currency_code: "ECO",
      })
  );
  const serviceClient = client as unknown as EdgeSupabaseClient;
  const result = await recordAttendanceScanForAuthorizedStaff(
    {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      body: {
        playerId: "SECRET-4826",
        deviceTimezone: "UTC",
      },
      identity: identity("scan-attendance-key-0001"),
    },
    serviceClient,
    {
      now: () => new Date("2026-08-05T09:00:00.000Z"),
      deriveCredentialLookupDigest: () => Promise.resolve(LOOKUP_DIGEST),
      readPlayer: () =>
        Promise.resolve({
          id: PLAYER_ID,
          display_name: "Avery Stone",
          roster_label: "A-1",
          player_identifier: "RFID:04A1B2C3",
          status: "active",
        }),
      readAttendanceWindow: () =>
        Promise.resolve({
          timezone: "Asia/Seoul",
          lateCutoff: "10:00",
          presentRewardAmount: 2,
          lateRewardAmount: 1,
          currencyCode: "ECO",
          currencyMode: "fixed",
        }),
      resolveRewardPolicy: () =>
        Promise.resolve({
          configuredBaseAmount: 2,
          effectiveAmount: 2,
          baseCurrencyCode: "ECO",
          currencyCode: "ECO",
          currencyMode: "fixed",
          countryCode: null,
          incomeModifier: 1,
          exchangeRateIndex: 1,
        }),
    },
  );

  assertEquals(client.calls.length, 2);
  assertEquals(client.calls[0]?.name, "admin_read_mutation_replay_v1");
  assertEquals(client.calls[1]?.name, "admin_record_attendance_v1");
  assertEquals(client.calls[1]?.args.p_operation, "scan");
  assertEquals(client.calls[1]?.args.p_player_id, PLAYER_ID);
  assertEquals(client.calls[1]?.args.p_status, "present");
  assertEquals(client.calls[1]?.args.p_reward_amount, 2);
  const serializedArgs = JSON.stringify(client.calls[1]?.args);
  assertEquals(serializedArgs.includes("SECRET-4826"), false);
  assertEquals(
    typeof (client.calls[1]?.args.p_request_payload as {
      scanValueLookupDigest?: unknown;
    }).scanValueLookupDigest === "string",
    true,
  );
  assertEquals(
    (client.calls[1]?.args.p_request_payload as {
      scanValueLookupDigest?: unknown;
    }).scanValueLookupDigest,
    LOOKUP_DIGEST,
  );
  assertEquals(result.player.id, PLAYER_ID);
  assertEquals(result.attendance.was_created, true);
  assertEquals(result.attendance.timezone, "UTC");
  assertEquals(result.reward.currencyMode, "fixed");
});

Deno.test("scanner access-code lookup queries current peppered credentials without a legacy hash", async () => {
  let legacyHashCalls = 0;
  const client = attendanceLookupClient((query) => {
    if (query.table === "players" && hasFilter(query, "id", PLAYER_ID)) {
      return { data: attendancePlayerRow(), error: null };
    }
    if (query.table === "players") return { data: null, error: null };
    if (
      query.table === "player_access_credentials" &&
      hasFilter(query, "credential_version", "pbkdf2-sha256-v2") &&
      hasFilter(query, "normalized_student_code_hash", LOOKUP_DIGEST)
    ) {
      return { data: { player_id: PLAYER_ID }, error: null };
    }
    throw new Error(`Unexpected query: ${JSON.stringify(query)}`);
  });

  const result = await recordAttendanceScanForAuthorizedStaff(
    scanInput("scan-attendance-key-current"),
    client as unknown as EdgeSupabaseClient,
    attendanceLookupDependencies({
      hashValue: () => {
        legacyHashCalls += 1;
        return Promise.resolve("d".repeat(64));
      },
    }),
  );

  assertEquals(result.player.id, PLAYER_ID);
  assertEquals(legacyHashCalls, 0);
  const credentialQueries = client.queries.filter((query) =>
    query.table === "player_access_credentials"
  );
  assertEquals(credentialQueries.length, 1);
  assertEquals(
    hasFilter(credentialQueries[0], "credential_version", "pbkdf2-sha256-v2"),
    true,
  );
});

Deno.test("scanner access-code lookup falls back only to version-gated legacy SHA-256 rows", async () => {
  const legacyDigest = "d".repeat(64);
  let legacyHashCalls = 0;
  const client = attendanceLookupClient((query) => {
    if (query.table === "players" && hasFilter(query, "id", PLAYER_ID)) {
      return { data: attendancePlayerRow(), error: null };
    }
    if (query.table === "players") return { data: null, error: null };
    if (
      query.table === "player_access_credentials" &&
      hasFilter(query, "credential_version", "pbkdf2-sha256-v2")
    ) {
      return { data: null, error: null };
    }
    if (
      query.table === "player_access_credentials" &&
      hasFilter(query, "credential_version", "sha256-v1") &&
      hasFilter(query, "normalized_student_code_hash", legacyDigest)
    ) {
      return { data: { player_id: PLAYER_ID }, error: null };
    }
    throw new Error(`Unexpected query: ${JSON.stringify(query)}`);
  });

  const result = await recordAttendanceScanForAuthorizedStaff(
    scanInput("scan-attendance-key-legacy"),
    client as unknown as EdgeSupabaseClient,
    attendanceLookupDependencies({
      hashValue: () => {
        legacyHashCalls += 1;
        return Promise.resolve(legacyDigest);
      },
    }),
  );

  assertEquals(result.player.id, PLAYER_ID);
  assertEquals(legacyHashCalls, 1);
  const credentialQueries = client.queries.filter((query) =>
    query.table === "player_access_credentials"
  );
  assertEquals(credentialQueries.length, 2);
  assertEquals(
    hasFilter(credentialQueries[0], "credential_version", "pbkdf2-sha256-v2"),
    true,
  );
  assertEquals(
    hasFilter(credentialQueries[1], "credential_version", "sha256-v1"),
    true,
  );
});

Deno.test("completed scanner replay returns before mutable roster and settings reads", async () => {
  const attendance = {
    attendance_id: "00000000-0000-4000-8000-000000000401",
    attendance_status: "present",
    attendance_date: "2026-08-05",
    clocked_in_at: "2026-08-05T09:00:00.000Z",
    was_created: true,
    ledger_entry_id: "00000000-0000-4000-8000-000000000501",
    reward_amount: 2,
    currency_code: "ECO",
  };
  const context = {
    timezone: "UTC",
    player: {
      id: PLAYER_ID,
      displayName: "Avery Stone",
      rosterLabel: "A-1",
      playerIdentifier: "RFID:04A1B2C3",
      status: "active",
    },
    reward: {
      configuredBaseAmount: 2,
      effectiveAmount: 2,
      baseCurrencyCode: "ECO",
      currencyCode: "ECO",
      currencyMode: "fixed",
      countryCode: null,
      incomeModifier: 1,
      exchangeRateIndex: 1,
    },
  };
  const client = new FakeRpcClient((name) => {
    if (name !== "admin_read_mutation_replay_v1") {
      throw new Error("replay performed a second mutation RPC");
    }
    return [{
      has_replay: true,
      response_status: 200,
      response_body: { attendance, context },
    }];
  });
  const failRead = () => Promise.reject(new Error("mutable read must not run"));
  const result = await recordAttendanceScanForAuthorizedStaff(
    {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      body: { playerId: "SECRET-4826", deviceTimezone: "UTC" },
      identity: identity("scan-attendance-key-0002"),
    },
    client as unknown as EdgeSupabaseClient,
    {
      deriveCredentialLookupDigest: () => Promise.resolve(LOOKUP_DIGEST),
      readPlayer: failRead,
      readAttendanceWindow: failRead,
    },
  );

  assertEquals(client.calls.length, 1);
  assertEquals(result.replayed, true);
  assertEquals(result.player.id, PLAYER_ID);
});

Deno.test("attendance database failures never produce a success result", async () => {
  const client = new FakeRpcClient(() => null, {
    message: "database write failed with internal details",
  });

  await assertAdminMutationError(
    () =>
      recordAttendanceForAuthorizedStaff({
        gameSessionId: GAME_ID,
        staffUserId: STAFF_ID,
        operation: "manual",
        playerId: PLAYER_ID,
        attendanceDate: "2026-08-05",
        status: "absent",
        clockedInAt: null,
        note: null,
        rewardAmount: null,
        currencyCode: null,
        responseContext: { corrected: true },
        requestPayload: { operation: "manual", playerId: PLAYER_ID },
        identity: identity("manual-attendance-key-0002"),
      }, client),
    "attendance_write_failed",
    500,
  );
});

class FakeRpcClient implements AdminMutationRpcClient {
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

interface QueryCall {
  readonly table: string;
  readonly columns: string;
  readonly filters: readonly { column: string; value: unknown }[];
}

class FakeQuery {
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

function successResponse(
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

function identity(idempotencyKey: string) {
  return { idempotencyKey, requestId: `${idempotencyKey}-request` };
}

function attendanceLookupClient(
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

function scanInput(idempotencyKey: string) {
  return {
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    body: { playerId: "SECRET-4826", deviceTimezone: "UTC" },
    identity: identity(idempotencyKey),
  };
}

function attendanceLookupDependencies(
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

function attendancePlayerRow() {
  return {
    id: PLAYER_ID,
    display_name: "Avery Stone",
    roster_label: "A-1",
    player_identifier: "RFID:04A1B2C3",
    status: "active",
  };
}

function hasFilter(
  query: QueryCall | undefined,
  column: string,
  value: unknown,
): boolean {
  return query?.filters.some((filter) =>
    filter.column === column && filter.value === value
  ) ?? false;
}

async function assertAdminMutationError(
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

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
