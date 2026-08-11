from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one anchor, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))


def insert_before(path, marker, addition):
    text = read(path)
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f'{path}: expected one marker, found {count}: {marker[:100]!r}')
    write(path, text.replace(marker, addition + marker, 1))

# New relationship contracts.
write('backend/src/domains/storylines/contracts/storyRelationshipContracts.ts', '''export const STORY_RELATIONSHIP_METRICS = [
  "trust",
  "respect",
  "affinity",
  "obligation",
  "suspicion",
] as const;

export const STORY_RELATIONSHIP_STANDINGS = [
  "hostile",
  "strained",
  "neutral",
  "trusted",
  "allied",
] as const;

export type StoryRelationshipMetric = typeof STORY_RELATIONSHIP_METRICS[number];
export type StoryRelationshipStanding = typeof STORY_RELATIONSHIP_STANDINGS[number];

export interface StoryRelationshipState {
  readonly characterKey: string;
  readonly trust: number;
  readonly respect: number;
  readonly affinity: number;
  readonly obligation: number;
  readonly suspicion: number;
  readonly standing: StoryRelationshipStanding;
}

export type PlayerStoryRelationships = Readonly<Record<string, StoryRelationshipState>>;

export function relationshipStandingForScore(score: number): StoryRelationshipStanding {
  if (score <= -50) return "hostile";
  if (score <= -15) return "strained";
  if (score < 35) return "neutral";
  if (score < 70) return "trusted";
  return "allied";
}

export function relationshipStandingScore(state: StoryRelationshipState): number {
  return Math.round(
    state.trust * 0.35 +
    state.respect * 0.25 +
    state.affinity * 0.2 +
    state.obligation * 0.1 -
    state.suspicion * 0.35
  );
}
''')

path='backend/src/domains/storylines/contracts/playerStoryContext.ts'
replace_once(path,
'''import type { JsonValue } from "../../../supabase/tableTypes.ts";\n''',
'''import type { JsonValue } from "../../../supabase/tableTypes.ts";\nimport type { PlayerStoryRelationships } from "./storyRelationshipContracts.ts";\n''')
replace_once(path,
'''  readonly completedContractKeys: readonly string[];\n  readonly storyFlags: Readonly<Record<string, JsonValue>>;\n''',
'''  readonly completedContractKeys: readonly string[];\n  readonly storyFlags: Readonly<Record<string, JsonValue>>;\n  readonly relationships: PlayerStoryRelationships;\n''')

path='backend/src/domains/storylines/contracts/storyConditionContracts.ts'
replace_once(path,
'''import { invalidStorylineContract } from "./storylineContractErrors.ts";\n''',
'''import { invalidStorylineContract } from "./storylineContractErrors.ts";\nimport {\n  STORY_RELATIONSHIP_METRICS,\n  STORY_RELATIONSHIP_STANDINGS,\n  type StoryRelationshipMetric,\n  type StoryRelationshipStanding,\n} from "./storyRelationshipContracts.ts";\n''')
replace_once(path,
'''  "story_flag_equals",\n] as const;\n''',
'''  "story_flag_equals",\n  "player_relationship_metric_at_least",\n  "player_relationship_metric_at_most",\n  "player_relationship_standing_is",\n] as const;\n''')
replace_once(path,
'''  | StoryCashThresholdCondition\n  | StoryFlagEqualsCondition;\n''',
'''  | StoryCashThresholdCondition\n  | StoryFlagEqualsCondition\n  | StoryRelationshipMetricCondition\n  | StoryRelationshipStandingCondition;\n''')
insert_before(path,
'''export function parseStoryCondition(value: unknown): StoryCondition {\n''',
'''export interface StoryRelationshipMetricCondition {\n  readonly type: "player_relationship_metric_at_least" | "player_relationship_metric_at_most";\n  readonly characterKey: string;\n  readonly metric: StoryRelationshipMetric;\n  readonly value: number;\n}\n\nexport interface StoryRelationshipStandingCondition {\n  readonly type: "player_relationship_standing_is";\n  readonly characterKey: string;\n  readonly standing: StoryRelationshipStanding;\n}\n\n''')
replace_once(path,
'''  if (type === "player_cash_below" || type === "player_cash_above") {\n    return {\n      type,\n      amount: readNonNegativeNumberField(record.amount, "condition.amount"),\n    };\n  }\n\n  return {\n''',
'''  if (type === "player_cash_below" || type === "player_cash_above") {\n    return {\n      type,\n      amount: readNonNegativeNumberField(record.amount, "condition.amount"),\n    };\n  }\n\n  if (type === "player_relationship_metric_at_least" || type === "player_relationship_metric_at_most") {\n    const metric = readRequiredText(record.metric, "condition.metric");\n    if (!STORY_RELATIONSHIP_METRICS.includes(metric as StoryRelationshipMetric)) {\n      throw invalidStorylineContract("condition.metric is invalid.");\n    }\n    const relationValue = record.value;\n    if (typeof relationValue !== "number" || !Number.isFinite(relationValue) || relationValue < -100 || relationValue > 100) {\n      throw invalidStorylineContract("condition.value must be between -100 and 100.");\n    }\n    return {\n      type,\n      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),\n      metric: metric as StoryRelationshipMetric,\n      value: relationValue,\n    };\n  }\n\n  if (type === "player_relationship_standing_is") {\n    const standing = readRequiredText(record.standing, "condition.standing");\n    if (!STORY_RELATIONSHIP_STANDINGS.includes(standing as StoryRelationshipStanding)) {\n      throw invalidStorylineContract("condition.standing is invalid.");\n    }\n    return {\n      type,\n      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),\n      standing: standing as StoryRelationshipStanding,\n    };\n  }\n\n  return {\n''')

