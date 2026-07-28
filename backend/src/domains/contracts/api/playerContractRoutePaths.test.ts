import { readPlayerContractRoutePath } from "./playerContractRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("legacy UUID Player Contract submit route is retired", () => {
  assertEquals(
    readPlayerContractRoutePath(
      "/functions/v1/classroom-api/players/me/contracts/00000000-0000-4000-8000-000000000001/submit",
    ),
    null,
  );
});

Deno.test("current public Contract routes remain owned by dedicated parsers", () => {
  assertEquals(
    readPlayerContractRoutePath(
      "/functions/v1/classroom-api/players/me/contracts/contract.core.valerion.v1/accept",
    ),
    null,
  );
  assertEquals(
    readPlayerContractRoutePath(
      "/functions/v1/classroom-api/players/me/contracts/contract.core.valerion.v1/submissions",
    ),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
