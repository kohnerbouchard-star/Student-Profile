import { readPlayerNotificationRoutePath } from "./playerNotificationRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("player notification routes accept exact list and read paths", () => {
  assertEquals(
    readPlayerNotificationRoutePath("/players/me/notifications"),
    { kind: "list" },
  );
  assertEquals(
    readPlayerNotificationRoutePath(
      "/functions/v1/classroom-api/players/me/notifications/read",
    ),
    { kind: "markRead" },
  );
});

Deno.test("player notification routes fail closed for item and spoofed paths", () => {
  assertEquals(
    readPlayerNotificationRoutePath("/players/me/notifications/extra"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerNotificationRoutePath(
      "/functions/v1/not-classroom-api/players/me/notifications",
    ),
    null,
  );
  assertEquals(readPlayerNotificationRoutePath("/players/me/inventory"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
