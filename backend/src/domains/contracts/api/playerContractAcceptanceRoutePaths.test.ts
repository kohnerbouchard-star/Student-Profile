import { readPlayerContractAcceptanceRoutePath } from "./playerContractAcceptanceRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void): void };

Deno.test("contract acceptance route accepts direct and classroom-api paths", () => {
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      "/players/me/contracts/arrival-orientation/accept",
    ),
    { kind: "accept", contractKey: "arrival-orientation" },
  );
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      "/functions/v1/classroom-api/players/me/contracts/arrival-orientation/accept",
    ),
    { kind: "accept", contractKey: "arrival-orientation" },
  );
});

Deno.test("contract acceptance route rejects malformed and spoofed prefixes", () => {
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      "/players/me/contracts/not%2Fa%2Fkey/accept",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      "/spoof/functions/v1/classroom-api/players/me/contracts/key/accept",
    ),
    null,
  );
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      "/players/me/contracts/key/accept/extra",
    ),
    { kind: "malformed" },
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
