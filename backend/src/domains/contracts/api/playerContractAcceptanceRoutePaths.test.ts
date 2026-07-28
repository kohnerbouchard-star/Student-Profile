import { readPlayerContractAcceptanceRoutePath } from "./playerContractAcceptanceRoutePaths.ts";
import { readPlayerContractPublicSubmitRoutePath } from "./playerContractPublicSubmitRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void): void };

Deno.test("contract public routes accept direct and exact Edge paths", () => {
  for (
    const prefix of [
      "",
      "/classroom-api",
      "/functions/v1/classroom-api",
      "/player-api",
      "/functions/v1/player-api",
    ]
  ) {
    assertEquals(
      readPlayerContractAcceptanceRoutePath(
        `${prefix}/players/me/contracts/arrival-orientation/accept`,
      ),
      { kind: "accept", contractKey: "arrival-orientation" },
    );
    assertEquals(
      readPlayerContractPublicSubmitRoutePath(
        `${prefix}/players/me/contracts/arrival-orientation/submit`,
      ),
      { kind: "submit", contractKey: "arrival-orientation" },
    );
  }
});

Deno.test("contract public route parsers defer recognized sibling operations", () => {
  for (
    const prefix of [
      "",
      "/classroom-api",
      "/functions/v1/classroom-api",
      "/player-api",
      "/functions/v1/player-api",
    ]
  ) {
    assertEquals(
      readPlayerContractAcceptanceRoutePath(
        `${prefix}/players/me/contracts/arrival-orientation/submit`,
      ),
      null,
    );
    assertEquals(
      readPlayerContractPublicSubmitRoutePath(
        `${prefix}/players/me/contracts/arrival-orientation/accept`,
      ),
      null,
    );
    assertEquals(
      readPlayerContractAcceptanceRoutePath(
        `${prefix}/players/me/contracts/arrival-orientation/archive`,
      ),
      { kind: "malformed" },
    );
    assertEquals(
      readPlayerContractPublicSubmitRoutePath(
        `${prefix}/players/me/contracts/arrival-orientation/archive`,
      ),
      { kind: "malformed" },
    );
  }
});

Deno.test("contract public routes reject malformed and spoofed prefixes", () => {
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      "/players/me/contracts/not%2Fa%2Fkey/accept",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      "/players/me/contracts/not%2Fa%2Fkey/submit",
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
    readPlayerContractPublicSubmitRoutePath(
      "/spoof/functions/v1/classroom-api/players/me/contracts/key/submit",
    ),
    null,
  );
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      "/players/me/contracts/key/accept/extra",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      "/players/me/contracts/key/submit/extra",
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
