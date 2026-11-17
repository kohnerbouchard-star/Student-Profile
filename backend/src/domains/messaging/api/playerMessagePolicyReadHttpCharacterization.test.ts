import { handlePlayerMessageThreadLifecycleRequest } from "./playerMessageThreadLifecycleHttpHandler.ts";
import type { PlayerMessageThreadLifecycleDependencies } from "./playerMessageThreadLifecycleHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const OTHER = "00000000-0000-4000-8000-000000000099";
const NOW = new Date("2026-07-21T03:00:00.000Z");
const POLICY = {
  playerThreadsEnabled: true,
  maxParticipants: 2,
  defaultRetentionDays: 365,
  attachmentsEnabled: false,
};
type Resolution = Awaited<
  ReturnType<
    NonNullable<
      PlayerMessageThreadLifecycleDependencies["resolvePlayerSession"]
    >
  >
>;

Deno.test("Messaging policy read preserves exact scope, guard order, private response and projection", async () => {
  const fixture = dependencies({ ...POLICY, privateField: PLAYER });
  const response = await handlePlayerMessageThreadLifecycleRequest(
    request({ headers: { "x-econovaria-game-id": GAME } }),
    { kind: "policy" },
    fixture.value,
  );
  equal(fixture.trace, [
    "env",
    "client",
    "now",
    "hash:player-token",
    "session:hashed-token",
    "rpc",
  ]);
  equal(fixture.calls, [{
    name: "read_player_message_policy_v1",
    args: { p_game_session_id: GAME, p_player_id: PLAYER },
  }]);
  equal(response.status, 200);
  equal(response.headers.get("cache-control"), "private, no-store");
  equal(response.headers.get("pragma"), "no-cache");
  equal(response.headers.get("vary"), "authorization, x-player-session-token");
  equal(await response.json(), { ok: true, data: { policy: POLICY } });
});

for (
  const [name, input, expected] of [
    ["lower limits", { ...POLICY, defaultRetentionDays: 1 }, {
      ...POLICY,
      defaultRetentionDays: 1,
    }],
    ["upper limits", {
      ...POLICY,
      maxParticipants: 20,
      defaultRetentionDays: 730,
    }, { ...POLICY, maxParticipants: 20, defaultRetentionDays: 730 }],
    ["disabled", { ...POLICY, playerThreadsEnabled: false }, {
      ...POLICY,
      playerThreadsEnabled: false,
    }],
    ["existing boolean default", {
      maxParticipants: "2",
      defaultRetentionDays: "365",
      attachmentsEnabled: false,
    }, POLICY],
    ["existing numeric coercion", {
      ...POLICY,
      maxParticipants: [2],
      defaultRetentionDays: "365",
    }, POLICY],
  ] as const
) {
  Deno.test(`Messaging policy read retains ${name}`, async () => {
    const fixture = dependencies(input);
    const response = await handlePlayerMessageThreadLifecycleRequest(
      request(),
      { kind: "policy" },
      fixture.value,
    );
    equal(response.status, 200);
    equal(await response.json(), { ok: true, data: { policy: expected } });
    equal(fixture.calls.length, 1);
  });
}

for (
  const [name, input] of [
    ["null", null],
    ["array", []],
    ["missing attachment policy", { ...POLICY, attachmentsEnabled: undefined }],
    ["enabled attachments", { ...POLICY, attachmentsEnabled: true }],
    ["participants below bound", { ...POLICY, maxParticipants: 1 }],
    ["participants above bound", { ...POLICY, maxParticipants: 21 }],
    ["fractional participants", { ...POLICY, maxParticipants: 2.5 }],
    ["retention below bound", { ...POLICY, defaultRetentionDays: 0 }],
    ["retention above bound", { ...POLICY, defaultRetentionDays: 731 }],
  ] as const
) {
  Deno.test(`Messaging policy read rejects ${name} without another RPC`, async () => {
    const fixture = dependencies(input);
    const response = await handlePlayerMessageThreadLifecycleRequest(
      request(),
      { kind: "policy" },
      fixture.value,
    );
    equal(response.status, 500);
    equal((await response.json()).error.code, "player_messaging_failed");
    equal(fixture.calls.length, 1);
  });
}

for (
  const [message, status, code] of [
    ["THREADS_DISABLED", 423, "player_message_threads_disabled"],
    ["RECIPIENT_NOT_FOUND", 404, "player_message_recipient_not_found"],
    ["SCOPE_FORBIDDEN", 404, "player_message_recipient_not_found"],
    ["IDEMPOTENCY_CONFLICT", 409, "player_message_idempotency_conflict"],
    ["GAME_NOT_ACTIVE", 409, "game_not_active"],
    ["42P01", 503, "player_messaging_schema_not_applied"],
    ["42883", 503, "player_messaging_schema_not_applied"],
    ["DOES NOT EXIST", 503, "player_messaging_schema_not_applied"],
    ["POLICY_INVALID", 400, "invalid_player_message_request"],
    ["private-database-detail", 500, "player_messaging_failed"],
  ] as const
) {
  Deno.test(`Messaging policy read preserves RPC error ${message}`, async () => {
    const fixture = dependencies(null, { message });
    const response = await handlePlayerMessageThreadLifecycleRequest(
      request(),
      { kind: "policy" },
      fixture.value,
    );
    equal(response.status, status);
    const body = await response.json();
    equal(body.error.code, code);
    equal(body.error.retryable, status === 503);
    equal(JSON.stringify(body).includes("private-database-detail"), false);
    equal(fixture.calls.length, 1);
  });
}

