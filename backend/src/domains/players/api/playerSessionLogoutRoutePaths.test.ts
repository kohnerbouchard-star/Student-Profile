import { readPlayerSessionLogoutRoutePath } from "./playerSessionLogoutRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("player logout route accepts exact direct and classroom-api paths", () => {
  assertEquals(
    readPlayerSessionLogoutRoutePath("/players/me/session/logout"),
    { kind: "logout" },
  );
  assertEquals(
    readPlayerSessionLogoutRoutePath(
      "/functions/v1/classroom-api/players/me/session/logout",
    ),
    { kind: "logout" },
  );
});

Deno.test("player logout route rejects malformed and unrelated paths", () => {
  assertEquals(
    readPlayerSessionLogoutRoutePath("/players/me/session/logout/extra"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerSessionLogoutRoutePath("/players/me/session"),
    { kind: "malformed" },
  );
  assertEquals(readPlayerSessionLogoutRoutePath("/players/me"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