path='backend/src/domains/storylines/contracts/storyEffectContracts.ts'
replace_once(path,
'''import { invalidStorylineContract } from "./storylineContractErrors.ts";\n''',
'''import { invalidStorylineContract } from "./storylineContractErrors.ts";\nimport { STORY_RELATIONSHIP_METRICS, type StoryRelationshipMetric } from "./storyRelationshipContracts.ts";\n''')
replace_once(path,
'''  "character_message",\n] as const;\n''',
'''  "character_message",\n  "relationship_adjust",\n] as const;\n''')
replace_once(path,
'''  | StoryFlagSetEffect\n  | StoryCharacterMessageEffect;\n''',
'''  | StoryFlagSetEffect\n  | StoryCharacterMessageEffect\n  | StoryRelationshipAdjustEffect;\n''')
insert_before(path,
'''export interface StoryRevealPayload {\n''',
'''export interface StoryRelationshipAdjustEffect {\n  readonly type: "relationship_adjust";\n  readonly characterKey: string;\n  readonly reason: string;\n  readonly deltas: Readonly<Partial<Record<StoryRelationshipMetric, number>>>;\n}\n\n''')
replace_once(path,
'''  if (type === "character_message") {\n''',
'''  if (type === "relationship_adjust") {\n    const deltasRecord = readRecord(record.deltas, "effect.deltas");\n    const deltas: Partial<Record<StoryRelationshipMetric, number>> = {};\n    for (const [metric, rawValue] of Object.entries(deltasRecord)) {\n      if (!STORY_RELATIONSHIP_METRICS.includes(metric as StoryRelationshipMetric)) {\n        throw invalidStorylineContract("effect.deltas contains an invalid relationship metric.");\n      }\n      if (typeof rawValue !== "number" || !Number.isInteger(rawValue) || rawValue < -100 || rawValue > 100) {\n        throw invalidStorylineContract("effect.deltas values must be integers between -100 and 100.");\n      }\n      if (rawValue !== 0) deltas[metric as StoryRelationshipMetric] = rawValue;\n    }\n    if (Object.keys(deltas).length === 0) {\n      throw invalidStorylineContract("effect.deltas must include at least one non-zero relationship delta.");\n    }\n    return {\n      type,\n      characterKey: readRequiredText(record.characterKey, "effect.characterKey"),\n      reason: readRequiredText(record.reason, "effect.reason"),\n      deltas,\n    };\n  }\n\n  if (type === "character_message") {\n''')

path='backend/src/domains/storylines/contracts/storyEffectExecutionContracts.ts'
replace_once(path,
'''  readonly messages?: StoryEffectMessageWriter;\n}\n''',
'''  readonly messages?: StoryEffectMessageWriter;\n  readonly relationships?: StoryEffectRelationshipWriter;\n}\n''')
insert_before(path,
'''export interface StoryEffectMessageWriter {\n''',
'''export interface StoryEffectRelationshipWriter {\n  adjustRelationship(input: StoryRelationshipAdjustmentWriteInput): Promise<StoryWriteResult>;\n}\n\nexport interface StoryRelationshipAdjustmentWriteInput {\n  readonly gameSessionId: string;\n  readonly playerId: string;\n  readonly storylineEventId: string;\n  readonly effectIndex: number;\n  readonly characterKey: string;\n  readonly reason: string;\n  readonly deltas: Readonly<Record<string, number>>;\n}\n\n''')

