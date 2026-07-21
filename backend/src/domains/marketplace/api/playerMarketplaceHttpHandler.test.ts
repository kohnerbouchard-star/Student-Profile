import { handlePlayerMarketplaceRequest } from "./playerMarketplaceHttpHandler.ts";
import { readPlayerMarketplaceRoutePath } from "./playerMarketplaceRoutePaths.ts";
import type {
  MarketplaceCommittedResult,
  PlayerMarketplaceRepository,
  PlayerMarketplaceScope,
  PlayerMarketplaceSnapshotDto,
} from "../contracts/playerMarketplaceContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const LISTING = "lst_11111111111111111111111111111111";
const ORDER = "ord_22222222222222222222222222222222";
const NOW = "2026-07-21T00:00:00.000Z";

Deno.test("Marketplace routes accept only reviewed public identifiers", () => {
  assertEquals(readPlayerMarketplaceRoutePath("/players/me/marketplace/listings"), { kind: "collection" });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/listings/${LISTING}/activate`), { kind: "activate", listingKey: LISTING });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/listings/${LISTING}/purchase`), { kind: "purchase", listingKey: LISTING });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/listings/${LISTING}/cancel`), { kind: "cancel", listingKey: LISTING });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/orders/${ORDER}/disputes`), { kind: "dispute", orderKey: ORDER });
  assertEquals(readPlayerMarketplaceRoutePath("/players/me/marketplace/listings/private/purchase"), { kind: "malformed" });
});

Deno.test("Marketplace read and writes are private, scoped, and public-id only", async () => {
  const repository = new CapturingRepository();
  const read = await invoke(repository, "GET", "/players/me/marketplace/listings");
  assertEquals(read.status, 200);
  assertPrivate(read);
  assertNoUuid(await read.json());

  const created = await invoke(repository, "POST", "/players/me/marketplace/listings", {
    itemKey: "data-chip", quantity: 2, unitPrice: 15, currencyCode: "LUM",
    condition: "Used", durationHours: 72, idempotencyKey: "marketplace.create.0001",
  });
  assertEquals(created.status, 201);
  assertPrivate(created);
  assertEquals(repository.createInputs[0].gameSessionId, GAME);
  assertEquals(repository.createInputs[0].playerId, PLAYER);

  const activated = await invoke(repository, "POST", `/players/me/marketplace/listings/${LISTING}/activate`, {
    expectedVersion: 1, idempotencyKey: "marketplace.activate.0001",
  });
  assertEquals(activated.status, 200);
  const purchased = await invoke(repository, "POST", `/players/me/marketplace/listings/${LISTING}/purchase`, {
    quantity: 1, expectedVersion: 2, idempotencyKey: "marketplace.purchase.0001",
  });
  assertEquals(purchased.status, 200);
  const cancelled = await invoke(repository, "POST", `/players/me/marketplace/listings/${LISTING}/cancel`, {
    expectedVersion: 2, idempotencyKey: "marketplace.cancel.0001",
  });
  assertEquals(cancelled.status, 200);
  const disputed = await invoke(repository, "POST", `/players/me/marketplace/orders/${ORDER}/disputes`, {
    reason: "The transferred item materially differed from the listing.",
    idempotencyKey: "marketplace.dispute.0001",
  });
  assertEquals(disputed.status, 201);
  for (const response of [activated, purchased, cancelled, disputed]) {
    assertPrivate(response);
    assertNoUuid(await response.json());
  }
});

