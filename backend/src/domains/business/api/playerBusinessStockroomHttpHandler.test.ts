import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const OFFER_KEY = `sof_${"4".repeat(32)}`;

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

Deno.test("Business Store withdrawal derives the owned Business and returns no raw RPC evidence", async () => {
  const client = new FakeClient({
    request_business_store_offer_withdrawal_v2: {
      requestKey: `swr_${"6".repeat(32)}`,
      offerKey: OFFER_KEY,
      offerStatus: "withdrawal_pending",
    },
  });
  let businessReads = 0;
  const repository = {
    readBusiness: (scope: unknown) => {
      businessReads += 1;
      assertEquals(scope, { gameSessionId: GAME_ID, playerId: PLAYER_ID });
      return Promise.resolve({ configured: true, company: { id: BUSINESS_KEY } });
    },
    execute: () => Promise.reject(new Error("Unexpected Business mutation executor call.")),
  };
  const response = await handlePlayerBusinessRequest(
    withdrawalRequest({
      offerKey: OFFER_KEY,
      mode: "reduce",
      quantity: 2,
      expectedOfferVersion: 7,
      idempotencyKey: "phase12-withdrawal-reduce-001",
    }),
    { kind: "businessStoreWithdrawal" },
    dependencies(client, repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, { ok: true, refreshRequired: true });
  assertEquals(businessReads, 1);
  assertEquals(client.rpcCalls, [{
    name: "request_business_store_offer_withdrawal_v2",
    args: {
      p_game_session_id: GAME_ID,
      p_business_key: BUSINESS_KEY,
      p_offer_key: OFFER_KEY,
      p_mode: "reduce",
      p_quantity: 2,
      p_expected_offer_version: 7,
      p_idempotency_key: "phase12-withdrawal-reduce-001",
    },
  }]);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("Business Store withdrawal rejects browser-authored Business scope before ownership resolution", async () => {
  const client = new FakeClient({});
  let businessReads = 0;
  const repository = {
    readBusiness: () => {
      businessReads += 1;
      return Promise.resolve({ configured: true, company: { id: BUSINESS_KEY } });
    },
    execute: () => Promise.reject(new Error("Unexpected Business mutation executor call.")),
  };
  const response = await handlePlayerBusinessRequest(
    withdrawalRequest({
      businessKey: `biz_${"b".repeat(32)}`,
      offerKey: OFFER_KEY,
      mode: "full",
      expectedOfferVersion: 7,
      idempotencyKey: "phase12-withdrawal-scope-001",
    }),
    { kind: "businessStoreWithdrawal" },
    dependencies(client, repository),
  );
  const body = await response.json();

  assertEquals(response.status, 400);
  assertEquals(body.error.code, "invalid_business_request");
  assertEquals(businessReads, 0);
  assertEquals(client.calls, []);
});

Deno.test("Business Store withdrawal rejects invalid full quantity before RPC", async () => {
  const client = new FakeClient({});
  const response = await handlePlayerBusinessRequest(
    withdrawalRequest({
      offerKey: OFFER_KEY,
      mode: "full",
      quantity: 1,
      expectedOfferVersion: 7,
      idempotencyKey: "phase12-withdrawal-full-001",
    }),
    { kind: "businessStoreWithdrawal" },
    dependencies(client),
  );
  const body = await response.json();

  assertEquals(response.status, 400);
  assertEquals(body.error.code, "invalid_business_request");
  assertEquals(client.calls, []);
});

Deno.test("Business Store withdrawal maps stale offer versions to retryable conflict", async () => {
  const client = new FakeClient({
    request_business_store_offer_withdrawal_v2: {
      $error: "STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT",
    },
  });
  const repository = {
    readBusiness: () => Promise.resolve({ configured: true, company: { id: BUSINESS_KEY } }),
    execute: () => Promise.reject(new Error("Unexpected Business mutation executor call.")),
  };
  const response = await handlePlayerBusinessRequest(
    withdrawalRequest({
      offerKey: OFFER_KEY,
      mode: "full",
      expectedOfferVersion: 6,
      idempotencyKey: "phase12-withdrawal-stale-001",
    }),
    { kind: "businessStoreWithdrawal" },
    dependencies(client, repository),
  );
  const body = await response.json();

  assertEquals(response.status, 409);
  assertEquals(body.error.code, "store_withdrawal_offer_version_conflict");
  assertEquals(body.error.retryable, true);
});

function dependencies(client: FakeClient, repository?: unknown) {
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
    createRepository: () => (repository ?? {
      readBusiness: () => Promise.reject(new Error("Unexpected Business read.")),
      execute: () => Promise.reject(new Error("Unexpected Business mutation.")),
    }) as never,
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

function withdrawalRequest(body: Record<string, unknown>): Request {
  return new Request(
    "https://example.test/players/me/business/store/withdrawals",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-player-session-token": "session-token",
      },
      body: JSON.stringify(body),
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
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(private readonly responses: Record<string, unknown>) {}

  rpc(name: string, args: Record<string, unknown> = {}) {
    this.calls.push(name);
    this.rpcCalls.push({ name, args });
    if (!Object.hasOwn(this.responses, name)) {
      return Promise.resolve({ data: null, error: { message: `UNEXPECTED_RPC:${name}` } });
    }
    const value = this.responses[name];
    if (value && typeof value === "object" && "$error" in value) {
      return Promise.resolve({
        data: null,
        error: { message: String((value as { $error?: unknown }).$error || "RPC_ERROR") },
      });
    }
    return Promise.resolve({ data: value, error: null });
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