path='backend/src/domains/storylines/services/storyConditionEngine.ts'
replace_once(path,
'''    case "story_flag_equals":\n      return readStoryFlag(\n        player.storyFlags,\n        condition.flagKey,\n        condition.value,\n      );\n''',
'''    case "story_flag_equals":\n      return readStoryFlag(\n        player.storyFlags,\n        condition.flagKey,\n        condition.value,\n      );\n    case "player_relationship_metric_at_least": {\n      const relationship = player.relationships[condition.characterKey];\n      return relationship ? relationship[condition.metric] >= condition.value : false;\n    }\n    case "player_relationship_metric_at_most": {\n      const relationship = player.relationships[condition.characterKey];\n      return relationship ? relationship[condition.metric] <= condition.value : false;\n    }\n    case "player_relationship_standing_is":\n      return player.relationships[condition.characterKey]?.standing === condition.standing;\n''')

write('backend/src/domains/storylines/infrastructure/supabaseStoryRelationshipWriter.ts', '''import type {\n  StoryEffectRelationshipWriter,\n  StoryRelationshipAdjustmentWriteInput,\n  StoryWriteResult,\n} from "../contracts/storyEffectExecutionContracts.ts";\n\ninterface RpcError { readonly message: string; readonly code?: string; }\ninterface RpcResponse<T> { readonly data: T | null; readonly error: RpcError | null; }\ninterface Client { rpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResponse<T>>; }\ninterface AdjustmentRow { readonly relationship_id?: unknown; }\n\nexport class SupabaseStoryRelationshipWriter implements StoryEffectRelationshipWriter {\n  constructor(private readonly client: Client) {}\n\n  async adjustRelationship(input: StoryRelationshipAdjustmentWriteInput): Promise<StoryWriteResult> {\n    const response = await this.client.rpc<readonly AdjustmentRow[]>("adjust_story_relationship_v1", {\n      p_game_session_id: input.gameSessionId,\n      p_player_id: input.playerId,\n      p_source_storyline_event_id: input.storylineEventId,\n      p_effect_index: input.effectIndex,\n      p_character_key: input.characterKey,\n      p_reason: input.reason,\n      p_deltas: input.deltas,\n    });\n    if (response.error) throw new Error(response.error.message);\n    const id = typeof response.data?.[0]?.relationship_id === "string"\n      ? response.data[0].relationship_id\n      : undefined;\n    return id ? { id } : {};\n  }\n}\n''')

path='backend/src/domains/storylines/services/storyEffectEngine.ts'
replace_once(path,
'''    if (input.effect.type === "story_flag_set") {\n''',
'''    if (input.effect.type === "relationship_adjust") {\n      if (!input.playerContext) {\n        return skipped(input.effect, effectIndex, null, "missing_player_context");\n      }\n      if (!input.dependencies.relationships) {\n        return skipped(input.effect, effectIndex, input.playerContext.playerId, "unsupported_effect_type");\n      }\n      const result = await input.dependencies.relationships.adjustRelationship({\n        gameSessionId: input.gameSessionId,\n        playerId: input.playerContext.playerId,\n        storylineEventId: input.storylineEventId,\n        effectIndex,\n        characterKey: input.effect.characterKey,\n        reason: input.effect.reason,\n        deltas: input.effect.deltas,\n      });\n      return applied(input.effect, effectIndex, input.playerContext.playerId, collectWriteIds(result));\n    }\n\n    if (input.effect.type === "story_flag_set") {\n''')

