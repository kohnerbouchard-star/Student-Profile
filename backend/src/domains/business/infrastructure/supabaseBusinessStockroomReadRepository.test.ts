import { PlayerBusinessError } from "../contracts/playerBusinessContracts.ts";
import { readBusinessStockroom } from "./supabaseBusinessStockroomReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const ACCOUNT_KEYS = {
  warehouse: `iac_${"1".repeat(32)}`,
  work_in_progress: `iac_${"2".repeat(32)}`,
  finished_goods: `iac_${"3".repeat(32)}`,
  in_transit: `iac_${"4".repeat(32)}`,
} as const;

Deno.test("Business Stockroom reads one coherent canonical snapshot", async () => {
  const client = new FakeClient({ data: snapshotEnvelope(), error: null });
  const snapshot = await readBusinessStockroom(client as never, {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
  });

  assertEquals(snapshot.businessKey, BUSINESS_KEY);
  assertEquals(
    snapshot.locations.map((location) => location.locationKey),
    ["warehouse", "work_in_progress", "finished_goods", "in_transit"],
  );
  assertEquals(snapshot.locations[1], {
    accountKey: ACCOUNT_KEYS.work_in_progress,
    locationKey: "work_in_progress",
    label: "Work in Progress",
    itemCount: 0,
    quantityOwned: 0,
    quantityReserved: 0,
    quantityAvailable: 0,
  });
  assertEquals(
    snapshot.items.map((item) => [item.locationKey, item.canonicalKey]),
    [
      ["warehouse", "material.steel.v1"],
      ["finished_goods", "finished.widget.v1"],
      ["in_transit", "material.copper.v1"],
    ],
  );
  assertEquals(client.calls, [{
    name: "read_owned_business_stockroom_snapshot_v2",
    args: {
      p_game_session_id: GAME_ID,
      p_player_id: PLAYER_ID,
    },
  }]);
  assertNoUuid(JSON.stringify(snapshot));
});

Deno.test("Business Stockroom fails closed on malformed snapshot envelopes", async () => {
  const invalidEnvelopes = [
    { ...snapshotEnvelope(), extra: true },
    { ...snapshotEnvelope(), business_key: `biz_${"f".repeat(32)}` },
    { ...snapshotEnvelope(), locations: locationRows().slice(0, 3) },
    {
      ...snapshotEnvelope(),
      locations: locationRows().map((row, index) =>
        index === 3 ? { ...row, location_key: "warehouse" } : row
      ),
    },
    {
      ...snapshotEnvelope(),
      locations: locationRows().map((row, index) =>
        index === 0 ? { ...row, quantity_owned: 11 } : row
      ),
    },
    {
      ...snapshotEnvelope(),
      items: itemRows().map((row, index) =>
        index === 0
          ? { ...row, item_name: "00000000-0000-4000-8000-000000000099" }
          : row
      ),
    },
  ];

  for (const envelope of invalidEnvelopes) {
    const client = new FakeClient({ data: envelope, error: null });
    const error = await capture(() => readBusinessStockroom(client as never, {
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
    }));
    assertEquals(error.code, "business_stockroom_result_invalid");
    assertEquals(error.status, 500);
  }
});

Deno.test("Business Stockroom preserves scoped and invariant RPC errors", async () => {
  for (const [message, code, status] of [
    ["BUSINESS_NOT_FOUND", "business_not_found", 404],
    [
      "BUSINESS_STOCKROOM_LOCATIONS_INCOMPLETE",
      "business_stockroom_locations_incomplete",
      500,
    ],
  ] as const) {
    const client = new FakeClient({ data: null, error: { message } });
    const error = await capture(() => readBusinessStockroom(client as never, {
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
    }));
    assertEquals(error.code, code);
    assertEquals(error.status, status);
  }
});

function snapshotEnvelope(): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    locations: locationRows(),
    items: itemRows(),
  };
}

function locationRows(): Array<Record<string, unknown>> {
  return [
    location("1", "warehouse", "Warehouse / Materials", 1, 10, 2, 8),
    location("2", "work_in_progress", "Work in Progress", 0, 0, 0, 0),
    location("3", "finished_goods", "Finished Goods", 1, 5, 1, 4),
    location("4", "in_transit", "In Transit", 1, 3, 0, 3),
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
  return [
    item("1", "warehouse", "b", "material.steel.v1", "Steel", 10, 2, 8, 12.5, 4),
    item("3", "finished_goods", "c", "finished.widget.v1", "Widget", 5, 1, 4, 25, 2),
    item("4", "in_transit", "d", "material.copper.v1", "Copper", 3, 0, 3, 9.75, 1),
  ];
}

function item(
  accountDigit: string,
  locationKey: string,
  itemDigit: string,
  canonicalKey: string,
  name: string,
  quantityOwned: number,
  quantityReserved: number,
  quantityAvailable: number,
  averageUnitCost: number,
  version: number,
): Record<string, unknown> {
  return {
    business_key: BUSINESS_KEY,
    account_key: `iac_${accountDigit.repeat(32)}`,
    location_key: locationKey,
    item_key: `itm_${itemDigit.repeat(32)}`,
    canonical_key: canonicalKey,
    item_name: name,
    item_class: locationKey === "finished_goods" ? "finished_good" : "material",
    item_subtype: locationKey === "finished_goods" ? "manufactured" : "metal",
    quantity_owned: quantityOwned,
    quantity_reserved: quantityReserved,
    quantity_available: quantityAvailable,
    average_unit_cost: averageUnitCost,
    cost_currency_code: "NRC",
    holding_version: version,
  };
}

class FakeClient {
  readonly calls: Array<{ name: string; args: unknown }> = [];

  constructor(
    private readonly response: {
      readonly data: unknown;
      readonly error: { readonly message: string } | null;
    },
  ) {}

  rpc(name: string, args: unknown) {
    this.calls.push({ name, args });
    return Promise.resolve(name === "read_owned_business_stockroom_snapshot_v2"
      ? this.response
      : {
        data: null,
        error: { message: `UNEXPECTED_RPC:${name}` },
      });
  }
}

async function capture(run: () => Promise<unknown>): Promise<PlayerBusinessError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlayerBusinessError) return error;
    throw error;
  }
  throw new Error("Expected PlayerBusinessError.");
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
