import type {
  PlayerContractAcceptanceRepository,
  PlayerContractAcceptanceResult,
} from "../contracts/playerContractAcceptanceContracts.ts";
import { handlePlayerContractAcceptanceRequest } from "./playerContractAcceptanceHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const CONTRACT_KEY = "arrival-orientation";
const ACCEPTED_AT = "2026-07-18T11:20:00.000Z";
const NOW = new Date("2026-07-18T11:20:00.000Z");

Deno.test("contract acceptance handler returns a UUID-private accepted response", async () => {
  let captured: unknown = null;
  const response = await handlePlayerContractAcceptanceRequest(
    request(`/players/me/contracts/${CONTRACT_KEY}/accept`),
    { kind: "accept", contractKey: CONTRACT_KEY },
    dependencies({
      acceptContract: (input) => {
        captured = input;
        return Promise.resolve(result("accepted"));
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(captured, {
    gameId: GAME,
    playerUuid: PLAYER,
    contractKey: CONTRACT_KEY,
  });
  const body = await response.json();
  assertEquals(body, {
    ok: true,
    alreadyAccepted: false,
    contract: {
      contractKey: CONTRACT_KEY,
      status: "in_progress",
      acceptedAt: ACCEPTED_AT,
    },
  });
  assertNoUuid(JSON.stringify(body));
});

Deno.test("contract acceptance handler treats retries as idempotent success", async () => {
  const response = await handlePlayerContractAcceptanceRequest(
    request(`/players/me/contracts/${CONTRACT_KEY}/accept`),
    { kind: "accept", contractKey: CONTRACT_KEY },
    dependencies(repository(result("already_accepted"))),
  );

  assertEquals(response.status, 200);
  assertEquals((await response.json()).alreadyAccepted, true);
});

Deno.test("contract acceptance handler rejects unavailable and locked progress", async () => {
  const unavailable = await handlePlayerContractAcceptanceRequest(
    request(`/players/me/contracts/${CONTRACT_KEY}/accept`),
    { kind: "accept", contractKey: CONTRACT_KEY },
    dependencies(repository({
      outcome: "not_available",
      contractKey: CONTRACT_KEY,
      progressStatus: null,
      acceptedAt: null,
    })),
  );
  assertEquals(unavailable.status, 404);
  assertEquals(
    (await unavailable.json()).error.code,
    "player_contract_not_available",
  );

  const locked = await handlePlayerContractAcceptanceRequest(
    request(`/players/me/contracts/${CONTRACT_KEY}/accept`),
    { kind: "accept", contractKey: CONTRACT_KEY },
    dependencies(repository(result("locked", "submitted"))),
  );
  assertEquals(locked.status, 409);
  assertEquals(
    (await locked.json()).error.code,
    "player_contract_progress_locked",
  );
});

Deno.test("contract acceptance handler rejects missing sessions and ownership injection", async () => {
  const missing = await handlePlayerContractAcceptanceRequest(
    request(`/players/me/contracts/${CONTRACT_KEY}/accept`, { token: null }),
    { kind: "accept", contractKey: CONTRACT_KEY },
    dependencies(repository(result("accepted"))),
  );
  assertEquals(missing.status, 401);
  assertEquals((await missing.json()).error.code, "missing_player_session");

  const query = await handlePlayerContractAcceptanceRequest(
    request(`/players/me/contracts/${CONTRACT_KEY}/accept?gameSessionId=${GAME}`),
    { kind: "accept", contractKey: CONTRACT_KEY },
    dependencies(repository(result("accepted"))),
  );
  assertEquals(query.status, 400);
  assertEquals(
    (await query.json()).error.code,
    "invalid_player_contract_acceptance_request",
  );

  const body = await handlePlayerContractAcceptanceRequest(
    request(`/players/me/contracts/${CONTRACT_KEY}/accept`, {
      body: { playerId: PLAYER },
    }),
    { kind: "accept", contractKey: CONTRACT_KEY },
    dependencies(repository(result("accepted"))),
  );
  assertEquals(body.status, 400);
  assertEquals((await body.json()).error.code, "invalid_player_request");
});

function result(
  outcome: "accepted" | "already_accepted" | "locked",
  progressStatus = "in_progress",
): PlayerContractAcceptanceResult {
  return {
    outcome,
    contractKey: CONTRACT_KEY,
    progressStatus,
    acceptedAt: ACCEPTED_AT,
  };
}

function repository(
  value: PlayerContractAcceptanceResult,
): PlayerContractAcceptanceRepository {
  return {
    acceptContract: () => Promise.resolve(value),
  };
}

function dependencies(repositoryValue: PlayerContractAcceptanceRepository) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost:54321",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(activeResolution()),
    createRepository: () => repositoryValue,
    now: () => NOW,
  };
}

function activeResolution() {
  return {
    ok: true as const,
    session: {
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: "active",
      expires_at: "2026-07-19T00:00:00.000Z",
      revoked_at: null,
    },
    gameSession: {
      id: GAME,
      name: "Game",
      owner_staff_user_id: "00000000-0000-4000-8000-000000000031",
      status: "active",
    },
    player: {
      id: PLAYER,
      game_session_id: GAME,
      display_name: "Player",
      roster_label: null,
      player_identifier: "P-01",
      status: "active",
    },
  };
}

function request(path: string, options: {
  readonly token?: string | null;
  readonly body?: unknown;
} = {}): Request {
  const headers = new Headers();
  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
