import { SupabaseStoryRelationshipWriter } from "./supabaseStoryRelationshipWriter.ts";
declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
Deno.test("relationship writer uses server-owned atomic RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const writer = new SupabaseStoryRelationshipWriter({
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: [{ relationship_id: "rel_public_jonis" }], error: null });
    },
  } as never);
  const result = await writer.adjustRelationship({
    gameSessionId: "game-1", playerId: "player-1", storylineEventId: "event-1", effectIndex: 2,
    characterKey: "character.northreach.jonis-hale.v1", reason: "Documented the shortcut.",
    deltas: { trust: 12, respect: 8 },
  });
  if (result.id !== "rel_public_jonis") throw new Error("relationship writer id mismatch");
  if (calls[0]?.name !== "adjust_story_relationship_v1") throw new Error("wrong RPC");
});
