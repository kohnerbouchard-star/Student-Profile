import {
  DEFAULT_PLAYER_NOTIFICATION_LIMIT,
  encodePlayerNotificationCursor,
  MAX_PLAYER_NOTIFICATION_LIMIT,
  MAX_PLAYER_NOTIFICATION_READ_BODY_BYTES,
  MAX_PLAYER_NOTIFICATION_READ_IDS,
  parsePlayerNotificationCursor,
  parsePlayerNotificationListRequest,
  parsePlayerNotificationReadRequest,
} from "./playerNotificationRequestParser.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const DELIVERY_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_DELIVERY_ID = "00000000-0000-4000-8000-000000000002";
const DELIVERED_AT = "2026-07-17T08:00:00.000Z";

Deno.test("notification list parser applies safe defaults and explicit filters", () => {
  assertEquals(
    parsePlayerNotificationListRequest(listRequest()),
    {
      status: "unread",
      limit: DEFAULT_PLAYER_NOTIFICATION_LIMIT,
      cursor: null,
    },
  );
  assertEquals(
    parsePlayerNotificationListRequest(
      listRequest("status=read&limit=50"),
    ),
    {
      status: "read",
      limit: MAX_PLAYER_NOTIFICATION_LIMIT,
      cursor: null,
    },
  );
});

Deno.test("notification cursor round trips a timestamp and delivery UUID", () => {
  const encoded = encodePlayerNotificationCursor({
    deliveredAt: DELIVERED_AT,
    deliveryId: DELIVERY_ID,
  });

  assertEquals(parsePlayerNotificationCursor(encoded), {
    deliveredAt: DELIVERED_AT,
    deliveryId: DELIVERY_ID,
  });
  assertEquals(
    parsePlayerNotificationListRequest(
      listRequest(`cursor=${encodeURIComponent(encoded)}`),
    ).cursor,
    {
      deliveredAt: DELIVERED_AT,
      deliveryId: DELIVERY_ID,
    },
  );
});

Deno.test("notification list parser rejects invalid, duplicate, or unsupported query fields", () => {
  for (
    const query of [
      "status=unknown",
      "limit=0",
      "limit=51",
      "limit=1.5",
      "status=unread&status=read",
      "gameSessionId=one&gameSessionId=two",
      "playerId=player-1",
      "cursor=not-a-cursor",
    ]
  ) {
    assertThrowsCode(
      () => parsePlayerNotificationListRequest(listRequest(query)),
      "invalid_player_notification_request",
    );
  }
});

Deno.test("notification read parser accepts canonical and terminal compatibility ID fields", async () => {
  const canonical = await parsePlayerNotificationReadRequest(
    readRequest({ deliveryIds: [DELIVERY_ID, OTHER_DELIVERY_ID, DELIVERY_ID] }),
  );
  const compatibility = await parsePlayerNotificationReadRequest(
    readRequest({ notificationIds: [DELIVERY_ID] }),
  );

  assertEquals(canonical, {
    deliveryIds: [DELIVERY_ID, OTHER_DELIVERY_ID],
    compatibilityFieldUsed: false,
  });
  assertEquals(compatibility, {
    deliveryIds: [DELIVERY_ID],
    compatibilityFieldUsed: true,
  });
});

Deno.test("notification read parser rejects invalid bodies, identity, and unbounded ID sets", async () => {
  const tooMany = Array.from(
    { length: MAX_PLAYER_NOTIFICATION_READ_IDS + 1 },
    (_value, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const requests = [
    readRequest({}),
    readRequest({ deliveryIds: [] }),
    readRequest({ deliveryIds: ["not-a-uuid"] }),
    readRequest({ deliveryIds: [DELIVERY_ID], notificationIds: [DELIVERY_ID] }),
    readRequest({ deliveryIds: [DELIVERY_ID], playerId: "player-1" }),
    readRequest({ deliveryIds: [DELIVERY_ID], extra: true }),
    readRequest({ deliveryIds: tooMany }),
    readRequest({ deliveryIds: [DELIVERY_ID] }, "status=unread"),
  ];

  for (const request of requests) {
    await assertRejectsCode(
      () => parsePlayerNotificationReadRequest(request),
      ["invalid_player_notification_request", "invalid_player_request"],
    );
  }
});

Deno.test("notification read parser stops oversized request bodies", async () => {
  const oversized = new Request(
    "https://example.test/players/me/notifications/read",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deliveryIds: [DELIVERY_ID],
        padding: "x".repeat(MAX_PLAYER_NOTIFICATION_READ_BODY_BYTES),
      }),
    },
  );

  await assertRejectsCode(
    () => parsePlayerNotificationReadRequest(oversized),
    ["invalid_player_notification_request"],
  );
});

function listRequest(query = ""): Request {
  return new Request(
    `https://example.test/players/me/notifications${query ? `?${query}` : ""}`,
  );
}

function readRequest(body: unknown, query = ""): Request {
  return new Request(
    `https://example.test/players/me/notifications/read${
      query ? `?${query}` : ""
    }`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function assertThrowsCode(run: () => unknown, expectedCode: string): void {
  let error: unknown;

  try {
    run();
  } catch (caught) {
    error = caught;
  }

  assertEquals(
    (error as { readonly code?: string } | undefined)?.code,
    expectedCode,
  );
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  expectedCodes: readonly string[],
): Promise<void> {
  let error: unknown;

  try {
    await run();
  } catch (caught) {
    error = caught;
  }

  const code = (error as { readonly code?: string } | undefined)?.code;
  assertEquals(expectedCodes.includes(code ?? ""), true);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
