import { readPlayerProgressionRoutePath } from "./playerProgressionRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const REWARD = `rwd_${"a".repeat(32)}`;

Deno.test("Progression routes accept direct and Edge public paths", () => {
  assertEquals(readPlayerProgressionRoutePath("/players/me/progression"), { kind: "read" });
  assertEquals(
    readPlayerProgressionRoutePath("/functions/v1/classroom-api/players/me/progression/skills/skl_market_literacy_v1/unlock"),
    { kind: "unlock", skillId: "skl_market_literacy_v1" },
  );
  assertEquals(
    readPlayerProgressionRoutePath(`/players/me/progression/rewards/${REWARD}/claim`),
    { kind: "claim", rewardId: REWARD },
  );
});

Deno.test("Progression routes reject UUIDs, malformed public IDs, and unrelated paths", () => {
  assertEquals(readPlayerProgressionRoutePath("/players/me/progression/skills/00000000-0000-4000-8000-000000000001/unlock"), { kind: "malformed" });
  assertEquals(readPlayerProgressionRoutePath("/players/me/progression/rewards/rwd_bad/claim"), { kind: "malformed" });
  assertEquals(readPlayerProgressionRoutePath("/players/me/progression/skills/skl_market_literacy_v1/delete"), { kind: "malformed" });
  assertEquals(readPlayerProgressionRoutePath("/players/me/contracts"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
}
