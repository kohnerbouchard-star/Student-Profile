import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = `red_${"a".repeat(32)}`;

Deno.test("admin redemption queue defaults to pending and returns UUID-private public models", async () => {
  const service = new FakeService([row()]);
  const result = await operation(service, { method: "GET" });
  assertEquals(result.status, 200);
  assertEquals(service.calls, [{
    name: "read_admin_inventory_redemptions_v1",
    args: {
      p_game_session_id: GAME,
      p_staff_user_id: STAFF,
      p_status: "pending",
      p_limit: 26,
      p_offset: 0,
    },
  }]);
  assertNoUuid(JSON.stringify(result.body));
  const data = (result.body as {
    data: {
      redemptions: Array<{
        id: string;
        player: { displayName: string };
      }>;
      summary: { pending: number };
    };
  }).data;
  assertEquals(data.redemptions[0].id, REQUEST_ID);
  assertEquals(data.redemptions[0].player.displayName, "Student");
  assertEquals(data.summary.pending, 1);
});

Deno.test("admin redemption queue supports bounded historical pagination and lookahead", async () => {
  const service = new FakeService([
    row({ status: "approved" }),
    row({
      request_id: `red_${"b".repeat(32)}`,
      status: "fulfilled",
      reviewed_at: NOW,
      fulfilled_at: NOW,
    }),
    row({
      request_id: `red_${"c".repeat(32)}`,
      status: "rejected",
      reviewed_at: NOW,
    }),
  ]);
  const result = await operation(service, {
    method: "GET",
    query: "status=history&limit=2&offset=5",
  });
  const data = (result.body as {
    data: {
      redemptions: unknown[];
      pagination: Record<string, unknown>;
    };
  }).data;
  assertEquals(service.calls[0].args.p_status, null);
  assertEquals(data.redemptions.length, 2);
  assertEquals(data.pagination, {
    limit: 2,
    offset: 5,
    returned: 2,
    hasMore: true,
  });
});

Deno.test("admin redemption review sends public request IDs and server-authenticated scope to one atomic RPC", async () => {
  for (const action of ["approve", "reject", "fulfill"] as const) {
    const service = new FakeService([row({
      review_outcome: "applied",
      status: action === "approve"
        ? "approved"
        : action === "reject"
        ? "rejected"
        : "fulfilled",
      reviewed_at: NOW,
      fulfilled_at: action === "fulfill" ? NOW : null,
    })]);
    const result = await operation(service, {
      method: "POST",
      suffix: `/inventory/redemptions/${REQUEST_ID}/${action}`,
      body: {
        idempotencyKey: `${action}:001`,
        ...(action === "reject"
          ? { reason: "Not eligible." }
          : { note: "Reviewed." }),
      },
    });
    assertEquals(result.status, 200);
    assertEquals(service.calls[0], {
      name: "review_inventory_redemption_atomic_v1",
      args: {
        p_game_session_id: GAME,
        p_staff_user_id: STAFF,
        p_request_public_id: REQUEST_ID,
        p_action: action,
        p_resolution_note: action === "reject" ? "Not eligible." : "Reviewed.",
        p_idempotency_key: `${action}:001`,
      },
    });
    assertEquals(
      (result.body as { data: { effectApplication: string } }).data
        .effectApplication,
      "not_automated",
    );
    assertNoUuid(JSON.stringify(result.body));
  }
});

Deno.test("admin redemption review preserves exact replay outcome", async () => {
  const service = new FakeService([
    row({ review_outcome: "replayed", status: "approved", reviewed_at: NOW }),
  ]);
  const result = await operation(service, {
    method: "POST",
    suffix: `/inventory/redemptions/${REQUEST_ID}/approve`,
    headers: { "x-idempotency-key": "approve:001" },
    body: {},
  });
  assertEquals(result.status, 200);
  assertEquals(
    (result.body as { data: { outcome: string } }).data.outcome,
    "replayed",
  );
});

Deno.test("admin redemption queue and review reject malformed methods, paths, filters, and commands before RPC", async () => {
  const service = new FakeService([]);
  for (
    const options of [
      { method: "POST", suffix: "/inventory/redemptions", body: {} },
      { method: "GET", suffix: `/inventory/redemptions/${REQUEST_ID}/approve` },
      { method: "GET", suffix: "/inventory/redemptions/not-public" },
      { method: "GET", query: "status=cancelled" },
      { method: "GET", query: "limit=51" },
      { method: "GET", query: "status=pending&status=approved" },
      {
        method: "POST",
        suffix: `/inventory/redemptions/${REQUEST_ID}/reject`,
        body: { idempotencyKey: "reject:001" },
      },
      {
        method: "POST",
        suffix: `/inventory/redemptions/${REQUEST_ID}/approve`,
        body: { idempotencyKey: "bad key" },
      },
      {
        method: "POST",
        suffix: `/inventory/redemptions/${REQUEST_ID}/approve`,
        body: { idempotencyKey: "one", playerId: "browser" },
      },
    ]
  ) {
    const result = await operation(service, options as never);
    assert(result.handled === true, "route should be handled");
    assert(
      [400, 405].includes(result.status ?? 0),
      `unexpected status ${result.status}`,
    );
  }
  assertEquals(service.calls.length, 0);
});

