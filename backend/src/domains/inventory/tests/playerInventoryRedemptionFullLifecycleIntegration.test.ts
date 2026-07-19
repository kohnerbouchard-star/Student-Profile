import { handleInventoryRedemptionOperation } from "../../../../supabase/functions/admin-api/inventoryRedemptionOperations.ts";
import { handlePlayerInventoryRedemptionRequest } from "../api/playerInventoryRedemptionHttpHandler.ts";
import {
  type PlayerInventoryRedemptionDto,
  PlayerInventoryRedemptionError,
  type PlayerInventoryRedemptionRepository,
} from "../contracts/playerInventoryRedemptionContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const STAFF = "00000000-0000-4000-8000-000000000031";
const NOW = new Date("2026-07-19T06:00:00.000Z");

Deno.test("connected Store-owned Inventory redemption lifecycle is idempotent, scoped, and UUID-private", async () => {
  const state = new SharedRedemptionState();

  const created = await playerRequest(state, {
    quantity: 2,
    note: "Use at the classroom store.",
    idempotencyKey: "redeem:meal-pass:001",
  });
  assertEquals(created.status, 201);
  const createdBody = await created.json();
  assertEquals(createdBody.outcome, "created");
  const requestId = createdBody.redemption.id as string;
  assertEquals(state.holding, { quantityOwned: 4, quantityReserved: 2 });
  assertEquals(state.transitions.map((entry) => entry.to), ["pending"]);
  assertEquals(state.inventoryEvents, ["redemption_requested"]);
  assertNoUuid(createdBody);

  const replay = await playerRequest(state, {
    quantity: 2,
    note: "Use at the classroom store.",
    idempotencyKey: "redeem:meal-pass:001",
  });
  assertEquals(replay.status, 200);
  assertEquals((await replay.json()).outcome, "replayed");
  assertEquals(state.holding, { quantityOwned: 4, quantityReserved: 2 });
  assertEquals(state.transitions.length, 1);
  assertEquals(state.inventoryEvents.length, 1);

  const pendingQueue = await adminQueue(state, GAME, "pending");
  assertEquals(pendingQueue.status, 200);
  const pendingBody = pendingQueue.body as {
    data: { redemptions: Array<{ id: string; status: string }> };
  };
  assertEquals(pendingBody.data.redemptions, [{
    ...pendingBody.data.redemptions[0],
    id: requestId,
    status: "pending",
  }]);
  assertNoUuid(pendingBody);

  const approved = await adminReview(
    state,
    GAME,
    requestId,
    "approve",
    "Approved for pickup.",
    "admin:approve:001",
  );
  assertEquals(approved.status, 200);
  assertEquals(readReviewOutcome(approved), "applied");
  assertEquals(readReviewStatus(approved), "approved");
  assertEquals(state.holding, { quantityOwned: 4, quantityReserved: 2 });

  const approveReplay = await adminReview(
    state,
    GAME,
    requestId,
    "approve",
    "Approved for pickup.",
    "admin:approve:001",
  );
  assertEquals(readReviewOutcome(approveReplay), "replayed");
  assertEquals(state.transitions.map((entry) => entry.to), ["pending", "approved"]);

  const fulfilled = await adminReview(
    state,
    GAME,
    requestId,
    "fulfill",
    "Handed to player.",
    "admin:fulfill:001",
  );
  assertEquals(fulfilled.status, 200);
  assertEquals(readReviewStatus(fulfilled), "fulfilled");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });
  assertEquals(state.inventoryEvents, [
    "redemption_requested",
    "redemption_fulfillment_release",
    "redemption_fulfilled",
  ]);

  const fulfillReplay = await adminReview(
    state,
    GAME,
    requestId,
    "fulfill",
    "Handed to player.",
    "admin:fulfill:001",
  );
  assertEquals(readReviewOutcome(fulfillReplay), "replayed");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });
  assertEquals(state.transitions.map((entry) => entry.to), [
    "pending",
    "approved",
    "fulfilled",
  ]);

  const playerHistory = await handlePlayerInventoryRedemptionRequest(
    playerHttpRequest("GET", `/players/me/inventory/redemptions/${requestId}`),
    { kind: "item", requestId },
    playerDependencies(state),
  );
  assertEquals(playerHistory.status, 200);
  const playerHistoryBody = await playerHistory.json();
  assertEquals(playerHistoryBody.redemption.status, "fulfilled");
  assertNoUuid(playerHistoryBody);

  const secondCreated = await playerRequest(state, {
    quantity: 1,
    note: "Changed my mind after review.",
    idempotencyKey: "redeem:meal-pass:002",
  });
  const secondId = (await secondCreated.json()).redemption.id as string;
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 1 });

  const rejected = await adminReview(
    state,
    GAME,
    secondId,
    "reject",
    "Request withdrawn.",
    "admin:reject:002",
  );
  assertEquals(rejected.status, 200);
  assertEquals(readReviewStatus(rejected), "rejected");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });
  assertEquals(state.inventoryEvents.at(-1), "redemption_rejected");

  const invalidFulfill = await adminReview(
    state,
    GAME,
    secondId,
    "fulfill",
    "Must not consume twice.",
    "admin:fulfill:invalid",
  );
  assertEquals(invalidFulfill.status, 409);
  assertEquals((invalidFulfill.body as { code: string }).code, "inventory_redemption_transition_invalid");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });

  const wrongGameQueue = await adminQueue(state, OTHER_GAME, "pending");
  assertEquals(wrongGameQueue.status, 404);
  assertNoUuid(wrongGameQueue.body);

  const allHistory = await handlePlayerInventoryRedemptionRequest(
    playerHttpRequest("GET", "/players/me/inventory/redemptions"),
    { kind: "collection" },
    playerDependencies(state),
  );
  assertEquals(allHistory.status, 200);
  const allHistoryBody = await allHistory.json();
  assertEquals(allHistoryBody.requests.map((item: { status: string }) => item.status), [
    "rejected",
    "fulfilled",
  ]);
  assertNoUuid(allHistoryBody);
});