path='backend/src/domains/storylines/infrastructure/supabasePlayerStoryContextRepository.ts'
replace_once(path,
'''import type { JsonValue } from "../../../supabase/tableTypes.ts";\n''',
'''import type { JsonValue } from "../../../supabase/tableTypes.ts";\nimport type { StoryRelationshipState } from "../contracts/storyRelationshipContracts.ts";\n''')
replace_once(path,
'''  | "game_session_story_flags";\n''',
'''  | "game_session_story_flags"\n  | "story_relationships";\n''')
insert_before(path,
'''interface CountryInfo {\n''',
'''interface StoryRelationshipRow {\n  readonly player_id: string;\n  readonly character_key: string;\n  readonly trust: number | string;\n  readonly respect: number | string;\n  readonly affinity: number | string;\n  readonly obligation: number | string;\n  readonly suspicion: number | string;\n  readonly standing: "hostile" | "strained" | "neutral" | "trusted" | "allied";\n}\n\n''')
replace_once(path,
'''const STORY_FLAG_SELECT = "flag_key,value,created_at";\n''',
'''const STORY_FLAG_SELECT = "flag_key,value,created_at";\nconst RELATIONSHIP_SELECT = "player_id,character_key,trust,respect,affinity,obligation,suspicion,standing";\n''')
replace_once(path,
'''      storyFlags,\n    ] = await Promise.all([\n''',
'''      storyFlags,\n      relationshipRows,\n    ] = await Promise.all([\n''')
replace_once(path,
'''      this.readStoryFlags(gameSessionId),\n    ]);\n''',
'''      this.readStoryFlags(gameSessionId),\n      this.readRelationships(gameSessionId),\n    ]);\n''')
replace_once(path,
'''    const progressByPlayerId = groupBy(\n      progressRows,\n      (progress) => progress.player_id,\n    );\n''',
'''    const progressByPlayerId = groupBy(\n      progressRows,\n      (progress) => progress.player_id,\n    );\n    const relationshipsByPlayerId = groupBy(\n      relationshipRows,\n      (relationship) => relationship.player_id,\n    );\n''')
replace_once(path,
'''        storyFlags,\n      };\n''',
'''        storyFlags,\n        relationships: Object.fromEntries(\n          (relationshipsByPlayerId.get(player.id) ?? []).map((relationship) => [\n            relationship.character_key,\n            normalizeRelationshipRow(relationship),\n          ]),\n        ),\n      };\n''')
insert_before(path,
'''  private async readActivePlayers(\n''',
'''  private async readRelationships(\n    gameSessionId: string,\n  ): Promise<readonly StoryRelationshipRow[]> {\n    const response = await this.client\n      .from("story_relationships")\n      .select(RELATIONSHIP_SELECT)\n      .eq("game_session_id", gameSessionId)\n      .order("character_key", { ascending: true });\n    assertNoError(response, "story_relationships", "select");\n    return (response.data ?? []) as StoryRelationshipRow[];\n  }\n\n''')
insert_before(path,
'''function isString(value: unknown): value is string {\n''',
'''function normalizeRelationshipRow(row: StoryRelationshipRow): StoryRelationshipState {\n  return {\n    characterKey: row.character_key,\n    trust: Number(row.trust),\n    respect: Number(row.respect),\n    affinity: Number(row.affinity),\n    obligation: Number(row.obligation),\n    suspicion: Number(row.suspicion),\n    standing: row.standing,\n  };\n}\n\n''')

path='backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts'
replace_once(path,
'''import {\n  SupabaseStoryMessageWriter,\n} from "../../storylines/infrastructure/supabaseStoryMessageWriter.ts";\n''',
'''import {\n  SupabaseStoryMessageWriter,\n} from "../../storylines/infrastructure/supabaseStoryMessageWriter.ts";\nimport { SupabaseStoryRelationshipWriter } from "../../storylines/infrastructure/supabaseStoryRelationshipWriter.ts";\n''')
replace_once(path,
'''  const messages = new SupabaseStoryMessageWriter(client as any);\n''',
'''  const messages = new SupabaseStoryMessageWriter(client as any);\n  const relationships = new SupabaseStoryRelationshipWriter(client as any);\n''')
replace_once(path,
'''        messages,\n      },\n''',
'''        messages,\n        relationships,\n      },\n''')

write('backend/src/domains/storylines/contracts/storyRelationshipContract.test.ts', '''import { parseStoryCondition } from "./storyConditionContracts.ts";\nimport { parseStoryEffect } from "./storyEffectContracts.ts";\n\ndeclare const Deno: { test(name: string, run: () => void | Promise<void>): void };\n\nDeno.test("relationship effects and conditions parse deterministically", () => {\n  const effect = parseStoryEffect({\n    type: "relationship_adjust",\n    characterKey: "character.northreach.jonis-hale.v1",\n    reason: "Player documented the safety shortcut before escalating.",\n    deltas: { trust: 12, respect: 8, suspicion: -4 },\n  });\n  if (effect.type !== "relationship_adjust") throw new Error("wrong effect type");\n  assertEquals(effect.deltas, { trust: 12, respect: 8, suspicion: -4 });\n  const condition = parseStoryCondition({\n    type: "player_relationship_standing_is",\n    characterKey: "character.northreach.jonis-hale.v1",\n    standing: "trusted",\n  });\n  assertEquals(condition, {\n    type: "player_relationship_standing_is",\n    characterKey: "character.northreach.jonis-hale.v1",\n    standing: "trusted",\n  });\n});\nfunction assertEquals(actual: unknown, expected: unknown) {\n  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);\n}\n''')