Deno.test("admin redemption review rejects mismatched header and body idempotency keys", async () => {
  const service = new FakeService([]);
  const result = await operation(service, {
    method: "POST",
    suffix: `/inventory/redemptions/${REQUEST_ID}/approve`,
    headers: { "x-idempotency-key": "header:001" },
    body: { idempotencyKey: "body:001" },
  });
  assertEquals(result.status, 400);
  assertEquals(service.calls.length, 0);
});

Deno.test("admin redemption maps scope, missing request, state, idempotency, and schema errors", async () => {
  for (
    const [message, status, code] of [
      [
        "INVENTORY_REDEMPTION_ADMIN_SCOPE_FORBIDDEN",
        404,
        "inventory_redemption_not_found",
      ],
      [
        "INVENTORY_REDEMPTION_REVIEW_NOT_FOUND",
        404,
        "inventory_redemption_not_found",
      ],
      [
        "INVENTORY_REDEMPTION_REVIEW_TRANSITION_INVALID",
        409,
        "inventory_redemption_transition_invalid",
      ],
      [
        "INVENTORY_REDEMPTION_REVIEW_RESERVATION_INVALID",
        409,
        "inventory_redemption_transition_invalid",
      ],
      [
        "INVENTORY_REDEMPTION_REVIEW_IDEMPOTENCY_CONFLICT",
        409,
        "inventory_redemption_idempotency_conflict",
      ],
      [
        "function does not exist",
        503,
        "inventory_redemption_schema_not_applied",
      ],
    ] as const
  ) {
    const service = new FakeService(null, { message });
    const result = await operation(service, {
      method: "POST",
      suffix: `/inventory/redemptions/${REQUEST_ID}/approve`,
      body: { idempotencyKey: "approve:001" },
    });
    assertEquals(result.status, status);
    assertEquals((result.body as { code: string }).code, code);
  }
});

Deno.test("admin redemption fails closed and redacts UUID-shaped content from persistence", async () => {
  const service = new FakeService([row({
    player_reference: GAME,
    player_display_name: `Student ${GAME}`,
    request_note: `Internal ${STAFF}`,
  })]);
  const result = await operation(service, { method: "GET" });
  assertEquals(result.status, 200);
  assertNoUuid(JSON.stringify(result.body));

  const malformed = await operation(
    new FakeService([row({ request_id: GAME })]),
    { method: "GET" },
  );
  assertEquals(malformed.status, 500);
});

Deno.test("admin redemption leaves unrelated Admin routes untouched", async () => {
  const service = new FakeService([]);
  const result = await operation(service, {
    method: "GET",
    suffix: "/players",
  });
  assertEquals(result, { handled: false });
  assertEquals(service.calls.length, 0);
});

const NOW = "2026-07-18T13:00:00.000Z";

class FakeService {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(
    private readonly data: readonly Record<string, unknown>[] | null,
    private readonly error:
      | { readonly message: string; readonly code?: string }
      | null = null,
  ) {}
  rpc<T>(
    name: string,
    args: unknown,
  ): Promise<{
    data: T | null;
    error: { readonly message: string; readonly code?: string } | null;
  }> {
    this.calls.push({ name, args: args as Record<string, unknown> });
    return Promise.resolve({ data: this.data as T | null, error: this.error });
  }
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    review_outcome: "applied",
    request_id: REQUEST_ID,
    item_id: "meal-pass",
    quantity: 1,
    status: "pending",
    request_note: "Lunch",
    resolution_note: null,
    requested_at: NOW,
    reviewed_at: null,
    fulfilled_at: null,
    updated_at: NOW,
    player_reference: "STUDENT-01",
    player_display_name: "Student",
    player_roster_label: "A-01",
    item_name: "Meal Pass",
    item_category: "reward",
    ...overrides,
  };
}

function operation(service: FakeService, options: {
  readonly method: string;
  readonly suffix?: string;
  readonly query?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}) {
  const request = new Request(
    `https://example.test/functions/v1/admin-api/games/${GAME}${
      options.suffix ?? "/inventory/redemptions"
    }${options.query ? `?${options.query}` : ""}`,
    {
      method: options.method,
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {}),
      },
      ...(["GET", "HEAD"].includes(options.method)
        ? {}
        : { body: JSON.stringify(options.body ?? {}) }),
    },
  );
  return handleInventoryRedemptionOperation(service, {
    request,
    gameId: GAME,
    staffUserId: STAFF,
    suffix: options.suffix ?? "/inventory/redemptions",
  });
}

function assertNoUuid(value: string): void {
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(value)
  ) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
