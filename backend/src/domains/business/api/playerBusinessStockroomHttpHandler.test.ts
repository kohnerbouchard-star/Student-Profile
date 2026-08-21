import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;

Deno.test("Business Stockroom HTTP response exposes four public locations without UUIDs", async () => {
  const client = new FakeClient(locationRows(), itemRows());
  const response = await handlePlayerBusinessRequest(
    request(),
    { kind: "businessRead", resource: "stockroom" },
    dependencies(client),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.businessKey, BUSINESS_KEY);
  assertEquals(body.locations.length, 4);
  assertEquals(body.locations[3].locationKey, "in_transit");
  assertEquals(body.items[0].locationKey, "warehouse");
  assertEquals(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Business Stockroom HTTP response fails closed for malformed canonical reads", async () => {
  const client = new FakeClient(locationRows().slice(0, 3), itemRows());
  const response = await handlePlayerBusinessRequest(
    request(),
    { kind: "businessRead", resource: "stockroom" },
    dependencies(client),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "business_stockroom_result_invalid");
});

function dependencies(client: FakeClient) {
  return {
    createServiceClient: () => client as never,
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: () => Promise.resolve({
      gameId: GAME_ID,
      playerUuid: PLAYER_ID,
    }),
    createRepository: () => ({
      readBusiness: () => Promise.reject(new Error("Unexpected Business read.")),
      execute: () => Promise.reject(new Error("Unexpected Business mutation.")),
    }),
  };
}

function request(): Request {
  return new Request(
    "https://example.test/players/me/business/stockroom",
    {
      method: "GET",
      headers: {
        "x-player-session-token": "session-token",
      },
    },
  );
}

function locationRows(): Array<Record<string, unknown>> {
  return [
    location("1", "warehouse", "Warehouse / Materials", 1, 6, 1, 5),
    location("2", "work_in_progress", "Work in Progress", 0, 0, 0, 0),
    location("3", "finished_goods", "Finished Goods", 0, 0, 0, 0),
    location("4", "in_transit", "In Transit", 0, 0, 0, 0),
  ];
}

function location(
  accountDigit: string,
  locationKey: string,
  label: string,
  itemCount: number,
  quantityOwned: number,
  quantityReserved: number,
  quantityAvailable: number,
): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    account_key: `iac_${accountDigit.repeat(32)}`,
    location_key: locationKey,
    location_label: label,
    item_count: itemCount,
    quantity_owned: quantityOwned,
    quantity_reserved: quantityReserved,
    quantity_available: quantityAvailable,
  };
}

function itemRows(): Array<Record<string, unknown>> {
  return [{
    business_key: BUSINESS_KEY,
    account_key: `iac_${"1".repeat(32)}`,
    location_key: "warehouse",
    item_key: `itm_${"b".repeat(32)}`,
    canonical_key: "material.steel.v1",
    item_name: "Steel",
    item_class: "material",
    item_subtype: "metal",
    quantity_owned: 6,
    quantity_reserved: 1,
    quantity_available: 5,
    average_unit_cost: 12.5,
    cost_currency_code: "NRC",
    holding_version: 4,
  }];
}

class FakeClient {
  constructor(
    private readonly locations: unknown,
    private readonly items: unknown,
  ) {}

  rpc(name: string) {
    if (name === "read_owned_business_stockroom_locations_v2") {
      return Promise.resolve({ data: this.locations, error: null });
    }
    if (name === "read_owned_business_stockroom_v2") {
      return Promise.resolve({ data: this.items, error: null });
    }
    return Promise.resolve({
      data: null,
      error: { message: `UNEXPECTED_RPC:${name}` },
    });
  }
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
