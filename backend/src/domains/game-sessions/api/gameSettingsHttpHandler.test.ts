import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { AdminMutationError } from "../../../platform/supabase/adminMutation.ts";
import { handleGameSettingsRequest } from "./gameSettingsHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-05T03:15:00.000Z";
const ENV: SupabaseEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "test-anon-key",
  supabaseServiceRoleKey: "test-service-role-key",
};

Deno.test("Classroom settings PATCH authenticates and owner-scopes before the local application", async () => {
  const calls: unknown[] = [];
  const serviceClient = ownedGameClient(calls, gameSession());
  const response = await handleGameSettingsRequest(
    request({ difficultyPreset: "hard" }),
    GAME_ID,
    {
      readEnvironment: () => ({ ok: true as const, value: ENV }),
      resolveStaffForRequest: (_request, _env, options) => {
        calls.push(["resolve-staff", options.missingMessage]);
        return Promise.resolve({
          ok: true as const,
          staff: { id: STAFF_ID, email: "teacher@example.com" },
          serviceClient,
        });
      },
      updateSettings: (_client, input) => {
        calls.push([
          "update-settings",
          input.gameSessionId,
          input.staffUserId,
          input.mutation.idempotencyKey,
          input.requestBody,
        ]);
        return Promise.resolve({
          status: 200,
          replayed: false,
          settings: settings(),
          difficultyPolicy: null,
        });
      },
    },
  );

  assertEquals(calls, [
    [
      "resolve-staff",
      "A verified Supabase Auth user is required to load game settings.",
    ],
    ["owned-game-query", GAME_ID, STAFF_ID],
    [
      "update-settings",
      GAME_ID,
      STAFF_ID,
      "settings-command-001",
      { difficultyPreset: "hard" },
    ],
  ]);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    gameSession: gameSession(),
    settings: settings(),
    difficultyPolicy: null,
    replayed: false,
  });
});

Deno.test("Classroom settings PATCH stops before the local application for non-owners", async () => {
  let updated = false;
  const serviceClient = ownedGameClient([], null);
  const response = await handleGameSettingsRequest(
    request({ attendanceWindow: { timezone: "Asia/Seoul" } }),
    GAME_ID,
    {
      readEnvironment: () => ({ ok: true as const, value: ENV }),
      resolveStaffForRequest: () =>
        Promise.resolve({
          ok: true as const,
          staff: { id: STAFF_ID, email: "teacher@example.com" },
          serviceClient,
        }),
      updateSettings: () => {
        updated = true;
        throw new Error("must not run");
      },
    },
  );

  assertEquals(updated, false);
  assertEquals(response.status, 404);
});

Deno.test("Classroom settings PATCH never converts local persistence failure to 200", async () => {
  const serviceClient = ownedGameClient([], gameSession());
  const response = await handleGameSettingsRequest(
    request({ difficultyPreset: "standard" }),
    GAME_ID,
    {
      readEnvironment: () => ({ ok: true as const, value: ENV }),
      resolveStaffForRequest: () =>
        Promise.resolve({
          ok: true as const,
          staff: { id: STAFF_ID, email: "teacher@example.com" },
          serviceClient,
        }),
      updateSettings: () => {
        throw new AdminMutationError(
          "game_settings_failed",
          "Game settings request failed.",
          500,
        );
      },
    },
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "game_settings_failed",
      message: "Game settings request failed.",
      retryable: false,
    },
  });
});

function ownedGameClient(
  calls: unknown[],
  row: ReturnType<typeof gameSession> | null,
): EdgeSupabaseClient {
  return {
    from(table: string) {
      if (table !== "game_sessions") {
        throw new Error(`Unexpected table ${table}`);
      }
      let gameId = "";
      let ownerId = "";
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          if (column === "id") gameId = String(value);
          if (column === "owner_staff_user_id") ownerId = String(value);
          return query;
        },
        maybeSingle() {
          calls.push(["owned-game-query", gameId, ownerId]);
          return Promise.resolve({ data: row, error: null });
        },
      };
      return query;
    },
  } as unknown as EdgeSupabaseClient;
}

function request(body: Record<string, unknown>): Request {
  return new Request(
    `https://example.supabase.co/functions/v1/classroom-api/games/${GAME_ID}/settings`,
    {
      method: "PATCH",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "idempotency-key": "settings-command-001",
      },
      body: JSON.stringify(body),
    },
  );
}

function gameSession() {
  return { id: GAME_ID, name: "Period 4 Economy", status: "active" };
}

function settings() {
  return {
    difficultyPreset: "hard",
    attendanceWindow: {},
    businessMarketWindow: {},
    stockMarketWindow: { timezone: "Asia/Seoul" },
    newsSchedule: {},
    updatedAt: UPDATED_AT,
  };
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