Deno.test("Marketplace rejects browser scope, non-JSON, oversized, and unexpected payloads privately", async () => {
  const repository = new CapturingRepository();
  const cases = [
    new Request("https://example.test/players/me/marketplace/listings?playerId=x", { headers: { "x-player-session-token": "token" } }),
    new Request("https://example.test/players/me/marketplace/listings", { method: "POST", headers: { "x-player-session-token": "token", "content-type": "text/plain" }, body: "{}" }),
    request("POST", "/players/me/marketplace/listings", { itemKey: "data-chip", playerUuid: PLAYER }),
    request("POST", "/players/me/marketplace/listings", { padding: "x".repeat(5000) }),
  ];
  for (const input of cases) {
    const route = readPlayerMarketplaceRoutePath(new URL(input.url).pathname);
    if (!route) throw new Error("route missing");
    const response = await handlePlayerMarketplaceRequest(input, route, dependencies(repository));
    if (response.status < 400) throw new Error("expected failure");
    assertPrivate(response);
    assertNoUuid(await response.json());
  }
  assertEquals(repository.createInputs.length, 0);
});

async function invoke(repository: CapturingRepository, method: string, path: string, body?: unknown): Promise<Response> {
  const route = readPlayerMarketplaceRoutePath(path);
  if (!route) throw new Error("route missing");
  return handlePlayerMarketplaceRequest(request(method, path, body), route, dependencies(repository));
}
function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "x-player-session-token": "token", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function dependencies(repository: CapturingRepository) {
  return {
    createServiceClient: () => ({}) as never,
    readEnvironment: () => ({ ok: true as const, value: { supabaseUrl: "https://example.test", supabaseAnonKey: "anon", supabaseServiceRoleKey: "service" } }),
    resolveScope: async () => ({ gameId: GAME, playerUuid: PLAYER }) as never,
    createRepository: () => repository,
  };
}
class CapturingRepository implements PlayerMarketplaceRepository {
  createInputs: any[] = []; activateInputs: any[] = []; purchaseInputs: any[] = []; cancelInputs: any[] = []; disputeInputs: any[] = [];
  read(_scope: PlayerMarketplaceScope): Promise<PlayerMarketplaceSnapshotDto> { return Promise.resolve(snapshot()); }
  createListing(input: any): Promise<MarketplaceCommittedResult> { this.createInputs.push(input); return Promise.resolve(result(LISTING, "draft", 1)); }
  activateListing(input: any): Promise<MarketplaceCommittedResult> { this.activateInputs.push(input); return Promise.resolve(result(LISTING, "active", 2)); }
  purchase(input: any): Promise<MarketplaceCommittedResult> { this.purchaseInputs.push(input); return Promise.resolve(result(ORDER, "completed", 2)); }
  cancel(input: any): Promise<MarketplaceCommittedResult> { this.cancelInputs.push(input); return Promise.resolve(result(LISTING, "cancelled", 3)); }
  openDispute(input: any): Promise<MarketplaceCommittedResult> { this.disputeInputs.push(input); return Promise.resolve(result("dsp_33333333333333333333333333333333", "open", 1)); }
}
function result(targetId: string, status: string, version: number): MarketplaceCommittedResult { return { outcome: "applied", targetId, status, version, committedAt: NOW }; }
function snapshot(): PlayerMarketplaceSnapshotDto {
  return {
    policy: { marketplaceEnabled: true, crossCountryTradingEnabled: true, moderationRequired: false, feeRate: 0.025, taxRate: 0.01, listingDurationHours: 168, purchaseReservationMinutes: 5, disputeWindowDays: 7, disputesEnabled: true },
    listings: [{ id: LISTING, itemId: "data-chip", name: "Data Chip", description: "Encrypted data", category: "equipment", image: null, country: "LUMENOR", condition: "Used", seller: "Trader", sellerReference: "PLAYER-42", unitPrice: 15, currencyCode: "LUM", quantity: 2, status: "active", version: 2, expiresAt: NOW, createdAt: NOW, updatedAt: NOW, moderationReason: null, mine: false }],
    myListings: [], reservations: [], orders: [], disputes: [], summary: { listingCount: 1, activeSellers: 1, volume: 0 },
  };
}
function assertPrivate(response: Response): void {
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(response.headers.get("pragma"), "no-cache");
  assertEquals(response.headers.get("vary"), "authorization, x-player-session-token");
}
function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) throw new Error(`UUID leaked: ${serialized}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
}
