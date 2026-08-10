import {
  parseStoryEffect,
  STORY_CHARACTER_MESSAGE_PURPOSES,
} from "./storyEffectContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("story effect parser accepts authored character messages", () => {
  const effect = parseStoryEffect({
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
  });

  assertEquals(effect, {
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
    responseWindow: null,
  });
  assertEquals(STORY_CHARACTER_MESSAGE_PURPOSES.includes("crisis"), true);
});

Deno.test("story effect parser defaults message purpose and rejects unsupported purpose", () => {
  const effect = parseStoryEffect({
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    body: "Housing cleared. Keep your residency card somewhere safe.",
  });
  if (effect.type !== "character_message") {
    throw new Error("Expected character_message effect.");
  }
  assertEquals(effect.messagePurpose, "relationship");
  assertEquals(effect.interactionKey, null);
  assertEquals(effect.responseWindow, null);

  assertThrows(() => parseStoryEffect({
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    messagePurpose: "freeform_ai_chat",
    body: "Unsafe unsupported purpose.",
  }));
});

function assertThrows(run: () => unknown): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error("Expected throw.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
