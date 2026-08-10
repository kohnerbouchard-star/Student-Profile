import type {
  StoryCharacterMessageWriteInput,
  StoryEffectMessageWriter,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

interface StoryMessageRpcClient {
  rpc<Data = unknown>(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    readonly data: Data | null;
    readonly error: { readonly message: string } | null;
  }>;
}

interface DeliveryRow {
  readonly delivery_outcome?: unknown;
  readonly thread_id?: unknown;
  readonly message_id?: unknown;
  readonly character_key?: unknown;
  readonly character_name?: unknown;
  readonly created_at?: unknown;
}

const THREAD_ID = /^thr_[0-9a-f]{32}$/;
const MESSAGE_ID = /^msg_[0-9a-f]{32}$/;

export class SupabaseStoryMessageWriter implements StoryEffectMessageWriter {
  constructor(private readonly client: StoryMessageRpcClient) {}

  async deliverCharacterMessage(
    input: StoryCharacterMessageWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client.rpc<readonly DeliveryRow[]>(
      "deliver_story_character_message_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
        p_storyline_event_id: input.storylineEventId,
        p_effect_index: input.effectIndex,
        p_character_key: input.characterKey,
        p_character_name: input.characterName,
        p_interaction_key: input.interactionKey,
        p_message_purpose: input.messagePurpose,
        p_body: input.body,
      },
    );

    if (response.error) {
      if (response.error.message.toUpperCase().includes("STORY_CHARACTER_MESSAGE_THREAD_LOCKED")) {
        return {};
      }
      throw new Error(response.error.message);
    }

    const row = response.data?.[0];
    const outcome = readEnum(row?.delivery_outcome, ["applied", "replayed"]);
    const threadId = readId(row?.thread_id, THREAD_ID);
    const messageId = readId(row?.message_id, MESSAGE_ID);
    const characterKey = readText(row?.character_key, 160);
    const characterName = readText(row?.character_name, 160);
    const createdAt = readTimestamp(row?.created_at);

    if (
      characterKey !== input.characterKey ||
      characterName !== input.characterName ||
      !createdAt ||
      !threadId ||
      !messageId ||
      !outcome
    ) {
      throw new Error("story_character_message_invalid_response");
    }

    return { id: messageId };
  }
}

function readText(value: unknown, maximum: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw new Error("story_character_message_invalid_response");
  return text;
}

function readId(value: unknown, pattern: RegExp): string {
  const text = readText(value, 128).toLowerCase();
  if (!pattern.test(text)) throw new Error("story_character_message_invalid_response");
  return text;
}

function readEnum<const T extends string>(value: unknown, values: readonly T[]): T {
  const text = readText(value, 32) as T;
  if (!values.includes(text)) throw new Error("story_character_message_invalid_response");
  return text;
}

function readTimestamp(value: unknown): string {
  const text = readText(value, 64);
  if (!Number.isFinite(Date.parse(text))) throw new Error("story_character_message_invalid_response");
  return new Date(text).toISOString();
}
