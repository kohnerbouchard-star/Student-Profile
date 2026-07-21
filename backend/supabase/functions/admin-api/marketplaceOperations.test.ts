import { handleMarketplaceAdminOperation } from "./marketplaceOperations.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const LISTING = "lst_11111111111111111111111111111111";
const DISPUTE = "dsp_22222222222222222222222222222222";

Deno.test("Admin Marketplace moderation uses public IDs and expected versions", async () => {
  const service = new FakeService();
  const result = await handleMarketplaceAdminOperation(service as never, {
    request: jsonRequest({ reason: "Policy review", expectedVersion: 3, idempotencyKey: "admin.marketplace.hold.0001" }),
    gameId: GAME, staffUserId: STAFF, suffix: `/marketplace/listings/${LISTING}/hold`,
  });
  assertEquals(result.status, 200);
  assertEquals(service.calls[0].name, "review_marketplace_admin_v2");
  assertEquals(service.calls[0].args.p_target_key, LISTING);
  assertEquals(service.calls[0].args.p_action, "hold");
  assertNoUuid(result.body);
});

Deno.test("Admin Marketplace refund and seller resolution are replay-safe RPC commands", async () => {
  for (const [suffix, action] of [["refund", "refund_buyer"], ["resolve-seller", "resolve_seller"], ["reject", "reject"]] as const) {
    const service = new FakeService();
    service.target = DISPUTE;
    const result = await handleMarketplaceAdminOperation(service as never, {
      request: jsonRequest({ reason: "Reviewed evidence", expectedVersion: 1, idempotencyKey: `admin.marketplace.${suffix}.0001` }),
      gameId: GAME, staffUserId: STAFF, suffix: `/marketplace/disputes/${DISPUTE}/${suffix}`,
    });
    assertEquals(result.status, 200);
    assertEquals(service.calls[0].args.p_action, action);
    assertNoUuid(result.body);
  }
});

Deno.test("Admin Marketplace rejects internal identifiers and malformed payloads", async () => {
  const service = new FakeService();
  for (const input of [
    { suffix: `/marketplace/listings/${GAME}/hold`, body: { reason: "Policy review", expectedVersion: 1, idempotencyKey: "admin.marketplace.bad.0001" } },
    { suffix: `/marketplace/listings/${LISTING}/approve`, body: { reason: "x", expectedVersion: 1, idempotencyKey: "bad" } },
  ]) {
    const result = await handleMarketplaceAdminOperation(service as never, {
      request: jsonRequest(input.body), gameId: GAME, staffUserId: STAFF, suffix: input.suffix,
    });
    if ((result.status ?? 0) < 400) throw new Error("Expected rejection");
    assertNoUuid(result.body);
  }
});

function jsonRequest(body: unknown) { return new Request("https://example.test/admin-api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
class FakeService {
  calls: { name: string; args: Record<string, unknown> }[] = [];
  target = LISTING;
  rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    if (name.startsWith("expire_")) return Promise.resolve({ data: 0, error: null });
    return Promise.resolve({ data: [{ outcome: "applied", target_key: this.target, target_type: this.target.startsWith("lst_") ? "listing" : "dispute", status: "moderation_hold", version: 4, updated_at: "2026-07-21T00:00:00.000Z" }], error: null });
  }
  from() { return { select: () => new FakeFilter() }; }
}
class FakeFilter { eq() { return this; } in() { return this; } order() { return this; } limit() { return this; } maybeSingle() { return Promise.resolve({ data: null, error: null }); } then(a?: any, b?: any) { return Promise.resolve({ data: [], error: null }).then(a, b); } }
function assertNoUuid(value: unknown) { const serialized = JSON.stringify(value); if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) throw new Error(`UUID leaked: ${serialized}`); }
function assertEquals(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`); }
