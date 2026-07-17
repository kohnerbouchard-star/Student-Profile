import { readPlayerNotificationRoutePath } from "./playerNotificationRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player notification routes parse direct and Edge Function paths", () => {
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

Deno.test("player notification routes reject spoofed and extra segments", () => {
  for (
    const path of [
      "/not-classroom-api/players/me/notifications",
      "/players/me/notifications/read/extra",
      "/players/other/notifications",
    ]
  ) {
    assertEquals(readPlayerNotificationRoutePath(path), null);
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
