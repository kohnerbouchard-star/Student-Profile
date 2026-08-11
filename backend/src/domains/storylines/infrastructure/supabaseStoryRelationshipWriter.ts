import type {
  StoryEffectRelationshipWriter,
  StoryRelationshipAdjustmentWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

interface RpcError { readonly message: string; readonly code?: string; }
interface RpcResponse<T> { readonly data: T | null; readonly error: RpcError | null; }
interface Client { rpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResponse<T>>; }
interface AdjustmentRow { readonly relationship_id?: unknown; }

export class SupabaseStoryRelationshipWriter implements StoryEffectRelationshipWriter {
  constructor(private readonly client: Client) {}

  async adjustRelationship(input: StoryRelationshipAdjustmentWriteInput): Promise<StoryWriteResult> {
    const response = await this.client.rpc<readonly AdjustmentRow[]>("adjust_story_relationship_v1", {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_source_storyline_event_id: input.storylineEventId,
      p_effect_index: input.effectIndex,
      p_character_key: input.characterKey,
      p_reason: input.reason,
      p_deltas: input.deltas,
    });
    if (response.error) throw new Error(response.error.message);
    const id = typeof response.data?.[0]?.relationship_id === "string"
      ? response.data[0].relationship_id
      : undefined;
    return id ? { id } : {};
  }
}