class SharedRedemptionState implements PlayerInventoryRedemptionRepository {
  readonly holding = { quantityOwned: 4, quantityReserved: 0 };
  readonly transitions: Array<{ requestId: string; to: string }> = [];
  readonly inventoryEvents: string[] = [];
  private readonly requests: StatefulRedemption[] = [];
  private readonly playerKeys = new Map<string, string>();
  private readonly staffKeys = new Map<string, {
    requestId: string;
    action: string;
    note: string | null;
  }>();
  private sequence = 0;

  request(input: Parameters<PlayerInventoryRedemptionRepository["request"]>[0]) {
    this.assertPlayerScope(input.gameId, input.playerUuid);
    const existingId = this.playerKeys.get(input.command.idempotencyKey);
    if (existingId) {
      const existing = this.requireRequest(existingId);
      if (
        existing.itemId !== input.itemId ||
        existing.quantity !== input.command.quantity ||
        existing.requestNote !== input.command.note
      ) {
        return Promise.reject(new PlayerInventoryRedemptionError(
          "player_inventory_redemption_idempotency_conflict",
          "Conflict.",
          409,
          false,
        ));
      }
      return Promise.resolve({ outcome: "replayed" as const, redemption: dto(existing) });
    }
    if (this.holding.quantityOwned - this.holding.quantityReserved < input.command.quantity) {
      return Promise.reject(new PlayerInventoryRedemptionError(
        "player_inventory_redemption_quantity_unavailable",
        "Unavailable.",
        409,
        false,
      ));
    }
    const request: StatefulRedemption = {
      id: `red_${String.fromCharCode(97 + this.sequence).repeat(32)}`,
      itemId: input.itemId,
      quantity: input.command.quantity,
      status: "pending",
      requestNote: input.command.note,
      resolutionNote: null,
      requestedAt: timestamp(this.sequence++),
      reviewedAt: null,
      fulfilledAt: null,
      updatedAt: timestamp(this.sequence),
    };
    this.requests.unshift(request);
    this.playerKeys.set(input.command.idempotencyKey, request.id);
    this.holding.quantityReserved += request.quantity;
    this.transitions.push({ requestId: request.id, to: "pending" });
    this.inventoryEvents.push("redemption_requested");
    return Promise.resolve({ outcome: "created" as const, redemption: dto(request) });
  }

