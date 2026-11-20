import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  recordAttendanceForAuthorizedStaff,
  recordAttendanceScanForAuthorizedStaff,
} from "./recordAttendanceForAuthorizedStaff.ts";
import {
  assertAdminMutationError,
  assertEquals,
  FakeRpcClient,
  GAME_ID,
  identity,
  LOOKUP_DIGEST,
  PLAYER_ID,
  STAFF_ID,
} from "./recordAttendanceForAuthorizedStaff.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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