write('backend/src/domains/storylines/infrastructure/supabaseStoryRelationshipWriter.test.ts', '''import { SupabaseStoryRelationshipWriter } from "./supabaseStoryRelationshipWriter.ts";\ndeclare const Deno: { test(name: string, run: () => void | Promise<void>): void };\nDeno.test("relationship writer uses server-owned atomic RPC", async () => {\n  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];\n  const writer = new SupabaseStoryRelationshipWriter({\n    rpc(name: string, args: Record<string, unknown>) {\n      calls.push({ name, args });\n      return Promise.resolve({ data: [{ relationship_id: "rel_public_jonis" }], error: null });\n    },\n  });\n  const result = await writer.adjustRelationship({\n    gameSessionId: "game-1", playerId: "player-1", storylineEventId: "event-1", effectIndex: 2,\n    characterKey: "character.northreach.jonis-hale.v1", reason: "Documented the shortcut.",\n    deltas: { trust: 12, respect: 8 },\n  });\n  if (result.id !== "rel_public_jonis") throw new Error("relationship writer id mismatch");\n  if (calls[0]?.name !== "adjust_story_relationship_v1") throw new Error("wrong RPC");\n});\n''')

write('backend/src/domains/storylines/tests/storyRelationshipMigrationContract.test.ts', '''export {};\ndeclare const Deno: { args: string[]; readTextFile(path: string): Promise<string>; test(name: string, run: () => void | Promise<void>): void };\nDeno.test("relationship migration keeps state private and idempotent", async () => {\n  const sql = await Deno.readTextFile(Deno.args[0]);\n  for (const fragment of [\n    "create table public.story_relationships",\n    "create table public.story_relationship_adjustments",\n    "force row level security",\n    "adjust_story_relationship_v1",\n    "unique (game_session_id, player_id, source_storyline_event_id, effect_index)",\n    "revoke all privileges",\n  ]) if (!sql.includes(fragment)) throw new Error(`missing migration contract: ${fragment}`);\n});\n''')

path='backend/src/domains/storylines/infrastructure/supabasePlayerStoryContextRepository.test.ts'
replace_once(path,
'''  | "game_session_story_flags";\n''',
'''  | "game_session_story_flags"\n  | "story_relationships";\n''')
replace_once(path,
'''    game_session_story_flags: [],\n''',
'''    game_session_story_flags: [],\n    story_relationships: [\n      { game_session_id: "game-1", player_id: "player-1", character_key: "character.northreach.jonis-hale.v1", trust: 42, respect: 30, affinity: 10, obligation: 5, suspicion: 0, standing: "trusted" },\n    ],\n''')
replace_once(path,
'''  assertEquals(contexts[0]?.storyFlags, {\n    northreach_border_closed: true,\n    tariff_level: 2,\n  });\n''',
'''  assertEquals(contexts[0]?.storyFlags, {\n    northreach_border_closed: true,\n    tariff_level: 2,\n  });\n  assertEquals(contexts[0]?.relationships["character.northreach.jonis-hale.v1"]?.standing, "trusted");\n''')
replace_once(path,
'''  tables.game_session_story_flags = [];\n''',
'''  tables.game_session_story_flags = [];\n  tables.story_relationships = [];\n''')
replace_once(path,
'''  assertEquals(contexts[0]?.storyFlags, {});\n''',
'''  assertEquals(contexts[0]?.storyFlags, {});\n  assertEquals(contexts[0]?.relationships, {});\n''')

path='backend/package.json'
text=read(path)
if '"test:story-relationships"' not in text:
    anchor='    "test:player-messaging": '
    idx=text.find(anchor)
    if idx < 0: raise SystemExit('package player messaging anchor not found')
    addition='    "test:story-relationships": "deno test --config supabase/functions/deno.json --lock=supabase/functions/deno.lock --frozen src/domains/storylines/contracts/storyRelationshipContract.test.ts src/domains/storylines/infrastructure/supabaseStoryRelationshipWriter.test.ts",\n'
    text=text[:idx]+addition+text[idx:]
    write(path,text)
