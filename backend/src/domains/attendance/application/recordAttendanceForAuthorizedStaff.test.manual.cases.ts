import { recordManualAttendanceForAuthorizedStaff } from "./recordAttendanceForAuthorizedStaff.ts";
import {
  assertAdminMutationError,
  assertEquals,
  FakeRpcClient,
  GAME_ID,
  identity,
  PLAYER_ID,
  STAFF_ID,
  successResponse,
} from "./recordAttendanceForAuthorizedStaff.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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
