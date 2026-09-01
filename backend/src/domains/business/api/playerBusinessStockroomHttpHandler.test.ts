import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;

Deno.test("Business Stockroom HTTP response exposes one coherent public snapshot", async () => {
  const client = new FakeClient({
    read_owned_business_stockroom_snapshot_v2: snapshotEnvelope(),
  });
  const response = await handlePlayerBusinessRequest(
    request("stockroom"),
    { kind: "businessRead", resource: "stockroom" },
    dependencies(client),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.businessKey, BUSINESS_KEY);
  assertEquals(body.locations.length, 4);
  assertEquals(body.locations[3].locationKey, "in_transit");
  assertEquals(body.items[0].locationKey, "warehouse");
  assertEquals(client.calls, ["read_owned_business_stockroom_snapshot_v2"]);
  assertEquals(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Business Stockroom HTTP response fails closed for malformed snapshot envelopes", async () => {
  const client = new FakeClient({
    read_owned_business_stockroom_snapshot_v2: {
      ...snapshotEnvelope(),
      locations: locationRows().slice(0, 3),
    },
  });
  const response = await handlePlayerBusinessRequest(
    request("stockroom"),
    { kind: "businessRead", resource: "stockroom" },
    dependencies(client),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "business_stockroom_result_invalid");
});

Deno.test("Business Equipment HTTP response exposes public finite-capacity evidence", async () => {
  const client = new FakeClient({
    read_owned_business_equipment_v2: [equipmentRow()],
  });
  const response = await handlePlayerBusinessRequest(
    request("equipment"),
    { kind: "businessRead", resource: "equipment" },
    dependencies(client),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.equipment.length, 1);
  assertEquals(body.equipment[0].businessKey, BUSINESS_KEY);
  assertEquals(body.equipment[0].installationKey, `bei_${"1".repeat(32)}`);
  assertEquals(body.equipment[0].equipmentKey, `eqp_${"1".repeat(32)}`);
  assertEquals(body.equipment[0].availableMinutes, 300);
  assertEquals(body.equipment[0].utilizationBasisPoints, 3750);
  assertEquals(client.calls, ["read_owned_business_equipment_v2"]);
  assertEquals(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assertNoUuid(JSON.stringify(body));
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

function request(resource: "stockroom" | "equipment"): Request {
  return new Request(
    `https://example.test/players/me/business/${resource}`,
    {
      method: "GET",
      headers: { "x-player-session-token": "session-token" },
    },
  );
}

function snapshotEnvelope(): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    locations: locationRows(),
    items: [{
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
    }],
  };
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

function equipmentRow(): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    installation_key: `bei_${"1".repeat(32)}`,
    equipment_key: `eqp_${"1".repeat(32)}`,
    item_key: `itm_${"e".repeat(32)}`,
    canonical_key: "machine.press.v1",
    item_name: "Hydraulic Press",
    equipment_slot: "operations",
    capability_keys: ["press", "forming"],
    installation_status: "installed",
    period_key: "equipment:12",
    capacity_minutes: 480,
    reserved_minutes: 120,
    consumed_minutes: 60,
    available_minutes: 300,
    idle_minutes: 300,
    utilization_basis_points: 3750,
    durability_supported: false,
    repair_supported: false,
  };
}

class FakeClient {
  readonly calls: string[] = [];
  constructor(private readonly responses: Record<string, unknown>) {}

  rpc(name: string) {
    this.calls.push(name);
    return Promise.resolve(Object.hasOwn(this.responses, name)
      ? { data: this.responses[name], error: null }
      : { data: null, error: { message: `UNEXPECTED_RPC:${name}` } });
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
