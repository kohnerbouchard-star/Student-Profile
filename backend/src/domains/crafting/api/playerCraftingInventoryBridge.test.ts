import { handlePlayerInventoryReadRequest } from "../../inventory/api/playerInventoryReadHttpHandler.ts";
import {
  craftingEndpointKey,
  handleCraftingBridgeRequest,
} from "./playerCraftingInventoryBridge.ts";
import { readPlayerInventoryRoutePath } from "../../inventory/api/playerInventoryRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  env: { get(name: string): string | undefined };
};

Deno.test("Inventory dispatch seam preserves Inventory and recognizes every Crafting path", () => {
  assertEquals(readPlayerInventoryRoutePath("/players/me/inventory"), {
    kind: "inventory",
  });
  assertEquals(readPlayerInventoryRoutePath("/players/me/crafting"), {
    kind: "crafting",
    route: { kind: "read" },
  });
  assertEquals(readPlayerInventoryRoutePath("/players/me/crafting/jobs"), {
    kind: "crafting",
    route: { kind: "startJob" },
  });
  assertEquals(
    readPlayerInventoryRoutePath(
      "/players/me/crafting/jobs/cft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cancel",
    ),
    {
      kind: "crafting",
      route: {
        kind: "cancelJob",
        jobKey: "cft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    },
  );
  assertEquals(
    readPlayerInventoryRoutePath(
      "/players/me/equipment/eqp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/salvage",
    ),
    {
      kind: "crafting",
      route: {
        kind: "salvage",
        equipmentKey: "eqp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
  );
});

Deno.test("Crafting-like malformed paths remain fail closed", () => {
  assertEquals(
    readPlayerInventoryRoutePath("/players/me/crafting/jobs/not-public/claim"),
    {
      kind: "crafting",
      route: { kind: "malformed" },
    },
  );
  assertEquals(readPlayerInventoryRoutePath("/players/me/inventory/extra"), {
    kind: "malformed",
  });
  assertEquals(readPlayerInventoryRoutePath("/players/me/unrelated"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}

Deno.test("Crafting bridge maps every route to its existing rate key", () => {
  assertEquals([
    craftingEndpointKey({ kind: "read" }),
    craftingEndpointKey({ kind: "startJob" }),
    craftingEndpointKey({ kind: "malformed" }),
    craftingEndpointKey({ kind: "cancelJob", jobKey: "job" }),
    craftingEndpointKey({ kind: "claimJob", jobKey: "job" }),
    craftingEndpointKey({ kind: "useItem", itemKey: "item" }),
    craftingEndpointKey({ kind: "equip", equipmentKey: "equipment" }),
    craftingEndpointKey({ kind: "salvage", equipmentKey: "equipment" }),
  ], [
    "crafting",
    "crafting",
    "crafting",
    "craftingJobCancel",
    "craftingJobClaim",
    "itemEffectUse",
    "equipmentEquip",
    "equipmentSalvage",
  ]);
});

Deno.test("Crafting bridge denies before handler when rate configuration is unavailable", async () => {
  let clients = 0;
  let reads = 0;
  const response = await handleCraftingBridgeRequest(
    new Request("https://example.test/players/me/crafting"),
    { kind: "read" },
    {
      createServiceClient: () => {
        clients++;
        throw new Error("unexpected client");
      },
      readSupabaseEnv: () => {
        reads++;
        return { ok: false } as never;
      },
    },
  );
  assertEquals(response.status, 503);
  assertEquals(reads, 1);
  assertEquals(clients, 0);
});

Deno.test("Crafting bridge preserves malformed route response status and code", async () => {
  const response = await handleCraftingBridgeRequest(
    new Request("https://example.test/players/me/crafting/bad", {
      method: "DELETE",
    }),
    { kind: "malformed" },
    {
      createServiceClient: () => {
        throw new Error("unexpected client");
      },
    },
  );
  const body = await response.json();
  assertEquals(response.status, 400);
  assertEquals(body.error.code, "invalid_player_crafting_request");
});

Deno.test("Crafting bridge reads selected handler dependencies without reading Inventory repository", async () => {
  const accessed: string[] = [];
  const dependencies = {
    createServiceClient: () => {
      throw new Error("unexpected client");
    },
    get readSupabaseEnv() {
      accessed.push("readSupabaseEnv");
      return undefined;
    },
    get hashSessionToken() {
      accessed.push("hashSessionToken");
      return undefined;
    },
    get resolvePlayerSession() {
      accessed.push("resolvePlayerSession");
      return undefined;
    },
    get now() {
      accessed.push("now");
      return undefined;
    },
    get createRepository(): never {
      throw new Error("Inventory repository leaked");
    },
  };
  const response = await handleCraftingBridgeRequest(
    new Request("https://example.test/players/me/crafting", {
      method: "DELETE",
    }),
    { kind: "read" },
    dependencies,
  );
  assertEquals(response.status, 405);
  assertEquals(accessed, [
    "readSupabaseEnv",
    "readSupabaseEnv",
    "hashSessionToken",
    "resolvePlayerSession",
    "now",
  ]);
});

Deno.test("Crafting bridge matches Inventory dispatch for accepted and denied requests", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Deno.env, "get");
  if (!descriptor || !descriptor.configurable) {
    throw new Error("Deno.env.get cannot be safely restored");
  }
  Object.defineProperty(Deno.env, "get", {
    ...descriptor,
    value: (name: string) =>
      name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET"
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        : name === "ECONOVARIA_TRUSTED_CLIENT_IP_HEADER"
        ? "x-real-ip"
        : undefined,
  });
  try {
    const inventoryAccepted = await bridgeParityRun(true, false);
    const bridgeAccepted = await bridgeParityRun(true, true);
    assertEquals(bridgeAccepted, inventoryAccepted);
    assertEquals(bridgeAccepted.status, 200);
    assertEquals(bridgeAccepted.body, {
      ok: true,
      generatedAt: "2026-07-21T04:00:00.000Z",
      data: { recipes: [] },
    });
    assertEquals(bridgeAccepted.cache, "private, no-store");
    assertEquals(bridgeAccepted.vary, "authorization, x-player-session-token");
    assertEquals(bridgeAccepted.trace, [
      "env",
      "client:1",
      "query:player_sessions",
      "query:game_sessions",
      "query:players",
      "rate:allowed",
      "env",
      "client:2",
      "now",
      "hash:token",
      "resolve:handler-client:handler-hash",
      "craft:server-scope",
    ]);
    const inventoryDenied = await bridgeParityRun(false, false);
    const bridgeDenied = await bridgeParityRun(false, true);
    assertEquals(bridgeDenied, inventoryDenied);
    assertEquals(bridgeDenied.status, 429);
    assertEquals(bridgeDenied.trace, [
      "env",
      "client:1",
      "query:player_sessions",
      "query:game_sessions",
      "query:players",
      "rate:denied",
    ]);
  } finally {
    Object.defineProperty(Deno.env, "get", descriptor);
  }
  const restored = Object.getOwnPropertyDescriptor(Deno.env, "get");
  if (
    !restored || restored.value !== descriptor.value ||
    restored.get !== descriptor.get || restored.set !== descriptor.set
  ) {
    throw new Error("Deno.env.get property identity was not restored");
  }
  assertEquals(
    {
      configurable: restored.configurable,
      enumerable: restored.enumerable,
      writable: restored.writable,
    },
    {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      writable: descriptor.writable,
    },
  );
});

async function bridgeParityRun(allowed: boolean, useBridge: boolean) {
  const trace: string[] = [];
  const game = "00000000-0000-4000-8000-000000000001";
  const player = "00000000-0000-4000-8000-000000000021";
  const session = {
    id: "00000000-0000-4000-8000-000000000011",
    game_session_id: game,
    player_id: player,
    status: "active",
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
  };
  const gameSession = { id: game, name: "Game", status: "active" };
  const playerRow = {
    id: player,
    display_name: "Crafter",
    roster_label: null,
    status: "active",
  };
  const rows: Record<string, unknown> = {
    player_sessions: session,
    game_sessions: gameSession,
    players: playerRow,
  };
  const rateClient = {
    from(table: string) {
      if (!(table in rows)) throw new Error(`Unexpected query ${table}`);
      trace.push(`query:${table}`);
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[table], error: null });
        },
      };
      return query;
    },
    rpc(name: string) {
      assertEquals(name, "consume_request_rate_limits_v1");
      trace.push(`rate:${allowed ? "allowed" : "denied"}`);
      return Promise.resolve({
        data: {
          allowed,
          retry_after_seconds: allowed ? 0 : 30,
          limiting_dimension: allowed ? null : "action",
          limit_count: 60,
          remaining_count: allowed ? 59 : 0,
          reset_at: "2099-01-01T00:00:00.000Z",
        },
        error: null,
      });
    },
  };
  const handlerClient = {
    rpc(name: string, args: unknown) {
      assertEquals(name, "read_player_crafting_v1");
      assertEquals(args, { p_game_session_id: game, p_player_id: player });
      trace.push("craft:server-scope");
      return Promise.resolve({ data: { recipes: [] }, error: null });
    },
  };
  let clients = 0;
  const dependencies = {
    createServiceClient: () => {
      clients++;
      trace.push(`client:${clients}`);
      if (clients > 2) throw new Error("Unexpected client");
      return (clients === 1 ? rateClient : handlerClient) as never;
    },
    readSupabaseEnv: () => {
      trace.push("env");
      return {
        ok: true as const,
        value: {
          supabaseUrl: "http://localhost",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service",
        },
      };
    },
    hashSessionToken: (token: string) => {
      trace.push(`hash:${token}`);
      return Promise.resolve("handler-hash");
    },
    resolvePlayerSession: (client: unknown, hash: string) => {
      trace.push(
        `resolve:${
          client === handlerClient ? "handler-client" : "wrong-client"
        }:${hash}`,
      );
      return Promise.resolve({
        ok: true as const,
        session,
        gameSession,
        player: playerRow,
      });
    },
    now: () => {
      trace.push("now");
      return new Date("2026-07-21T04:00:00.000Z");
    },
    get createRepository(): never {
      throw new Error("Inventory repository leaked");
    },
  };
  const request = new Request("https://example.test/players/me/crafting", {
    headers: { "x-player-session-token": "token", "x-real-ip": "203.0.113.42" },
  });
  const response = useBridge
    ? await handleCraftingBridgeRequest(request, { kind: "read" }, dependencies)
    : await handlePlayerInventoryReadRequest(request, {
      kind: "crafting",
      route: { kind: "read" },
    }, dependencies);
  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get("cache-control"),
    vary: response.headers.get("vary"),
    trace,
  };
}
