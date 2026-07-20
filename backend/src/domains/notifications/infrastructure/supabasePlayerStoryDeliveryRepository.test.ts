import { PlayerStoryDeliveryError } from "../contracts/playerStoryDeliveryContracts.ts";
import { SupabasePlayerStoryDeliveryRepository } from "./supabasePlayerStoryDeliveryRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const DELIVERY_UUID = "00000000-0000-4000-8000-000000000101";
const NOTIFICATION_UUID = "00000000-0000-4000-8000-000000000201";
const DELIVERY = "ndl_00000000000000000000000000000001";
const NOTIFICATION = "ntf_00000000000000000000000000000001";
const NOW = "2026-07-20T03:00:00.000Z";

Deno.test("story repository projects only bounded categorized cutscene content", async () => {
  const harness = client({
    notifications: [[notificationRow()]],
    notification_deliveries: [[deliveryRow()]],
  });
  const repo = new SupabasePlayerStoryDeliveryRepository(harness.client as never);
  const rows = await repo.listPendingDeliveries({ gameId: GAME, playerUuid: PLAYER, limit: 10 });
  assertEquals(rows[0].publicDeliveryId, DELIVERY);
  assertEquals(rows[0].category, "story");
  assertEquals(rows[0].content, {
    videoAssetKey: "cutscene-1",
    posterAssetKey: "poster-1",
    tone: "briefing",
    act: 1,
    sequence: 2,
  });
  if ("extra" in rows[0].content) throw new Error("Raw payload leaked.");
});

Deno.test("seen optional deliveries remain active until dismissed", async () => {
  const harness = client({
    notifications: [[notificationRow({ requiresAcknowledgement: false })]],
    notification_deliveries: [[deliveryRow({ seenAt: NOW })]],
  });
  const repo = new SupabasePlayerStoryDeliveryRepository(harness.client as never);
  const rows = await repo.listPendingDeliveries({ gameId: GAME, playerUuid: PLAYER, limit: 10 });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].seenAt, NOW);
});

Deno.test("required acknowledgements reject dismissal", async () => {
  const harness = client({
    notification_deliveries: [[deliveryRow({ seenAt: NOW })]],
    notifications: [[notificationRow()]],
  });
  const repo = new SupabasePlayerStoryDeliveryRepository(harness.client as never);
  await assertCode(() => repo.updateDeliveryState({
    gameId: GAME,
    playerUuid: PLAYER,
    publicDeliveryId: DELIVERY,
    action: "dismissed",
    markedAt: NOW,
  }), "player_story_delivery_acknowledgement_required");
});

Deno.test("same terminal transition is replay-safe without another write", async () => {
  const harness = client({
    notification_deliveries: [[deliveryRow({ dismissedAt: NOW, seenAt: NOW })]],
    notifications: [[notificationRow({ requiresAcknowledgement: false })]],
  });
  const repo = new SupabasePlayerStoryDeliveryRepository(harness.client as never);
  const state = await repo.updateDeliveryState({
    gameId: GAME,
    playerUuid: PLAYER,
    publicDeliveryId: DELIVERY,
    action: "dismissed",
    markedAt: "2026-07-20T03:05:00.000Z",
  });
  assertEquals(state.dismissedAt, NOW);
  assertEquals(harness.updateCalls.length, 0);
});

Deno.test("different action after a terminal transition fails closed", async () => {
  const harness = client({
    notification_deliveries: [[deliveryRow({ acknowledgedAt: NOW, seenAt: NOW })]],
    notifications: [[notificationRow()]],
  });
  const repo = new SupabasePlayerStoryDeliveryRepository(harness.client as never);
  await assertCode(() => repo.updateDeliveryState({
    gameId: GAME,
    playerUuid: PLAYER,
    publicDeliveryId: DELIVERY,
    action: "dismissed",
    markedAt: NOW,
  }), "player_story_delivery_conflict");
});

