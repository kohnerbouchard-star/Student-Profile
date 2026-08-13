import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type {
  StoryEffectMarketNewsWriter,
  StoryMarketNewsWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import {
  parseStockMarketNewsCreateRequest,
  type StockMarketNewsRepository,
} from "../../stocks/contracts/stockMarketNewsContracts.ts";

export class StockMarketStoryNewsWriter implements StoryEffectMarketNewsWriter {
  constructor(private readonly repository: StockMarketNewsRepository) {}

  async createMarketNews(
    input: StoryMarketNewsWriteInput,
  ): Promise<StoryWriteResult> {
    const createInput = parseStockMarketNewsCreateRequest({
      ...input.payload,
      gameSessionId: input.gameSessionId,
      source: "system",
      metadata: {
        ...readMetadata(input.payload),
        sourceType: "story_event",
        sourceStorylineEventId: input.storylineEventId,
        storyShockKey: input.shockKey,
      },
    });
    const frozenPayloadTick = readFrozenCreatedTick(input.payload);
    const createdTick = input.createdTick ?? frozenPayloadTick ??
      (await this.repository.readCurrentTick(input.gameSessionId)) + 1;
    if (!Number.isSafeInteger(createdTick) || createdTick < 0) {
      throw new Error("Story market news createdTick is invalid.");
    }
    const result = await this.repository.create({
      ...createInput,
      shockId: input.idempotencyKey,
      createdTick,
    });

    return { id: result.news.id };
  }
}

function readFrozenCreatedTick(payload: JsonObject): number | null {
  const value = payload.createdTick;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function readMetadata(payload: JsonObject): Record<string, unknown> {
  const metadata = payload.metadata;

  return isRecord(metadata) ? metadata : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
