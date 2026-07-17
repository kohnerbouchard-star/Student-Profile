import { readPlayerTerminalPhaseOneRoutePath } from "./playerTerminalPhaseOneRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player terminal phase one routes parse direct and Edge Function paths", () => {
  assertEquals(
    readPlayerTerminalPhaseOneRoutePath("/players/me/inventory"),
    { kind: "inventory" },
  );
  assertEquals(
    readPlayerTerminalPhaseOneRoutePath(
      "/functions/v1/classroom-api/players/me/inventory",
    ),
    { kind: "inventory" },
  );
  assertEquals(
    readPlayerTerminalPhaseOneRoutePath(
      "/functions/v1/classroom-api/players/me/session/logout",
    ),
    { kind: "logout" },
  );
});

Deno.test("player terminal phase one routes reject suffix spoofing and extra segments", () => {
  assertEquals(
    readPlayerTerminalPhaseOneRoutePath(
      "/not-classroom-api/players/me/inventory",
    ),
    null,
  );
  assertEquals(
    readPlayerTerminalPhaseOneRoutePath("/players/me/inventory/other"),
    null,
  );
  assertEquals(
    readPlayerTerminalPhaseOneRoutePath("/players/other/inventory"),
    null,
  );
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