  read(input: Parameters<PlayerInventoryRedemptionRepository["read"]>[0]) {
    this.assertPlayerScope(input.gameId, input.playerUuid);
    const rows = this.requests
      .filter((request) => !input.requestId || request.id === input.requestId)
      .filter((request) => !input.status || request.status === input.status)
      .slice(input.offset, input.offset + input.limit)
      .map(dto);
    return Promise.resolve(rows);
  }

  rpc<T>(name: string, rawArgs: unknown): Promise<{ data: T | null; error: { message: string } | null }> {
    const args = rawArgs as Record<string, unknown>;
    if (name === "read_admin_inventory_redemptions_v1") {
      if (args.p_game_session_id !== GAME || args.p_staff_user_id !== STAFF) {
        return Promise.resolve({ data: null, error: { message: "INVENTORY_REDEMPTION_ADMIN_SCOPE_FORBIDDEN" } });
      }
      const status = typeof args.p_status === "string" ? args.p_status : null;
      const offset = Number(args.p_offset ?? 0);
      const limit = Number(args.p_limit ?? 26);
      const rows = this.requests
        .filter((request) => !status || request.status === status)
        .slice(offset, offset + limit)
        .map((request) => adminRow(request));
      return Promise.resolve({ data: rows as T, error: null });
    }
    if (name !== "review_inventory_redemption_atomic_v1") {
      return Promise.resolve({ data: null, error: { message: "UNKNOWN_RPC" } });
    }
    if (args.p_game_session_id !== GAME || args.p_staff_user_id !== STAFF) {
      return Promise.resolve({ data: null, error: { message: "INVENTORY_REDEMPTION_ADMIN_SCOPE_FORBIDDEN" } });
    }
    const requestId = String(args.p_request_public_id ?? "");
    const action = String(args.p_action ?? "");
    const note = typeof args.p_resolution_note === "string" ? args.p_resolution_note : null;
    const key = String(args.p_idempotency_key ?? "");
    const prior = this.staffKeys.get(key);
    if (prior) {
      if (prior.requestId !== requestId || prior.action !== action || prior.note !== note) {
        return Promise.resolve({ data: null, error: { message: "INVENTORY_REDEMPTION_REVIEW_IDEMPOTENCY_CONFLICT" } });
      }
      return Promise.resolve({
        data: [{ review_outcome: "replayed", ...adminRow(this.requireRequest(requestId)) }] as T,
        error: null,
      });
    }
    const request = this.requests.find((entry) => entry.id === requestId);
    if (!request) {
      return Promise.resolve({ data: null, error: { message: "INVENTORY_REDEMPTION_REVIEW_NOT_FOUND" } });
    }
    const valid =
      (action === "approve" && request.status === "pending") ||
      (action === "reject" && ["pending", "approved"].includes(request.status)) ||
      (action === "fulfill" && request.status === "approved");
    if (!valid) {
      return Promise.resolve({ data: null, error: { message: "INVENTORY_REDEMPTION_REVIEW_TRANSITION_INVALID" } });
    }
    this.staffKeys.set(key, { requestId, action, note });
    request.resolutionNote = note;
    request.reviewedAt = timestamp(++this.sequence);
    request.updatedAt = request.reviewedAt;
    if (action === "approve") {
      request.status = "approved";
    } else if (action === "reject") {
      request.status = "rejected";
      this.holding.quantityReserved -= request.quantity;
      this.inventoryEvents.push("redemption_rejected");
    } else {
      request.status = "fulfilled";
      request.fulfilledAt = timestamp(++this.sequence);
      request.updatedAt = request.fulfilledAt;
      this.holding.quantityReserved -= request.quantity;
      this.holding.quantityOwned -= request.quantity;
      this.inventoryEvents.push("redemption_fulfillment_release", "redemption_fulfilled");
    }
    this.transitions.push({ requestId, to: request.status });
    return Promise.resolve({
      data: [{ review_outcome: "applied", ...adminRow(request) }] as T,
      error: null,
    });
  }

