import {
  type PlayerCraftingRepository,
} from "../contracts/playerCraftingContracts.ts";
import { handlePlayerCraftingRequest } from "./playerCraftingHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const JOB = `cft_${"a".repeat(32)}`;
const EQUIPMENT = `eqp_${"b".repeat(32)}`;
const NOW = new Date("2026-07-21T04:00:00.000Z");

for (const gameStatus of ["paused", "ended"]) {
  Deno.test(`Player Crafting rejects ${gameStatus} game scope before mutation`, async () => {
    const repository = new Repository();
    const response = await handlePlayerCraftingRequest(
      request("POST", "/players/me/crafting/jobs", {
        recipeKey: "recipe.test-widget",
        quantity: 1,
        substitutions: {},
        idempotencyKey: `craft.${gameStatus}.0001`,
      }),
      { kind: "startJob" },
      dependencies(repository, {
        gameStatus,
      }),
    );
    await assertError(response, 401, "invalid_player_session_scope");
    assertEquals(repository.mutations, 0);
  });
}

Deno.test("Player Crafting rejects revoked sessions before mutation", async () => {
  const repository = new Repository();
  const response = await handlePlayerCraftingRequest(
    request("POST", `/players/me/crafting/jobs/${JOB}/cancel`, {
      idempotencyKey: "craft.revoked.0001",
    }),
    { kind: "cancelJob", jobKey: JOB },
    dependencies(repository, {
      sessionStatus: "revoked",
      revokedAt: "2026-07-21T03:59:59.000Z",
    }),
  );
  await assertError(response, 401, "player_session_revoked");
  assertEquals(repository.mutations, 0);
});

Deno.test("Player Crafting rejects durability and repair payload fields", async () => {
  const repository = new Repository();
  const equip = await handlePlayerCraftingRequest(
    request("POST", `/players/me/equipment/${EQUIPMENT}/equip`, {
      slot: "field",
      idempotencyKey: "craft.durability.0001",
      durability: 100,
    }),
    { kind: "equip", equipmentKey: EQUIPMENT },
    dependencies(repository),
  );
  await assertError(equip, 400, "invalid_player_crafting_request");

  const repair = await handlePlayerCraftingRequest(
    request("POST", "/players/me/items/repair_kit/use", {
      targetKey: EQUIPMENT,
      idempotencyKey: "craft.repair.0001",
      repair: true,
    }),
    { kind: "useItem", itemKey: "repair_kit" },
    dependencies(repository),
  );
  await assertError(repair, 400, "invalid_player_crafting_request");
  assertEquals(repository.mutations, 0);
});

Deno.test("Player Crafting mutation responses remain private committed successes", async () => {
  const repository = new Repository();
  const response = await handlePlayerCraftingRequest(
    request("POST", `/players/me/crafting/jobs/${JOB}/claim`, {
      idempotencyKey: "craft.claim.private.0001",
    }),
    { kind: "claimJob", jobKey: JOB },
    dependencies(repository),
  );
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(response.headers.get("vary"), "authorization, x-player-session-token");
  assertEquals(body.committed, true);
  assertEquals(body.refreshRequired, true);
  assertNoUuid(JSON.stringify(body));
  assertEquals(repository.mutations, 1);
});

class Repository implements PlayerCraftingRepository {
  mutations = 0;
  read() { return Promise.resolve({ packActive: true, recipes: [], jobs: [] }); }
  startJob() { this.mutations += 1; return this.result("created"); }
  cancelJob() { this.mutations += 1; return this.result("cancelled"); }
  claimJob() { this.mutations += 1; return this.result("claimed"); }
  useItem() { this.mutations += 1; return this.result("applied"); }
  equip() { this.mutations += 1; return this.result("equipped"); }
  salvage() { this.mutations += 1; return this.result("settled"); }
  private result(outcome: string) {
    return Promise.resolve({ outcome, jobKey: JOB, committed: true, refreshRequired: true });
  }
}

function dependencies(
  repository: PlayerCraftingRepository,
  options: {
    readonly gameStatus?: string;
    readonly sessionStatus?: string;
    readonly revokedAt?: string | null;
  } = {},
) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: { supabaseUrl: "http://localhost", supabaseAnonKey: "anon", supabaseServiceRoleKey: "service" },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve({
      ok: true as const,
      session: {
        id: SESSION,
        game_session_id: GAME,
        player_id: PLAYER,
        status: options.sessionStatus ?? "active",
        expires_at: "2026-07-22T00:00:00.000Z",
        revoked_at: options.revokedAt ?? null,
      },
      gameSession: { id: GAME, name: "Game", status: options.gameStatus ?? "active" },
      player: { id: PLAYER, display_name: "Crafter", roster_label: null, status: "active" },
    }),
    createRepository: () => repository,
    now: () => NOW,
  };
}

function request(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({ "x-player-session-token": "token" });
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
