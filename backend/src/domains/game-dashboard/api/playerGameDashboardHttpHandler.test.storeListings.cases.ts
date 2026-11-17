import { SupabasePlayerGameDashboardRepository } from "../infrastructure/supabasePlayerGameDashboardRepository.ts";
import { PlayerGameDashboardError } from "../contracts/playerGameDashboardContracts.ts";
import {
  createDashboardStoreListingsReadQuery,
  DashboardStoreListingsReadError,
} from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { createPlayerContractsReadQuery } from "../../contracts/index.ts";
import {
  createStockMarketOpenStateReadRepository,
  createStockMarketReadRepository,
} from "../../stocks/index.ts";
import {
  GAME_SESSION_ID,
  OTHER_GAME_SESSION_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
  STORE_ITEM_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import { storeItem } from "./playerGameDashboardHttpHandler.test.rowFixtures.support.ts";
import { FakeClient } from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { assertEquals } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Store Dashboard query exposes only reads with exact scope, visibility and ordering", async () => {
  const data = tables();
  data.store_items = [
    storeItem({ id: "later", name: "Alpha", sort_order: 2 }),
    storeItem({ id: "zulu", name: "Zulu", sort_order: 1 }),
    storeItem({ id: "alpha", name: "Alpha", sort_order: 1 }),
    storeItem({ id: "hidden", visibility: "hidden" }),
    storeItem({ id: "disabled", status: "disabled" }),
    storeItem({ id: "archived", status: "archived" }),
    storeItem({ id: "other", game_session_id: OTHER_GAME_SESSION_ID }),
  ];
  const client = new FakeClient(data);
  const query = createDashboardStoreListingsReadQuery(client as any);
  assertEquals(Object.keys(query), ["read"]);
  for (const method of ["from", "client", "createStoreItem", "updateStoreItem", "listPurchases", "purchase"]) {
    assertEquals((query as unknown as Record<string, unknown>)[method], undefined);
  }
  assertEquals((await query.read(GAME_SESSION_ID)).map((row) => row.id), ["alpha", "zulu", "later"]);
  assertEquals((await query.read(OTHER_GAME_SESSION_ID)).map((row) => row.id), ["other"]);
  data.store_items = [];
  assertEquals(await query.read(GAME_SESSION_ID), []);
  assertEquals(client.trace, [GAME_SESSION_ID, OTHER_GAME_SESSION_ID, GAME_SESSION_ID].map((gameId) => ({
    table: "store_items",
    columns: "id,game_session_id,item_key,name,description,category,price,currency_code,stock_quantity,status,visibility,sort_order,created_at,updated_at",
    filters: [
      { column: "game_session_id", value: gameId },
      { column: "status", value: "active" },
      { column: "visibility", value: "visible" },
    ],
    inFilters: [],
    orderings: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    limit: null,
  })));
  assertEquals(client.forbiddenCalls, []);
});

Deno.test("Store Dashboard projection preserves numeric defaults, truncation and exact DTO fields", async () => {
  for (const [value, expected] of [
    [1.75, 1.75], [-2.5, -2.5], ["3.75", 3.75], ["-4.5", -4.5],
    ["0x10", 16], ["", 0], ["bad", 0], ["Infinity", 0],
    [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0], [null, 0], [undefined, 0],
  ] as const) {
    const row = storeItem({
      price: value, stock_quantity: value, sort_order: value,
      description: undefined, game_item: { source_kind: "system" },
    });
    const client = new FakeClient({ store_items: [row] });
    const result = await createDashboardStoreListingsReadQuery(client as any).read(GAME_SESSION_ID);
    assertEquals(result, [{
      id: row.id, gameSessionId: row.game_session_id, itemKey: row.item_key,
      name: row.name, description: null, category: row.category,
      price: expected, currencyCode: row.currency_code,
      stockQuantity: Math.trunc(expected), status: row.status,
      visibility: row.visibility, sortOrder: Math.trunc(expected),
      createdAt: row.created_at, updatedAt: row.updated_at,
    }]);
    assertEquals(Object.hasOwn(result[0], "sourceType"), false);
    assertEquals(Object.hasOwn(result[0], "game_item"), false);
  }
});

Deno.test("Store Dashboard query preserves response failure and unknown provider or projection rejection", async () => {
  let caught: unknown;
  try {
    await createDashboardStoreListingsReadQuery(new FakeClient(tables(), "store_items") as any).read(GAME_SESSION_ID);
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof DashboardStoreListingsReadError)) throw new Error("Expected Store read failure");
  for (const scenario of ["provider", "projection"]) {
    const failure = new Error(`Synthetic Store ${scenario} failure`);
    const row = storeItem();
    const client = new FakeClient({ store_items: [row] });
    if (scenario === "provider") {
      client.from = () => { throw failure; };
    } else {
      Object.defineProperty(row, "price", { get: () => { throw failure; } });
    }
    caught = undefined;
    try {
      await createDashboardStoreListingsReadQuery(client as any).read(GAME_SESSION_ID);
    } catch (error) {
      caught = error;
    }
    if (caught !== failure) throw new Error(`Store ${scenario} rejection was replaced`);
  }
});