  private assertPlayerScope(gameId: string, playerUuid: string): void {
    if (gameId !== GAME || playerUuid !== PLAYER) {
      throw new PlayerInventoryRedemptionError(
        "player_inventory_redemption_unavailable",
        "Unavailable.",
        404,
        false,
      );
    }
  }

  private requireRequest(requestId: string): StatefulRedemption {
    const request = this.requests.find((entry) => entry.id === requestId);
    if (!request) throw new Error("missing request");
    return request;
  }
}

type StatefulRedemption = {
  id: string;
  itemId: string;
  quantity: number;
  status: "pending" | "approved" | "rejected" | "fulfilled";
  requestNote: string | null;
  resolutionNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  fulfilledAt: string | null;
  updatedAt: string;
};

function dto(request: StatefulRedemption): PlayerInventoryRedemptionDto {
  return { ...request };
}

function adminRow(request: StatefulRedemption): Record<string, unknown> {
  return {
    request_id: request.id,
    item_id: request.itemId,
    quantity: request.quantity,
    status: request.status,
    request_note: request.requestNote,
    resolution_note: request.resolutionNote,
    requested_at: request.requestedAt,
    reviewed_at: request.reviewedAt,
    fulfilled_at: request.fulfilledAt,
    updated_at: request.updatedAt,
    player_reference: "PLAYER-01",
    player_display_name: "Player",
    player_roster_label: "A-01",
    item_name: "Meal Pass",
    item_category: "consumable",
  };
}

function playerDependencies(repository: PlayerInventoryRedemptionRepository) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve({
      ok: true as const,
      session: {
        id: SESSION,
        game_session_id: GAME,
        player_id: PLAYER,
        status: "active",
        expires_at: "2026-07-20T00:00:00.000Z",
        revoked_at: null,
      },
      gameSession: { id: GAME, name: "Game", status: "active" },
      player: {
        id: PLAYER,
        display_name: "Player",
        roster_label: "A-01",
        status: "active",
      },
    }),
    createRepository: () => repository,
    now: () => NOW,
  };
}

function playerRequest(
  repository: PlayerInventoryRedemptionRepository,
  command: { quantity: number; note: string; idempotencyKey: string },
) {
  return handlePlayerInventoryRedemptionRequest(
    playerHttpRequest(
      "POST",
      "/players/me/inventory/meal-pass/redemptions",
      command,
    ),
    { kind: "request", itemId: "meal-pass" },
    playerDependencies(repository),
  );
}

function playerHttpRequest(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "player-token",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
}

function adminQueue(
  service: SharedRedemptionState,
  gameId: string,
  status: string,
) {
  return handleInventoryRedemptionOperation(service, {
    request: new Request(
      `https://example.test/functions/v1/admin-api/games/${gameId}/inventory/redemptions?status=${status}`,
      { method: "GET" },
    ),
    gameId,
    staffUserId: STAFF,
    suffix: "/inventory/redemptions",
  });
}

function adminReview(
  service: SharedRedemptionState,
  gameId: string,
  requestId: string,
  action: "approve" | "reject" | "fulfill",
  note: string,
  idempotencyKey: string,
) {
  const suffix = `/inventory/redemptions/${requestId}/${action}`;
  return handleInventoryRedemptionOperation(service, {
    request: new Request(
      `https://example.test/functions/v1/admin-api/games/${gameId}${suffix}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          ...(action === "reject" ? { reason: note } : { note }),
        }),
      },
    ),
    gameId,
    staffUserId: STAFF,
    suffix,
  });
}

function readReviewOutcome(result: { body?: unknown }): string {
  return (result.body as { data: { outcome: string } }).data.outcome;
}

function readReviewStatus(result: { body?: unknown }): string {
  return (result.body as { data: { redemption: { status: string } } }).data
    .redemption.status;
}

function timestamp(offset: number): string {
  return new Date(NOW.getTime() + offset * 1000).toISOString();
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(serialized)
  ) throw new Error(`Internal UUID leaked: ${serialized}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
