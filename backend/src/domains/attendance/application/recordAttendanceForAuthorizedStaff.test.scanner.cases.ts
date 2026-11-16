import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { recordAttendanceScanForAuthorizedStaff } from "./recordAttendanceForAuthorizedStaff.ts";
import {
  assertEquals,
  attendanceLookupClient,
  attendanceLookupDependencies,
  attendancePlayerRow,
  FakeRpcClient,
  GAME_ID,
  hasFilter,
  identity,
  LOOKUP_DIGEST,
  PLAYER_ID,
  scanInput,
  STAFF_ID,
  successResponse,
} from "./recordAttendanceForAuthorizedStaff.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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
  const legacyHashInputs: string[] = [];
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
    {
      ...scanInput("scan-attendance-key-legacy"),
      body: { playerId: "  se cret-4826  ", deviceTimezone: "UTC" },
    },
    client as unknown as EdgeSupabaseClient,
    attendanceLookupDependencies({
      hashValue: (value) => {
        legacyHashCalls += 1;
        legacyHashInputs.push(value);
        return Promise.resolve(legacyDigest);
      },
    }),
  );

  assertEquals(result.player.id, PLAYER_ID);
  assertEquals(legacyHashCalls, 1);
  assertEquals(legacyHashInputs, ["SECRET-4826"]);
  const credentialQueries = client.queries.filter((query) =>
    query.table === "player_access_credentials"
  );
  assertEquals(credentialQueries.length, 2);
  assertEquals(credentialQueries.every((query) => hasFilter(query, "game_session_id", GAME_ID)), true);
  assertEquals(
    hasFilter(credentialQueries[0], "credential_version", "pbkdf2-sha256-v2"),
    true,
  );
  assertEquals(
    hasFilter(credentialQueries[1], "credential_version", "sha256-v1"),
    true,
  );
});
