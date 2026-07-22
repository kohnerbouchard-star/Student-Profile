import {
  PlayerCraftingError,
  type PlayerCraftingRepository,
} from "../contracts/playerCraftingContracts.ts";
import { handlePlayerCraftingRequest } from "./playerCraftingHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = new Date("2026-07-21T04:00:00.000Z");

Deno.test("Player Crafting derives scope and publishes committed-success semantics", async () => {
  const repository = new FakeRepository();
  const response = await handlePlayerCraftingRequest(
    request("POST", "/players/me/crafting/jobs", {
      recipeKey: "recipe.test-widget",
      quantity: 2,
      substitutions: {},
      idempotencyKey: "craft.test.0001",
    }),
    { kind: "startJob" },
    dependencies(repository),
  );
  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(body.committed, true);
  assertEquals(body.refreshRequired, true);
  assertEquals(repository.startInputs, [{
    gameId: GAME,
    playerUuid: PLAYER,
    command: {
      recipeKey: "recipe.test-widget",
      quantity: 2,
      substitutions: {},
      idempotencyKey: "craft.test.0001",
    },
  }]);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Player Crafting read is private and does not claim a mutation commit", async () => {
  const response = await handlePlayerCraftingRequest(
    request("GET", "/players/me/crafting"),
    { kind: "read" },
    dependencies(new FakeRepository()),
  );
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(body.committed, undefined);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Player Crafting rejects an expired session before repository mutation", async () => {
  const repository = new FakeRepository();
  const base = dependencies(repository);
  const response = await handlePlayerCraftingRequest(
    request("POST", "/players/me/crafting/jobs", {
      recipeKey: "recipe.test-widget",
      quantity: 1,
      substitutions: {},
      idempotencyKey: "craft.expired.0001",
    }),
    { kind: "startJob" },
    {
      ...base,
      resolvePlayerSession: () => Promise.resolve({
        ok: true as const,
        session: {
          id: SESSION,
          game_session_id: GAME,
          player_id: PLAYER,
          status: "expired",
          expires_at: "2026-07-21T03:59:59.000Z",
          revoked_at: null,
        },
        gameSession: { id: GAME, name: "Game", status: "active" },
        player: { id: PLAYER, display_name: "Crafter", roster_label: null, status: "active" },
      }),
    },
  );
  await assertError(response, 401, "player_session_expired");
  assertEquals(repository.startInputs.length, 0);
});

Deno.test("Player Crafting rejects browser-owned scope and unexpected fields", async () => {
  const repository = new FakeRepository();
  const scoped = request("POST", "/players/me/crafting/jobs", {
    recipeKey: "recipe.test-widget",
    quantity: 1,
    substitutions: {},
    idempotencyKey: "craft.test.0002",
  }, { "x-econovaria-game-id": GAME });
  const extra = request("POST", "/players/me/crafting/jobs", {
    recipeKey: "recipe.test-widget",
    quantity: 1,
    substitutions: {},
    idempotencyKey: "craft.test.0003",
    playerUuid: PLAYER,
  });
  await assertError(
    await handlePlayerCraftingRequest(scoped, { kind: "startJob" }, dependencies(repository)),
    400,
    "invalid_player_crafting_request",
  );
  await assertError(
    await handlePlayerCraftingRequest(extra, { kind: "startJob" }, dependencies(repository)),
    400,
    "invalid_player_crafting_request",
  );
  assertEquals(repository.startInputs.length, 0);
});

Deno.test("Player Crafting preserves domain conflict errors", async () => {
  const repository = new FakeRepository(new PlayerCraftingError(
    "player_crafting_conflict",
    "Conflict.",
    409,
    false,
  ));
  await assertError(
    await handlePlayerCraftingRequest(
      request("POST", "/players/me/crafting/jobs/cft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/claim", {
        idempotencyKey: "craft.claim.0001",
      }),
      { kind: "claimJob", jobKey: `cft_${"a".repeat(32)}` },
      dependencies(repository),
    ),
    409,
    "player_crafting_conflict",
  );
});

class FakeRepository implements PlayerCraftingRepository {
  readonly startInputs: Parameters<PlayerCraftingRepository["startJob"]>[0][] = [];
  constructor(private readonly error: PlayerCraftingError | null = null) {}
  read() { return this.answer({ packActive: true, recipes: [], jobs: [] }); }
  startJob(input: Parameters<PlayerCraftingRepository["startJob"]>[0]) {
    this.startInputs.push(input);
    return this.answer({ outcome: "created", jobKey: `cft_${"b".repeat(32)}`, committed: true });
  }
  cancelJob() { return this.answer({ outcome: "cancelled", jobKey: `cft_${"b".repeat(32)}` }); }
  claimJob() { return this.answer({ outcome: "claimed", jobKey: `cft_${"b".repeat(32)}` }); }
  useItem() { return this.answer({ outcome: "applied", useKey: `use_${"b".repeat(32)}` }); }
  equip() { return this.answer({ outcome: "equipped", equipmentKey: `eqp_${"b".repeat(32)}` }); }
  salvage() { return this.answer({ outcome: "settled", salvageKey: `slv_${"b".repeat(32)}` }); }
  private answer(value: unknown): Promise<unknown> {
    return this.error ? Promise.reject(this.error) : Promise.resolve(value);
  }
}

function dependencies(repository: PlayerCraftingRepository) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon", supabaseServiceRoleKey: "service" },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve({
      ok: true as const,
      session: { id: SESSION, game_session_id: GAME, player_id: PLAYER, status: "active", expires_at: "2026-07-22T00:00:00.000Z", revoked_at: null },
      gameSession: { id: GAME, name: "Game", status: "active" },
      player: { id: PLAYER, display_name: "Crafter", roster_label: null, status: "active" },
    }),
    createRepository: () => repository,
    now: () => NOW,
  };
}

function request(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Request {
  const headers = new Headers({ "x-player-session-token": "token", ...extra });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

async function assertError(response: Response, status: number, code: string) {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
}
function assertNoUuid(value: string) {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}
function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
