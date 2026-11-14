import { SupabaseStorylineRepository } from "./supabaseStorylineRepository.ts";

export type Row = Record<string, unknown>;
export type Response = {
  data: unknown;
  error: { message: string; code?: string } | null;
};
export const ok = (data: unknown): Response => ({ data, error: null });
export const bad = (message = "query failed", code?: string): Response => ({
  data: null,
  error: { message, code },
});
export function equal(actual: unknown, expected: unknown): void {
  if (Object.is(actual, expected)) return;
  if (
    actual === null || expected === null ||
    typeof actual !== "object" || typeof expected !== "object" ||
    Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)
  ) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
  const actualKeys = Reflect.ownKeys(actual);
  const expectedKeys = Reflect.ownKeys(expected);
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(actual, key))
  ) {
    throw new Error("Expected identical own keys");
  }
  for (const key of expectedKeys) {
    equal(Reflect.get(actual, key), Reflect.get(expected, key));
  }
}
export function same(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error("Expected reference identity");
}
export async function failure(
  work: () => Promise<unknown>,
  table: string,
  operation = "select",
  code = "storyline_repository_query_failed",
  message = "query failed",
): Promise<void> {
  try {
    await work();
  } catch (error) {
    const e = error as Error & {
      code: string;
      tableName: string;
      operation: string;
    };
    equal([e.name, e.code, e.tableName, e.operation, e.message], [
      "StorylineRepositoryError",
      code,
      table,
      operation,
      message,
    ]);
    return;
  }
  throw new Error("Expected repository failure");
}
export class ScriptedClient {
  readonly calls: unknown[][] = [];
  constructor(readonly responses: Array<Response | Promise<Response>>) {}
  from(table: string) {
    this.calls.push(["from", table]);
    const record = (method: string, ...args: unknown[]) => {
      this.calls.push([method, ...args]);
      return builder;
    };
    const read = () => {
      this.calls.push(["await"]);
      if (!this.responses.length) throw new Error("Unexpected query admission");
      return Promise.resolve(this.responses.shift()!);
    };
    const builder = {
      select: (columns: string) => record("select", columns),
      eq: (column: string, value: unknown) => record("eq", column, value),
      in: (column: string, values: readonly unknown[]) =>
        record("in", column, values),
      order: (column: string, options: unknown) =>
        record("order", column, options),
      insert: (row: unknown) => record("insert", row),
      upsert: (row: unknown, options: unknown) =>
        record("upsert", row, options),
      maybeSingle: () => {
        record("maybeSingle");
        return read();
      },
      then: (
        resolve: (value: Response) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => read().then(resolve, reject),
    };
    return builder;
  }
}
export function setup(...responses: Array<Response | Promise<Response>>) {
  const client = new ScriptedClient(responses);
  return {
    client,
    repository: new SupabaseStorylineRepository(client as never),
  };
}
export const NOW = "2026-01-01T00:01:40.999Z";
export const input = { gameSessionId: "game", now: NOW, currentMarketTick: 5 };
export const activation = (changes: Row = {}): Row => ({
  id: "activation",
  game_session_id: "game",
  storyline_id: "story",
  status: "active",
  story_started_at: "2026-01-01T00:00:00Z",
  accumulated_pause_seconds: "10",
  time_scale: "2",
  created_at: "created",
  ...changes,
});
export const event = (id: string, changes: Row = {}): Row => ({
  id,
  storyline_id: "story",
  event_key: `key-${id}`,
  title: "title",
  description: "description",
  act: "2",
  sequence: "3",
  trigger_type: "condition",
  trigger_condition: {},
  reveal_payload: {},
  public_news_payload: {},
  player_rules: [],
  policy_payloads: [],
  flag_payloads: [],
  contract_unlock_payloads: [],
  priority: "unrecognized",
  is_active: true,
  created_at: "created",
  ...changes,
});
export const resolution = (changes: Row = {}): Row => ({
  id: "resolution",
  game_session_id: "game",
  storyline_event_id: "event",
  resolved_at: NOW,
  resolved_market_tick: "5",
  status: "unrecognized",
  result_payload: {},
  created_at: "created",
  ...changes,
});
export const ACTIVATION_SELECT =
  "id,game_session_id,storyline_id,status,story_started_at,paused_at,accumulated_pause_seconds,time_scale,created_at";
export const EVENT_SELECT =
  "id,storyline_id,event_key,title,description,act,sequence,trigger_type,scheduled_offset_seconds,scheduled_at,scheduled_market_tick,trigger_condition,reveal_payload,public_news_payload,player_rules,policy_payloads,flag_payloads,contract_unlock_payloads,priority,is_active,created_at";
export const RESOLUTION_SELECT =
  "id,game_session_id,storyline_event_id,resolved_at,resolved_market_tick,status,result_payload,created_at";
export const activationCalls = [
  ["from", "game_session_storylines"],
  ["select", ACTIVATION_SELECT],
  ["eq", "game_session_id", "game"],
  ["eq", "status", "active"],
  ["order", "created_at", { ascending: true }],
  ["await"],
];
export const eventCalls = [
  ["from", "storyline_events"],
  ["select", EVENT_SELECT],
  ["in", "storyline_id", ["story"]],
  ["order", "act", { ascending: true }],
  ["order", "sequence", { ascending: true }],
  ["await"],
];
export const overrideCalls = [
  ["from", "game_session_story_event_overrides"],
  ["select", "storyline_event_id,enabled"],
  ["eq", "game_session_id", "game"],
  ["eq", "enabled", true],
  ["await"],
];
export const resolutionCalls = [
  ["from", "story_event_resolutions"],
  ["select", "storyline_event_id"],
  ["eq", "game_session_id", "game"],
  ["await"],
];
