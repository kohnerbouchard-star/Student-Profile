import {
  encodePlayerNotificationCursor,
  parsePlayerNotificationCursor,
  parsePlayerNotificationListRequest,
  parsePlayerNotificationReadRequest,
} from "./playerNotificationRequestParser.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const DELIVERY_A = "ndl_00000000000000000000000000000001";
const DELIVERY_B = "ndl_00000000000000000000000000000002";

Deno.test("notification list parser applies bounded defaults and cursor round trips", () => {
  const cursor = encodePlayerNotificationCursor({
    deliveredAt: "2026-07-18T08:00:00.000Z",
    publicDeliveryId: DELIVERY_A,
  });
  assertEquals(parsePlayerNotificationCursor(cursor), {
    deliveredAt: "2026-07-18T08:00:00.000Z",
    publicDeliveryId: DELIVERY_A,
  });
  assertEquals(
    parsePlayerNotificationListRequest(
      new Request(`https://example.test/players/me/notifications?status=all&limit=50&cursor=${cursor}`),
      { kind: "list" },
    ),
    {
      status: "all",
      limit: 50,
      cursor: {
        deliveredAt: "2026-07-18T08:00:00.000Z",
        publicDeliveryId: DELIVERY_A,
      },
    },
  );
});

Deno.test("notification list parser rejects unsupported fields and browser game scope", () => {
  assertThrows(() =>
    parsePlayerNotificationListRequest(
      new Request("https://example.test/players/me/notifications?gameSessionId=x"),
      { kind: "list" },
    )
  );
  assertThrows(() =>
    parsePlayerNotificationListRequest(
      new Request("https://example.test/players/me/notifications", {
        headers: { "x-econovaria-game-id": "x" },
      }),
      { kind: "list" },
    )
  );
  assertThrows(() =>
    parsePlayerNotificationListRequest(
      new Request("https://example.test/players/me/notifications?limit=51"),
      { kind: "list" },
    )
  );
});

Deno.test("notification read parser accepts unique public delivery IDs only", async () => {
  assertEquals(
    await parsePlayerNotificationReadRequest(
      jsonRequest({ deliveryIds: [DELIVERY_A, DELIVERY_B] }),
      { kind: "markRead" },
    ),
    { publicDeliveryIds: [DELIVERY_A, DELIVERY_B] },
  );

  for (const body of [
    { deliveryIds: [] },
    { deliveryIds: [DELIVERY_A, DELIVERY_A] },
    { deliveryIds: ["00000000-0000-4000-8000-000000000001"] },
    { notificationIds: [DELIVERY_A] },
    { deliveryIds: [DELIVERY_A], playerUuid: "x" },
  ]) {
    await assertRejects(() =>
      parsePlayerNotificationReadRequest(
        jsonRequest(body),
        { kind: "markRead" },
      )
    );
  }
});

function jsonRequest(body: unknown): Request {
  return new Request("https://example.test/players/me/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertThrows(run: () => unknown): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error("Expected function to throw.");
}

async function assertRejects(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error("Expected promise to reject.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
