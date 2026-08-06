import { handlePlayerProgressionRequest } from "./playerProgressionHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const SESSION_ID = "00000000-0000-4000-8000-000000000003";
const SKILL_ID = "skl_market_literacy_v1";
const IDEMPOTENCY_KEY = "progression.unlock.001";

Deno.test("Player Progression prefers canonical Idempotency-Key over an unrelated request ID", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    auth: {},
    from() {
      throw new Error("unexpected table access");
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: [{
          unlock_outcome: "applied",
          command_id: `pcd_${"a".repeat(32)}`,
          unlock_id: `pun_${"b".repeat(32)}`,
          skill_id: SKILL_ID,
          remaining_skill_points: 1,
          unlocked_at: "2026-08-06T00:00:00.000Z",
        }],
        error: null,
      });
    },
  };

  const request = new Request(
    `https://example.test/players/me/progression/skills/${SKILL_ID}/unlock`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-player-session-token": "player-session-token",
        "idempotency-key": IDEMPOTENCY_KEY,
        "x-request-id": "request.trace.001",
      },
      body: JSON.stringify({ idempotencyKey: IDEMPOTENCY_KEY }),
    },
  );

  const response = await handlePlayerProgressionRequest(
    request,
    { kind: "unlock", skillId: SKILL_ID },
    {
      createServiceClient: () => client as never,
      readEnvironment: () => ({
        ok: true as const,
        value: {
          supabaseUrl: "http://localhost",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service",
        },
      }),
      hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
      resolvePlayerSession: () => Promise.resolve({
        ok: true as const,
        session: {
          id: SESSION_ID,
          game_session_id: GAME_ID,
          player_id: PLAYER_ID,
          status: "active",
          expires_at: "2026-08-07T00:00:00.000Z",
          revoked_at: null,
        },
        gameSession: {
          id: GAME_ID,
          name: "Game",
          status: "active",
        },
        player: {
          id: PLAYER_ID,
          display_name: "Player",
          roster_label: null,
          status: "active",
        },
      } as never),
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    },
  );

  assertEquals(response.status, 200);
  assertEquals(calls[0]?.name, "unlock_player_progression_skill_atomic_v1");
  assertEquals(calls[0]?.args.p_idempotency_key, IDEMPOTENCY_KEY);
});

Deno.test("Player Progression retains legacy X-Idempotency-Key compatibility", async () => {
  const request = new Request(
    `https://example.test/players/me/progression/skills/${SKILL_ID}/unlock`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-player-session-token": "player-session-token",
        "x-idempotency-key": IDEMPOTENCY_KEY,
        "x-request-id": "request.trace.legacy",
      },
      body: JSON.stringify({ idempotencyKey: IDEMPOTENCY_KEY }),
    },
  );

  let observedKey = "";
  const response = await handlePlayerProgressionRequest(
    request,
    { kind: "unlock", skillId: SKILL_ID },
    {
      createServiceClient: () => ({
        auth: {},
        from() {
          throw new Error("unexpected table access");
        },
        rpc(_name: string, args: Record<string, unknown>) {
          observedKey = String(args.p_idempotency_key || "");
          return Promise.resolve({
            data: [{
              unlock_outcome: "replayed",
              command_id: `pcd_${"c".repeat(32)}`,
              unlock_id: `pun_${"d".repeat(32)}`,
              skill_id: SKILL_ID,
              remaining_skill_points: 1,
              unlocked_at: "2026-08-06T00:00:00.000Z",
            }],
            error: null,
          });
        },
      }) as never,
      readEnvironment: () => ({
        ok: true as const,
        value: {
          supabaseUrl: "http://localhost",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service",
        },
      }),
      hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
      resolvePlayerSession: () => Promise.resolve({
        ok: true as const,
        session: {
          id: SESSION_ID,
          game_session_id: GAME_ID,
          player_id: PLAYER_ID,
          status: "active",
          expires_at: "2026-08-07T00:00:00.000Z",
          revoked_at: null,
        },
        gameSession: { id: GAME_ID, name: "Game", status: "active" },
        player: {
          id: PLAYER_ID,
          display_name: "Player",
          roster_label: null,
          status: "active",
        },
      } as never),
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    },
  );

  assertEquals(response.status, 200);
  assertEquals(observedKey, IDEMPOTENCY_KEY);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}
