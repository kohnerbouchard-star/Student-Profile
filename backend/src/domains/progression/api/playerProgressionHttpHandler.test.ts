import { handlePlayerProgressionRequest } from "./playerProgressionHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER = "00000000-0000-4000-8000-000000000022";
const SESSION = "00000000-0000-4000-8000-000000000011";
const REWARD = `rwd_${"a".repeat(32)}`;
const COMMAND = `pcd_${"b".repeat(32)}`;
const UNLOCK = `pun_${"c".repeat(32)}`;
const NOW = new Date("2026-07-21T02:00:00.000Z");

Deno.test("Player Progression read derives scope and returns a private UUID-free model", async () => {
  const client = new FakeClient({
    playerName: "Player",
    title: "New Arrival",
    summary: "Balanced path.",
    level: 1,
    xp: 0,
    currentLevelXp: 0,
    nextLevelXp: 100,
    skillPoints: 0,
    reputation: [], milestones: [], skills: [], achievements: [], licenses: [],
  });
  const response = await handlePlayerProgressionRequest(
    request("GET", "/players/me/progression"),
    { kind: "read" },
    dependencies(client),
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(response.headers.get("vary"), "authorization, x-player-session-token");
  const body = await response.json();
  assertEquals(body.progression.level, 1);
  assertEquals(client.calls[0], {
    name: "read_player_progression_v1",
    args: { p_game_session_id: GAME, p_player_id: PLAYER },
  });
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Player skill unlock and reward claim are replay safe and public-ID only", async () => {
  const unlockClient = new FakeClient([{
    unlock_outcome: "replayed",
    command_id: COMMAND,
    unlock_id: UNLOCK,
    skill_id: "skl_market_literacy_v1",
    remaining_skill_points: 2,
    unlocked_at: NOW.toISOString(),
  }]);
  const unlock = await handlePlayerProgressionRequest(
    request("POST", "/players/me/progression/skills/skl_market_literacy_v1/unlock", { idempotencyKey: "unlock:001" }),
    { kind: "unlock", skillId: "skl_market_literacy_v1" },
    dependencies(unlockClient),
  );
  assertEquals(unlock.status, 200);
  assertEquals((await unlock.json()).outcome, "replayed");

  const claimClient = new FakeClient([{
    claim_outcome: "applied",
    command_id: COMMAND,
    reward_id: REWARD,
    reward_kind: "skill_points",
    amount: 1,
    claimed_at: NOW.toISOString(),
  }]);
  const claim = await handlePlayerProgressionRequest(
    request("POST", `/players/me/progression/rewards/${REWARD}/claim`, { idempotencyKey: "claim:001" }),
    { kind: "claim", rewardId: REWARD },
    dependencies(claimClient),
  );
  assertEquals(claim.status, 200);
  const claimBody = await claim.json();
  assertEquals(claimBody.claim.rewardId, REWARD);
  assertNoUuid(JSON.stringify(claimBody));
});

Deno.test("Player Progression rejects malformed methods, ownership hints, and arbitrary payloads before RPC", async () => {
  const client = new FakeClient(null);
  for (const scenario of [
    [request("POST", "/players/me/progression", {}), { kind: "read" }, 405],
    [request("POST", "/players/me/progression/skills/skl_market_literacy_v1/unlock", { gameSessionId: GAME }), { kind: "unlock", skillId: "skl_market_literacy_v1" }, 400],
    [request("POST", "/players/me/progression/skills/skl_market_literacy_v1/unlock", { idempotencyKey: "unlock:001" }, { "x-econovaria-game-id": GAME }), { kind: "unlock", skillId: "skl_market_literacy_v1" }, 400],
    [request("GET", "/players/me/progression", undefined, { "x-player-id": "another-player" }), { kind: "read" }, 400],
    [request("GET", "/players/me/progression?gameId=browser"), { kind: "read" }, 400],
  ] as const) {
    const response = await handlePlayerProgressionRequest(scenario[0], scenario[1] as never, dependencies(client));
    assertEquals(response.status, scenario[2]);
  }
  assertEquals(client.calls.length, 0);
});

Deno.test("Player Progression denies revoked, expired, paused, ended, wrong-game, and wrong-player sessions before RPC", async () => {
  const scenarios = [
    ["revoked", activeResolution({ session: { status: "revoked", revoked_at: NOW.toISOString() } }), 401, "player_session_revoked"],
    ["expired", activeResolution({ session: { status: "expired", expires_at: "2026-07-20T00:00:00.000Z" } }), 401, "player_session_expired"],
    ["paused", activeResolution({ gameSession: { status: "paused" } }), 401, "invalid_player_session_scope"],
    ["ended", activeResolution({ gameSession: { status: "ended" } }), 401, "invalid_player_session_scope"],
    ["wrong-game", activeResolution({ gameSession: { id: OTHER_GAME } }), 401, "invalid_player_session_scope"],
    ["wrong-player", activeResolution({ player: { id: OTHER_PLAYER } }), 401, "invalid_player_session_scope"],
  ] as const;

  for (const [name, resolution, expectedStatus, expectedCode] of scenarios) {
    const client = new FakeClient(null);
    const response = await handlePlayerProgressionRequest(
      request("GET", "/players/me/progression"),
      { kind: "read" },
      dependencies(client, resolution),
    );
    assertEquals(response.status, expectedStatus);
    const body = await response.json();
    assertEquals(body.code, expectedCode);
    assertEquals(client.calls.length, 0);
    if (!name) throw new Error("scenario name is required");
  }
});

Deno.test("Player Progression rejects conflicting idempotency and maps stable unavailable/conflict errors", async () => {
  const conflictingClient = new FakeClient(null);
  const conflicting = await handlePlayerProgressionRequest(
    request(
      "POST",
      `/players/me/progression/rewards/${REWARD}/claim`,
      { idempotencyKey: "claim:body" },
      { "x-idempotency-key": "claim:header" },
    ),
    { kind: "claim", rewardId: REWARD },
    dependencies(conflictingClient),
  );
  assertEquals(conflicting.status, 400);
  assertEquals((await conflicting.json()).code, "invalid_player_progression_request");
  assertEquals(conflictingClient.calls.length, 0);

  const idempotencyClient = new FakeClient(null, { message: "PROGRESSION_IDEMPOTENCY_CONFLICT" });
  const conflict = await handlePlayerProgressionRequest(
    request("POST", `/players/me/progression/rewards/${REWARD}/claim`, { idempotencyKey: "claim:001" }),
    { kind: "claim", rewardId: REWARD },
    dependencies(idempotencyClient),
  );
  assertEquals(conflict.status, 409);
  assertEquals((await conflict.json()).code, "progression_idempotency_conflict");

  const unavailableClient = new FakeClient(null, { message: "function read_player_progression_v1 does not exist" });
  const unavailable = await handlePlayerProgressionRequest(
    request("GET", "/players/me/progression"),
    { kind: "read" },
    dependencies(unavailableClient),
  );
  assertEquals(unavailable.status, 503);
  const unavailableBody = await unavailable.json();
  assertEquals(unavailableBody.code, "progression_schema_not_applied");
  assertEquals(unavailableBody.retryable, true);
});

class FakeClient {
  readonly calls: Array<{ name: string; args: unknown }> = [];
  readonly auth = {} as never;
  constructor(
    private readonly data: unknown,
    private readonly error: { message: string } | null = null,
  ) {}
  from() { throw new Error("unexpected table access"); }
  rpc(name: string, args: unknown) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: this.data, error: this.error });
  }
}

function activeResolution(
  overrides: {
    session?: Record<string, unknown>;
    gameSession?: Record<string, unknown>;
    player?: Record<string, unknown>;
  } = {},
) {
  return {
    ok: true as const,
    session: {
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: "2026-07-22T00:00:00.000Z",
      revoked_at: null,
      ...overrides.session,
    },
    gameSession: {
      id: GAME,
      name: "Game",
      status: "active",
      ...overrides.gameSession,
    },
    player: {
      id: PLAYER,
      display_name: "Player",
      roster_label: null,
      status: "active",
      ...overrides.player,
    },
  };
}

function dependencies(client: FakeClient, sessionResolution: unknown = activeResolution()) {
  return {
    createServiceClient: () => client as never,
    readEnvironment: () => ({ ok: true as const, value: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon", supabaseServiceRoleKey: "service" } }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(sessionResolution as never),
    now: () => NOW,
  };
}

function request(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({ "x-player-session-token": "token", ...extraHeaders });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://example.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) throw new Error(`UUID leaked: ${value}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
}
