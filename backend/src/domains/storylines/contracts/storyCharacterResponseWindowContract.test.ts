import { parseStoryEffect } from "./storyEffectContracts.ts";
declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
Deno.test("character_message accepts a bounded structured response window", () => {
  const effect = parseStoryEffect({
    type: "character_message", characterKey: "jonis_hale", characterName: "Jonis Hale",
    interactionKey: "jonis.arrival.offer", body: "Choose.",
    responseWindow: { prompt: "How do you respond?", durationSeconds: 3600, defaultChoiceKey: "decline",
      options: [{ choiceKey: "accept", label: "Accept." }, { choiceKey: "decline", label: "Decline.", description: "Not yet." }] },
  });
  if (effect.type !== "character_message" || !effect.responseWindow) throw new Error("expected response window");
  assertEquals(effect.responseWindow.options.length, 2);
  assertEquals(effect.responseWindow.defaultChoiceKey, "decline");
});
Deno.test("character_message rejects response windows without an interaction key", () => {
  let failed = false;
  try { parseStoryEffect({ type: "character_message", characterKey: "jonis_hale", characterName: "Jonis Hale", body: "Choose.",
    responseWindow: { prompt: "Choose.", options: [{ choiceKey: "a", label: "A" }, { choiceKey: "b", label: "B" }] } }); } catch { failed = true; }
  assertEquals(failed, true);
});
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
}
