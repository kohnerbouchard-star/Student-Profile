import { parseStoryCondition } from "./storyConditionContracts.ts";
import { parseStoryEffect } from "./storyEffectContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("relationship effects and conditions parse deterministically", () => {
  const effect = parseStoryEffect({
    type: "relationship_adjust",
    characterKey: "character.northreach.jonis-hale.v1",
    reason: "Player documented the safety shortcut before escalating.",
    deltas: { trust: 12, respect: 8, suspicion: -4 },
  });
  if (effect.type !== "relationship_adjust") throw new Error("wrong effect type");
  assertEquals(effect.deltas, { trust: 12, respect: 8, suspicion: -4 });
  const condition = parseStoryCondition({
    type: "player_relationship_standing_is",
    characterKey: "character.northreach.jonis-hale.v1",
    standing: "trusted",
  });
  assertEquals(condition, {
    type: "player_relationship_standing_is",
    characterKey: "character.northreach.jonis-hale.v1",
    standing: "trusted",
  });
});
function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
