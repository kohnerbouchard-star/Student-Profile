import { readPlayerContractPublicListRoutePath } from "./playerContractPublicListRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Player Contract public list accepts direct and hosted classroom paths", () => {
  for (const pathname of [
    "/players/me/contracts",
    "/classroom-api/players/me/contracts",
    "/functions/v1/classroom-api/players/me/contracts",
  ]) {
    assertEquals(readPlayerContractPublicListRoutePath(pathname), {
      kind: "contracts",
    });
  }
});

Deno.test("Player Contract public list rejects spoofed and trailing paths", () => {
  for (const pathname of [
    "/spoof/players/me/contracts",
    "/classroom-api/spoof/players/me/contracts",
    "/players/me/contracts/extra",
    "/classroom-api/players/me/contracts/extra",
  ]) {
    assertEquals(readPlayerContractPublicListRoutePath(pathname), null);
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}.`);
  }
}