for (
  const [name, options, status] of [
    ["wrong method", { method: "POST" }, 405],
    ["runner secret", {
      headers: { "x-stock-market-runner-secret": "invalid" },
    }, 400],
    ["query ownership", { suffix: "?playerId=other" }, 400],
    ["missing session", { token: null }, 401],
    ["ownership header", { headers: { "x-player-id": OTHER } }, 400],
    ["wrong game header", { headers: { "x-econovaria-game-id": OTHER } }, 401],
  ] as const
) {
  Deno.test(`Messaging policy read rejects ${name} before persistence`, async () => {
    const fixture = dependencies(POLICY);
    const response = await handlePlayerMessageThreadLifecycleRequest(
      request(options),
      { kind: "policy" },
      fixture.value,
    );
    equal(response.status, status);
    equal(fixture.calls, []);
  });
}

for (
  const [name, change] of [
    ["expired", (r: ReturnType<typeof active>) => {
      r.session.expires_at = "2026-07-20T00:00:00.000Z";
    }],
    ["revoked", (r: ReturnType<typeof active>) => {
      r.session.revoked_at = NOW.toISOString();
    }],
    ["wrong game", (r: ReturnType<typeof active>) => {
      r.gameSession.id = OTHER;
    }],
    ["wrong player", (r: ReturnType<typeof active>) => {
      r.player.id = OTHER;
    }],
  ] as const
) {
  Deno.test(`Messaging policy read rejects ${name} session before persistence`, async () => {
    const resolution = active();
    change(resolution);
    const fixture = dependencies(POLICY, null, resolution);
    const response = await handlePlayerMessageThreadLifecycleRequest(
      request(),
      { kind: "policy" },
      fixture.value,
    );
    equal(response.status, 401);
    equal(fixture.calls, []);
  });
}

Deno.test("Messaging policy read preserves thrown RPC failure with no retry", async () => {
  const fixture = dependencies(POLICY);
  let attempts = 0;
  fixture.value.createServiceClient = () =>
    ({
      rpc: () => {
        attempts++;
        throw new Error("private-detail");
      },
    }) as never;
  const response = await handlePlayerMessageThreadLifecycleRequest(request(), {
    kind: "policy",
  }, fixture.value);
  equal(response.status, 500);
  equal((await response.json()).error.code, "player_messaging_failed");
  equal(attempts, 1);
});

Deno.test("Messaging malformed route and missing environment perform no persistence", async () => {
  const fixture = dependencies(POLICY);
  equal(
    (await handlePlayerMessageThreadLifecycleRequest(request(), {
      kind: "malformed",
    }, fixture.value)).status,
    400,
  );
  equal(fixture.trace, []);
  const absent = {
    ...fixture.value,
    readSupabaseEnv: () => ({ ok: false as const, missing: [] }),
  };
  equal(
    (await handlePlayerMessageThreadLifecycleRequest(request(), {
      kind: "policy",
    }, absent)).status,
    500,
  );
  equal(fixture.calls, []);
});

function dependencies(
  data: unknown,
  error: { message: string; code?: string } | null = null,
  resolution: Resolution = active(),
) {
  const trace: string[] = [];
  const calls: unknown[] = [];
  const value = {
    createServiceClient: () => {
      trace.push("client");
      return {
        rpc: (name: string, args: unknown) => {
          trace.push("rpc");
          calls.push({ name, args });
          return Promise.resolve({ data, error });
        },
      } as never;
    },
    readSupabaseEnv: () => {
      trace.push("env");
      return {
        ok: true as const,
        value: {
          supabaseUrl: "http://localhost:54321",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service",
        },
      };
    },
    hashSessionToken: (token: string) => {
      trace.push(`hash:${token}`);
      return Promise.resolve("hashed-token");
    },
    resolvePlayerSession: (_client: unknown, hash: string) => {
      trace.push(`session:${hash}`);
      return Promise.resolve(resolution);
    },
    now: () => {
      trace.push("now");
      return NOW;
    },
  };
  return { value, trace, calls };
}
function active() {
  return {
    ok: true as const,
    session: {
      id: "00000000-0000-4000-8000-000000000011",
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: "2026-07-22T00:00:00.000Z",
      revoked_at: null as string | null,
    },
    gameSession: {
      id: GAME,
      name: "Game",
      owner_staff_user_id: OTHER,
      status: "active",
    },
    player: {
      id: PLAYER,
      game_session_id: GAME,
      display_name: "Player",
      roster_label: null,
      player_identifier: "PLAYER-001",
      status: "active",
    },
  };
}
function request(
  options: {
    method?: string;
    token?: string | null;
    headers?: Readonly<Record<string, string>>;
    suffix?: string;
  } = {},
) {
  const headers = new Headers(options.headers);
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
  return new Request(
    `https://example.test/players/me/messages/policy${options.suffix ?? ""}`,
    { method: options.method ?? "GET", headers },
  );
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`,
    );
  }
}