Deno.test("acknowledgement atomically preserves seen state and terminal guards", async () => {
  const updated = deliveryRow({ seenAt: NOW, acknowledgedAt: NOW });
  const harness = client({
    notification_deliveries: [[deliveryRow()]],
    notifications: [[notificationRow()]],
  }, [{ data: updated, error: null }]);
  const repo = new SupabasePlayerStoryDeliveryRepository(harness.client as never);
  const state = await repo.updateDeliveryState({
    gameId: GAME,
    playerUuid: PLAYER,
    publicDeliveryId: DELIVERY,
    action: "acknowledged",
    markedAt: NOW,
  });
  assertEquals(state.seenAt, NOW);
  assertEquals(state.acknowledgedAt, NOW);
  assertEquals(harness.updateCalls[0].values, { acknowledged_at: NOW, seen_at: NOW });
  assertEquals(harness.updateCalls[0].nullFilters.sort(), ["acknowledged_at", "dismissed_at"].sort());
});

Deno.test("malformed raw payload is rejected rather than exposed", async () => {
  const harness = client({
    notifications: [[notificationRow({ payload: { videoAssetKey: "../../secret" } })]],
    notification_deliveries: [[deliveryRow()]],
  });
  const repo = new SupabasePlayerStoryDeliveryRepository(harness.client as never);
  await assertCode(() => repo.listPendingDeliveries({ gameId: GAME, playerUuid: PLAYER, limit: 10 }), "player_story_delivery_payload_invalid");
});

function notificationRow(overrides: Record<string, unknown> = {}) {
  const requiresAcknowledgement = overrides.requiresAcknowledgement ?? true;
  const payload = overrides.payload ?? {
    videoAssetKey: "cutscene-1",
    posterAssetKey: "poster-1",
    requiresAcknowledgement,
    tone: "briefing",
    act: 1,
    sequence: 2,
    extra: { secret: "not exposed" },
  };
  return {
    id: NOTIFICATION_UUID,
    public_notification_id: NOTIFICATION,
    game_session_id: GAME,
    notification_type: "story_cutscene",
    title: "Briefing",
    summary: "Update",
    priority: "major",
    display_mode: "modal_on_next_login",
    payload,
    published_at: NOW,
  };
}

function deliveryRow(overrides: { seenAt?: string | null; dismissedAt?: string | null; acknowledgedAt?: string | null } = {}) {
  return {
    id: DELIVERY_UUID,
    public_delivery_id: DELIVERY,
    notification_id: NOTIFICATION_UUID,
    game_session_id: GAME,
    player_id: PLAYER,
    delivered_at: NOW,
    seen_at: overrides.seenAt ?? null,
    dismissed_at: overrides.dismissedAt ?? null,
    acknowledged_at: overrides.acknowledgedAt ?? null,
  };
}

type Shape = { data: readonly Record<string, unknown>[] | Record<string, unknown> | null; error: any };
function client(
  responses: Record<string, readonly (readonly Record<string, unknown>[])[]>,
  updates: Shape[] = [],
) {
  const offsets = new Map<string, number>();
  const updateCalls: { values: unknown; nullFilters: string[] }[] = [];
  return {
    updateCalls,
    client: {
      from(table: string) {
        return {
          select() {
            const index = offsets.get(table) ?? 0;
            offsets.set(table, index + 1);
            return new FakeFilter({ data: responses[table]?.[index] ?? [], error: null });
          },
          update(values: unknown) {
            const call = { values, nullFilters: [] as string[] };
            updateCalls.push(call);
            return new FakeUpdate(updates.shift() ?? { data: null, error: null }, call);
          },
        };
      },
    },
  };
}

class FakeFilter {
  constructor(private readonly response: Shape) {}
  eq() { return this; } in() { return this; } is() { return this; } order() { return this; } limit() { return this; }
  maybeSingle() {
    const data = Array.isArray(this.response.data) ? this.response.data[0] ?? null : this.response.data;
    return Promise.resolve({ ...this.response, data });
  }
  then(a?: any, b?: any) { return Promise.resolve(this.response).then(a, b); }
}
class FakeUpdate {
  constructor(private readonly response: Shape, private readonly call: { nullFilters: string[] }) {}
  eq() { return this; }
  is(column: string) { this.call.nullFilters.push(column); return this; }
  select() {
    return { maybeSingle: () => Promise.resolve({ ...this.response, data: Array.isArray(this.response.data) ? this.response.data[0] ?? null : this.response.data }) };
  }
}

async function assertCode(run: () => Promise<unknown>, code: string) {
  try { await run(); } catch (error) {
    assertEquals((error as PlayerStoryDeliveryError).code ?? (error as any).code, code);
    return;
  }
  throw new Error(`Expected ${code}`);
}
function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
}