Deno.test("Dashboard uses fresh injected Store listings without hidden catalog reads", async () => {
  let listings = await createDashboardStoreListingsReadQuery(new FakeClient(tables()) as any).read(GAME_SESSION_ID);
  const calls: string[] = [];
  const client = new FakeClient(tables(), "store_items");
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
      storeListingsReadQuery: { read: (gameId) => { calls.push(gameId); return Promise.resolve(listings); } },
    },
    () => new Date("2026-06-24T00:00:00Z"),
  );
  const input = {
    gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID,
    playerSessionId: PLAYER_SESSION_ID, playerDisplayName: "Avery", playerRosterLabel: "A-1",
  };
  const first = await repository.read(input);
  if (first.me.store.listings !== listings) throw new Error("Dashboard replaced Store DTO array");
  assertEquals(first.public.storeListings.map((row) => row.itemId), [STORE_ITEM_ID]);
  assertEquals("price" in first.public.storeListings[0], false);
  listings = [];
  assertEquals((await repository.read(input)).me.store.listings, []);
  assertEquals(calls, [GAME_SESSION_ID, GAME_SESSION_ID]);
  assertEquals(client.trace.filter((entry) => (entry as { table?: string }).table === "store_items"), []);
  assertEquals(client.forbiddenCalls, []);
});

Deno.test("Dashboard retains its Store error contract and unknown rejection identity", async () => {
  for (const known of [true, false]) {
    const failure = known ? new DashboardStoreListingsReadError() : new Error("Synthetic injected Store failure");
    const client = new FakeClient(tables());
    const repository = new SupabasePlayerGameDashboardRepository(
      client as any,
      {
        stockMarketReadRepository: createStockMarketReadRepository(client as any),
        stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
        playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
        storeListingsReadQuery: { read: () => Promise.reject(failure) },
      },
    );
    let caught: unknown;
    try {
      await repository.read({
        gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID,
        playerSessionId: PLAYER_SESSION_ID, playerDisplayName: "Avery", playerRosterLabel: "A-1",
      });
    } catch (error) {
      caught = error;
    }
    if (known) {
      if (!(caught instanceof PlayerGameDashboardError)) throw new Error("Expected original Dashboard error");
      assertEquals([caught.code, caught.message, caught.status], [
        "game_dashboard_read_failed", "Player game dashboard could not be loaded.", 500,
      ]);
    } else if (caught !== failure) {
      throw new Error("Injected Store rejection was replaced");
    }
  }
});

Deno.test("Dashboard captures port references without retaining or freezing the caller record", async () => {
  const client = new FakeClient(tables());
  const original = {
    stockMarketReadRepository: createStockMarketReadRepository(client as any),
    stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
    playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
    storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
  };
  const callerRecord = { ...original };
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    callerRecord,
    () => new Date("2026-06-24T00:00:00Z"),
  );
  const replaced = () => Promise.reject(new Error("Caller replacement must not run"));
  callerRecord.stockMarketReadRepository = { read: replaced };
  callerRecord.stockMarketOpenStateReadRepository = { read: replaced };
  callerRecord.playerContractsReadQuery = { read: replaced };
  callerRecord.storeListingsReadQuery = { read: replaced };
  const input = {
    gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID,
    playerSessionId: PLAYER_SESSION_ID, playerDisplayName: "Avery", playerRosterLabel: "A-1",
  };
  const first = await repository.read(input);
  assertEquals(first.me.store.listings.map((row) => row.id), [STORE_ITEM_ID]);
  assertEquals(Object.isFrozen(callerRecord), false);
  for (const port of Object.values(original)) assertEquals(Object.isFrozen(port), false);
  const readStore = original.storeListingsReadQuery.read;
  original.storeListingsReadQuery.read = async (gameId) =>
    (await readStore(gameId)).map((row) => ({ ...row, name: "Fresh original port" }));
  const second = await repository.read(input);
  assertEquals(second.me.store.listings.map((row) => row.name), ["Fresh original port"]);
  for (const name of ["game_session_contracts", "player_contract_progress", "store_items"]) {
    assertEquals(client.trace.filter((entry) => (entry as { table?: string }).table === name).length, 2);
  }
  assertEquals(client.trace.filter((entry) => (entry as { rpc?: string }).rpc === "is_stock_market_open_at").length, 2);
  assertEquals(client.forbiddenCalls, []);
});
