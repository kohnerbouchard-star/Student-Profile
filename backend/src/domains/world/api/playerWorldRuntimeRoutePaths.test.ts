import {
  parsePlayerWorldRuntimeRoute,
  playerWorldRuntimeAllowedMethods,
} from "./playerWorldRuntimeRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Player world runtime routes expose only reviewed public paths", () => {
  assertEquals(parsePlayerWorldRuntimeRoute("/players/me/world-runtime"), {
    operation: "context",
    journeyId: null,
  });
  assertEquals(parsePlayerWorldRuntimeRoute("/players/me/arrival-class/"), {
    operation: "arrivalClass",
    journeyId: null,
  });
  assertEquals(parsePlayerWorldRuntimeRoute("/players/me/travel/quotes"), {
    operation: "travelQuote",
    journeyId: null,
  });
  assertEquals(parsePlayerWorldRuntimeRoute("/players/me/travel"), {
    operation: "travelExecute",
    journeyId: null,
  });
  assertEquals(parsePlayerWorldRuntimeRoute("/players/me/residency"), {
    operation: "residencyRequest",
    journeyId: null,
  });
  const journeyId = `trj_${"a".repeat(32)}`;
  assertEquals(parsePlayerWorldRuntimeRoute(`/players/me/travel/${journeyId}/complete`), {
    operation: "travelComplete",
    journeyId,
  });
  assertEquals(parsePlayerWorldRuntimeRoute("/games/internal-id/world-runtime"), null);
  assertEquals(parsePlayerWorldRuntimeRoute("/players/uuid/world-runtime"), null);
  assertEquals(parsePlayerWorldRuntimeRoute("/players/me/travel/not-public/complete"), null);
});

Deno.test("route methods are bounded and operation-owned", () => {
  assertEquals(playerWorldRuntimeAllowedMethods("context"), ["GET"]);
  for (const operation of [
    "arrivalClass",
    "travelQuote",
    "travelExecute",
    "travelComplete",
    "residencyRequest",
  ] as const) {
    assertEquals(playerWorldRuntimeAllowedMethods(operation), ["POST"]);
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
