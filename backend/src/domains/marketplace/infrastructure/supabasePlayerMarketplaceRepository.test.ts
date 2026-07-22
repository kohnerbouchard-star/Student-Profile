import {
  PlayerMarketplaceError,
} from "../contracts/playerMarketplaceContracts.ts";
import { SupabasePlayerMarketplaceRepository } from "./supabasePlayerMarketplaceRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const LISTING = "lst_11111111111111111111111111111111";
const RESERVATION = "mpr_22222222222222222222222222222222";
const ORDER = "ord_33333333333333333333333333333333";
const NOW = "2026-07-21T00:00:00.000Z";

Deno.test("Marketplace purchase preserves applied and replayed settlement identities exactly once per request", async () => {
  const client = new RpcClient({
    reserve_marketplace_purchase_public_v1: [
      row({ outcome: "applied", reservation_key: RESERVATION, status: "reserved", version: 1, created_at: NOW }),
      row({ outcome: "replayed", reservation_key: RESERVATION, status: "reserved", version: 1, created_at: NOW }),
    ],
    settle_marketplace_purchase_public_v1: [
      row({ outcome: "applied", order_key: ORDER, status: "completed", version: 2, completed_at: NOW }),
      row({ outcome: "replayed", order_key: ORDER, status: "completed", version: 2, completed_at: NOW }),
    ],
  });
  const repository = new SupabasePlayerMarketplaceRepository(client as never);
  const input = {
    gameSessionId: GAME,
    playerId: PLAYER,
    listingKey: LISTING,
    quantity: 1,
    expectedVersion: 7,
    idempotencyKey: "marketplace.purchase.replay.0001",
  };
  const applied = await repository.purchase(input);
  const replayed = await repository.purchase(input);
  assertEquals(applied, { outcome: "applied", targetId: ORDER, status: "completed", version: 2, committedAt: NOW });
  assertEquals(replayed, { outcome: "replayed", targetId: ORDER, status: "completed", version: 2, committedAt: NOW });
  assertEquals(client.names(), [
    "reserve_marketplace_purchase_public_v1",
    "settle_marketplace_purchase_public_v1",
    "reserve_marketplace_purchase_public_v1",
    "settle_marketplace_purchase_public_v1",
  ]);
  for (const call of client.calls) {
    assertEquals(call.args.p_game_session_id, GAME);
    assertEquals(call.args.p_buyer_player_id, PLAYER);
  }
});

Deno.test("Marketplace settlement releases insufficient purchases without exposing persistence detail", async () => {
  const client = new RpcClient({
    reserve_marketplace_purchase_public_v1: [
      row({ outcome: "applied", reservation_key: RESERVATION, status: "reserved", version: 1, created_at: NOW }),
    ],
    settle_marketplace_purchase_public_v1: [
      row({ outcome: "insufficient_funds", reservation_key: RESERVATION, status: "released", version: 2, updated_at: NOW }),
    ],
  });
  const repository = new SupabasePlayerMarketplaceRepository(client as never);
  await assertMarketplaceError(
    () => repository.purchase({
      gameSessionId: GAME,
      playerId: PLAYER,
      listingKey: LISTING,
      quantity: 1,
      expectedVersion: 7,
      idempotencyKey: "marketplace.purchase.insufficient.0001",
    }),
    "player_marketplace_insufficient_funds",
    409,
  );
});

Deno.test("Marketplace maps scope, game-state, stale, policy, and wrong-game races to bounded public errors", async () => {
  for (const [message, code, status] of [
    ["MARKETPLACE_PLAYER_SCOPE_INACTIVE", "player_marketplace_conflict", 409],
    ["MARKETPLACE_GAME_NOT_ACTIVE", "player_marketplace_conflict", 409],
    ["MARKETPLACE_GAME_PAUSED", "player_marketplace_conflict", 409],
    ["MARKETPLACE_GAME_ENDED", "player_marketplace_conflict", 409],
    ["MARKETPLACE_STALE_VERSION", "player_marketplace_conflict", 409],
    ["MARKETPLACE_CROSS_COUNTRY_BLOCKED", "player_marketplace_disabled", 409],
    ["MARKETPLACE_LISTING_NOT_FOUND", "player_marketplace_not_found", 404],
  ] as const) {
    const client = new RpcClient({
      create_marketplace_listing_public_v2: [{ data: null, error: { code: "P0001", message } }],
    });
    const repository = new SupabasePlayerMarketplaceRepository(client as never);
    await assertMarketplaceError(
      () => repository.createListing({
        gameSessionId: GAME,
        playerId: PLAYER,
        itemKey: "data-chip",
        quantity: 1,
        unitPrice: 10,
        currencyCode: "LUM",
        condition: "Used",
        durationHours: 24,
        idempotencyKey: "marketplace.create.error.0001",
      }),
      code,
      status,
    );
  }
});

Deno.test("Marketplace maps generic reservation adapter failures to bounded conflicts", async () => {
  for (const message of [
    "MARKETPLACE_RESERVATION_PROJECTION_CONFLICT",
    "MARKETPLACE_RESERVATION_SOURCE_CONFLICT",
    "MARKETPLACE_RESERVATION_SCOPE_CONFLICT",
    "MARKETPLACE_RESERVATION_TRANSITION_CONFLICT",
  ]) {
    const client = new RpcClient({
      create_marketplace_listing_public_v2: [{ data: null, error: { code: "P0001", message } }],
    });
    const repository = new SupabasePlayerMarketplaceRepository(client as never);
    await assertMarketplaceError(
      () => repository.createListing({
        gameSessionId: GAME,
        playerId: PLAYER,
        itemKey: "data-chip",
        quantity: 1,
        unitPrice: 10,
        currencyCode: "LUM",
        condition: "Used",
        durationHours: 24,
        idempotencyKey: `marketplace.create.${message.toLowerCase()}`,
      }),
      "player_marketplace_conflict",
      409,
    );
  }
});

class RpcClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(private readonly responses: Record<string, Array<{ data: unknown; error: { code?: string; message: string } | null }>>) {}
  rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    const queue = this.responses[name] ?? [];
    const response = queue.shift();
    if (!response) return Promise.resolve({ data: null, error: { message: `Missing fake response for ${name}` } });
    return Promise.resolve(response);
  }
  from(): never { throw new Error("Read queries are not expected in repository command tests."); }
  names(): string[] { return this.calls.map((call) => call.name); }
}

function row(data: Record<string, unknown>) {
  return { data: [data], error: null };
}
async function assertMarketplaceError(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  let error: unknown;
  try { await run(); } catch (value) { error = value; }
  if (!(error instanceof PlayerMarketplaceError)) throw new Error(`Expected PlayerMarketplaceError, received ${String(error)}`);
  assertEquals(error.code, code);
  assertEquals(error.status, status);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(error.message)) {
    throw new Error(`UUID leaked in public error: ${error.message}`);
  }
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
