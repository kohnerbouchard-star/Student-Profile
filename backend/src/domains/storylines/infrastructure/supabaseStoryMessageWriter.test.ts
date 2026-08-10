import { SupabaseStoryMessageWriter } from "./supabaseStoryMessageWriter.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const EVENT = "00000000-0000-4000-8000-000000000003";
const THREAD = `thr_${"a".repeat(32)}`;
const MESSAGE = `msg_${"b".repeat(32)}`;
const NOW = "2026-08-10T06:30:00.000Z";

Deno.test("Supabase story message writer preserves exact public identity across apply and replay", async () => {
  for (const outcome of ["applied", "replayed"] as const) {
    const calls: Array<{ name: string; args: unknown }> = [];
    const writer = new SupabaseStoryMessageWriter({
      rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return Promise.resolve({
          data: [{
            delivery_outcome: outcome,
            thread_id: THREAD,
            message_id: MESSAGE,
            character_key: "character.northreach.jonis-hale.v1",
            character_name: "Jonis Hale",
            created_at: NOW,
          }],
          error: null,
        });
      },
    } as never);
    assertEquals(await writer.deliverCharacterMessage(input()), { id: MESSAGE });
    assertEquals(calls[0].name, "deliver_story_character_message_v1");
    assertEquals((calls[0].args as any).p_effect_index, 4);
  }
});

Deno.test("Supabase story message writer rejects invalid projections and RPC errors", async () => {
  const invalid = new SupabaseStoryMessageWriter({
    rpc: () => Promise.resolve({
      data: [{
        delivery_outcome: "applied",
        thread_id: GAME,
        message_id: MESSAGE,
        character_key: "character.northreach.jonis-hale.v1",
        character_name: "Jonis Hale",
        created_at: NOW,
      }],
      error: null,
    }),
  } as never);
  await assertRejects(() => invalid.deliverCharacterMessage(input()));

  const suppressed = new SupabaseStoryMessageWriter({
    rpc: () => Promise.resolve({
      data: null,
      error: { message: "STORY_CHARACTER_MESSAGE_THREAD_LOCKED" },
    }),
  } as never);
  assertEquals(await suppressed.deliverCharacterMessage(input()), {});

  const failed = new SupabaseStoryMessageWriter({
    rpc: () => Promise.resolve({
      data: null,
      error: { message: "STORY_CHARACTER_MESSAGE_EVENT_NOT_ACTIVE" },
    }),
  } as never);
  await assertRejects(
    () => failed.deliverCharacterMessage(input()),
    "STORY_CHARACTER_MESSAGE_EVENT_NOT_ACTIVE",
  );
});

function input() {
  return {
    gameSessionId: GAME,
    playerId: PLAYER,
    storylineEventId: EVENT,
    effectIndex: 4,
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning" as const,
    body: "They are asking us to skip a second inspection cycle.",
  };
}

async function assertRejects(run: () => Promise<unknown>, message?: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (message && !String((error as Error).message).includes(message)) {
      throw new Error(`Unexpected error: ${(error as Error).message}`);
    }
    return;
  }
  throw new Error("Expected rejection.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
