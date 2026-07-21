import { readPlayerMessagingRoutePath } from "./playerMessagingRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const THREAD = `thr_${"a".repeat(32)}`;

Deno.test("player messaging routes accept exact inbox, thread, search, send, and read paths", () => {
  assertEquals(readPlayerMessagingRoutePath("/players/me/messages"), { kind: "list" });
  assertEquals(readPlayerMessagingRoutePath("/players/me/messages/search"), { kind: "search" });
  assertEquals(readPlayerMessagingRoutePath("/players/me/messages/read"), {
    kind: "markRead",
    threadId: null,
  });
  assertEquals(
    readPlayerMessagingRoutePath(`/players/me/messages/threads/${THREAD}`),
    { kind: "thread", threadId: THREAD },
  );
  assertEquals(
    readPlayerMessagingRoutePath(
      `/functions/v1/classroom-api/players/me/messages/threads/${THREAD}/messages`,
    ),
    { kind: "send", threadId: THREAD },
  );
  assertEquals(
    readPlayerMessagingRoutePath(`/players/me/messages/threads/${THREAD}/read`),
    { kind: "markRead", threadId: THREAD },
  );
});

Deno.test("player messaging routes fail closed for malformed or spoofed paths", () => {
  assertEquals(
    readPlayerMessagingRoutePath("/players/me/messages/threads/not-public/messages"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerMessagingRoutePath(`/players/me/messages/threads/${THREAD}/extra`),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerMessagingRoutePath(
      `/functions/v1/not-classroom-api/players/me/messages/threads/${THREAD}/messages`,
    ),
    null,
  );
  assertEquals(readPlayerMessagingRoutePath("/players/me/notifications"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
