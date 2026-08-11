from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def insert_before(path: str, marker: str, addition: str) -> None:
    text = read(path)
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f"{path}: expected one marker, found {count}: {marker[:120]!r}")
    write(path, text.replace(marker, addition + marker, 1))


write("backend/src/domains/storylines/contracts/storyChoiceContracts.ts", '''export const STORY_CHOICE_SOURCES = ["selected", "default"] as const;\n\nexport type StoryChoiceSource = typeof STORY_CHOICE_SOURCES[number];\n\nexport interface StoryEffectiveChoice {\n  readonly interactionKey: string;\n  readonly characterKey: string;\n  readonly choiceKey: string;\n  readonly source: StoryChoiceSource;\n}\n\nexport type PlayerStoryChoices = Readonly<Record<string, StoryEffectiveChoice>>;\n''')

path = "backend/src/domains/storylines/contracts/playerStoryContext.ts"
replace_once(path,
'''import type { PlayerStoryRelationships } from "./storyRelationshipContracts.ts";\n''',
'''import type { PlayerStoryRelationships } from "./storyRelationshipContracts.ts";\nimport type { PlayerStoryChoices } from "./storyChoiceContracts.ts";\n''')
replace_once(path,
'''  readonly relationships?: PlayerStoryRelationships;\n''',
'''  readonly relationships?: PlayerStoryRelationships;\n  readonly storyChoices?: PlayerStoryChoices;\n''')

path = "backend/src/domains/storylines/contracts/playerStoryContextRepositoryContracts.ts"
replace_once(path,
'''  listPlayerStoryContexts(\n    gameSessionId: string,\n  ): Promise<readonly PlayerStoryContext[]>;\n''',
'''  listPlayerStoryContexts(\n    gameSessionId: string,\n    at?: string,\n  ): Promise<readonly PlayerStoryContext[]>;\n''')

path = "backend/src/domains/storylines/contracts/storyConditionContracts.ts"
replace_once(path,
'''import {\n  STORY_RELATIONSHIP_METRICS,\n''',
'''import { STORY_CHOICE_SOURCES, type StoryChoiceSource } from "./storyChoiceContracts.ts";\nimport {\n  STORY_RELATIONSHIP_METRICS,\n''')
replace_once(path,
'''  "player_relationship_standing_is",\n] as const;\n''',
'''  "player_relationship_standing_is",\n  "player_story_choice_is",\n] as const;\n''')
replace_once(path,
'''  | StoryRelationshipMetricCondition\n  | StoryRelationshipStandingCondition;\n''',
'''  | StoryRelationshipMetricCondition\n  | StoryRelationshipStandingCondition\n  | StoryChoiceCondition;\n''')
insert_before(path,
'''export function parseStoryCondition(value: unknown): StoryCondition {\n''',
'''export interface StoryChoiceCondition {\n  readonly type: "player_story_choice_is";\n  readonly interactionKey: string;\n  readonly choiceKey: string;\n  readonly source: StoryChoiceSource | null;\n}\n\n''')
replace_once(path,
'''  if (type === "player_relationship_standing_is") {\n    const standing = readRequiredText(record.standing, "condition.standing");\n    if (!STORY_RELATIONSHIP_STANDINGS.includes(standing as StoryRelationshipStanding)) {\n      throw invalidStorylineContract("condition.standing is invalid.");\n    }\n    return {\n      type,\n      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),\n      standing: standing as StoryRelationshipStanding,\n    };\n  }\n\n  return {\n''',
'''  if (type === "player_relationship_standing_is") {\n    const standing = readRequiredText(record.standing, "condition.standing");\n    if (!STORY_RELATIONSHIP_STANDINGS.includes(standing as StoryRelationshipStanding)) {\n      throw invalidStorylineContract("condition.standing is invalid.");\n    }\n    return {\n      type,\n      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),\n      standing: standing as StoryRelationshipStanding,\n    };\n  }\n\n  if (type === "player_story_choice_is") {\n    const interactionKey = readRequiredText(record.interactionKey, "condition.interactionKey");\n    const choiceKey = readRequiredText(record.choiceKey, "condition.choiceKey");\n    if (\n      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(interactionKey) ||\n      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(choiceKey)\n    ) {\n      throw invalidStorylineContract("condition Story choice key is invalid.");\n    }\n    const sourceText = typeof record.source === "string" ? record.source.trim() : "";\n    if (sourceText && !STORY_CHOICE_SOURCES.includes(sourceText as StoryChoiceSource)) {\n      throw invalidStorylineContract("condition.source is invalid.");\n    }\n    return {\n      type,\n      interactionKey,\n      choiceKey,\n      source: sourceText ? sourceText as StoryChoiceSource : null,\n    };\n  }\n\n  return {\n''')

path = "backend/src/domains/storylines/services/storyConditionEngine.ts"
replace_once(path,
'''    case "player_relationship_standing_is":\n      return player.relationships?.[condition.characterKey]?.standing === condition.standing;\n''',
'''    case "player_relationship_standing_is":\n      return player.relationships?.[condition.characterKey]?.standing === condition.standing;\n    case "player_story_choice_is": {\n      const effectiveChoice = player.storyChoices?.[condition.interactionKey];\n      return effectiveChoice?.choiceKey === condition.choiceKey &&\n        (condition.source === null || effectiveChoice.source === condition.source);\n    }\n''')

path = "backend/src/domains/storylines/infrastructure/supabasePlayerStoryContextRepository.ts"
replace_once(path,
'''import type { StoryRelationshipState } from "../contracts/storyRelationshipContracts.ts";\n''',
'''import type { StoryRelationshipState } from "../contracts/storyRelationshipContracts.ts";\nimport type { StoryEffectiveChoice } from "../contracts/storyChoiceContracts.ts";\n''')
replace_once(path,
'''  | "game_session_story_flags"\n  | "story_relationships";\n''',
'''  | "game_session_story_flags"\n  | "story_relationships"\n  | "story_message_interactions"\n  | "story_message_interaction_selections";\n''')
insert_before(path,
'''interface CountryInfo {\n''',
'''interface StoryInteractionContextRow {\n  readonly id: string;\n  readonly player_id: string;\n  readonly character_key: string;\n  readonly interaction_key: string;\n  readonly closes_at: string | null;\n  readonly default_choice_key: string | null;\n}\n\ninterface StoryInteractionSelectionContextRow {\n  readonly interaction_id: string;\n  readonly choice_key: string;\n  readonly selected_at: string;\n}\n\n''')
replace_once(path,
'''const RELATIONSHIP_SELECT = "player_id,character_key,trust,respect,affinity,obligation,suspicion,standing";\n''',
'''const RELATIONSHIP_SELECT = "player_id,character_key,trust,respect,affinity,obligation,suspicion,standing";\nconst STORY_INTERACTION_SELECT = "id,player_id,character_key,interaction_key,closes_at,default_choice_key";\nconst STORY_SELECTION_SELECT = "interaction_id,choice_key,selected_at";\n''')
replace_once(path,
'''  async listPlayerStoryContexts(\n    gameSessionId: string,\n  ): Promise<readonly PlayerStoryContext[]> {\n''',
'''  async listPlayerStoryContexts(\n    gameSessionId: string,\n    at?: string,\n  ): Promise<readonly PlayerStoryContext[]> {\n    const evaluationAt = readEvaluationTime(at);\n''')
replace_once(path,
'''      storyFlags,\n      relationshipRows,\n    ] = await Promise.all([\n''',
'''      storyFlags,\n      relationshipRows,\n      storyInteractionRows,\n      storySelectionRows,\n    ] = await Promise.all([\n''')
replace_once(path,
'''      this.readStoryFlags(gameSessionId),\n      this.readRelationships(gameSessionId),\n    ]);\n''',
'''      this.readStoryFlags(gameSessionId),\n      this.readRelationships(gameSessionId),\n      this.readStoryInteractions(gameSessionId),\n      this.readStorySelections(gameSessionId),\n    ]);\n''')
replace_once(path,
'''    const relationshipsByPlayerId = groupBy(\n      relationshipRows,\n      (relationship) => relationship.player_id,\n    );\n''',
'''    const relationshipsByPlayerId = groupBy(\n      relationshipRows,\n      (relationship) => relationship.player_id,\n    );\n    const storyInteractionsByPlayerId = groupBy(\n      storyInteractionRows,\n      (interaction) => interaction.player_id,\n    );\n    const selectionByInteractionId = new Map(\n      storySelectionRows.map((selection) => [selection.interaction_id, selection]),\n    );\n''')
replace_once(path,
'''        relationships: Object.fromEntries(\n          (relationshipsByPlayerId.get(player.id) ?? []).map((relationship) => [\n            relationship.character_key,\n            normalizeRelationshipRow(relationship),\n          ]),\n        ),\n''',
'''        relationships: Object.fromEntries(\n          (relationshipsByPlayerId.get(player.id) ?? []).map((relationship) => [\n            relationship.character_key,\n            normalizeRelationshipRow(relationship),\n          ]),\n        ),\n        storyChoices: buildEffectiveStoryChoices(\n          storyInteractionsByPlayerId.get(player.id) ?? [],\n          selectionByInteractionId,\n          evaluationAt,\n        ),\n''')
insert_before(path,
'''  private async readRelationships(\n''',
'''  private async readStoryInteractions(\n    gameSessionId: string,\n  ): Promise<readonly StoryInteractionContextRow[]> {\n    const response = await this.client\n      .from("story_message_interactions")\n      .select(STORY_INTERACTION_SELECT)\n      .eq("game_session_id", gameSessionId)\n      .order("interaction_key", { ascending: true });\n    assertNoError(response, "story_message_interactions", "select");\n    return (response.data ?? []) as StoryInteractionContextRow[];\n  }\n\n  private async readStorySelections(\n    gameSessionId: string,\n  ): Promise<readonly StoryInteractionSelectionContextRow[]> {\n    const response = await this.client\n      .from("story_message_interaction_selections")\n      .select(STORY_SELECTION_SELECT)\n      .eq("game_session_id", gameSessionId)\n      .order("selected_at", { ascending: true });\n    assertNoError(response, "story_message_interaction_selections", "select");\n    return (response.data ?? []) as StoryInteractionSelectionContextRow[];\n  }\n\n''')
insert_before(path,
'''function normalizeRelationshipRow(row: StoryRelationshipRow): StoryRelationshipState {\n''',
'''function readEvaluationTime(value: string | undefined): number {\n  const parsed = value ? Date.parse(value) : Date.now();\n  if (!Number.isFinite(parsed)) {\n    throw new Error("player_story_context_evaluation_time_invalid");\n  }\n  return parsed;\n}\n\nfunction buildEffectiveStoryChoices(\n  interactions: readonly StoryInteractionContextRow[],\n  selectionByInteractionId: ReadonlyMap<string, StoryInteractionSelectionContextRow>,\n  evaluationAt: number,\n): Readonly<Record<string, StoryEffectiveChoice>> {\n  const choices: Record<string, StoryEffectiveChoice> = {};\n  for (const interaction of interactions) {\n    const selection = selectionByInteractionId.get(interaction.id);\n    if (selection && Date.parse(selection.selected_at) <= evaluationAt) {\n      choices[interaction.interaction_key] = {\n        interactionKey: interaction.interaction_key,\n        characterKey: interaction.character_key,\n        choiceKey: selection.choice_key,\n        source: "selected",\n      };\n      continue;\n    }\n    if (\n      interaction.default_choice_key &&\n      interaction.closes_at &&\n      Date.parse(interaction.closes_at) <= evaluationAt\n    ) {\n      choices[interaction.interaction_key] = {\n        interactionKey: interaction.interaction_key,\n        characterKey: interaction.character_key,\n        choiceKey: interaction.default_choice_key,\n        source: "default",\n      };\n    }\n  }\n  return choices;\n}\n\n''')

path = "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts"
replace_once(path,
'''      .listPlayerStoryContexts(\n        input.gameSessionId,\n      );\n''',
'''      .listPlayerStoryContexts(\n        input.gameSessionId,\n        input.generatedAt,\n      );\n''')

path = "backend/src/domains/storylines/infrastructure/supabasePlayerStoryContextRepository.test.ts"
replace_once(path,
'''  const contexts = await repository.listPlayerStoryContexts("game-1");\n''',
'''  const contexts = await repository.listPlayerStoryContexts(\n    "game-1",\n    "2026-06-25T13:00:00.000Z",\n  );\n''')
replace_once(path,
'''  tables.story_relationships = [];\n''',
'''  tables.story_relationships = [];\n  tables.story_message_interactions = [];\n  tables.story_message_interaction_selections = [];\n''')
replace_once(path,
'''  assertEquals(contexts[0]?.relationships, {});\n''',
'''  assertEquals(contexts[0]?.relationships, {});\n  assertEquals(contexts[0]?.storyChoices, {});\n''')
replace_once(path,
'''  | "game_session_story_flags"\n  | "story_relationships";\n''',
'''  | "game_session_story_flags"\n  | "story_relationships"\n  | "story_message_interactions"\n  | "story_message_interaction_selections";\n''')
insert_before(path,
'''    story_relationships: [\n''',
'''    story_message_interactions: [\n      {\n        id: "interaction-selected",\n        game_session_id: "game-1",\n        player_id: "player-1",\n        character_key: "character.northreach.jonis-hale.v1",\n        interaction_key: "interaction.jonis.production-pressure.v1",\n        closes_at: "2026-06-25T14:00:00.000Z",\n        default_choice_key: "document-first",\n      },\n      {\n        id: "interaction-default",\n        game_session_id: "game-1",\n        player_id: "player-1",\n        character_key: "character.northreach.edda-veyr.v1",\n        interaction_key: "interaction.edda.residency-review.v1",\n        closes_at: "2026-06-25T12:45:00.000Z",\n        default_choice_key: "wait",\n      },\n    ],\n    story_message_interaction_selections: [\n      {\n        interaction_id: "interaction-selected",\n        game_session_id: "game-1",\n        player_id: "player-1",\n        choice_key: "document-first",\n        selected_at: "2026-06-25T12:30:00.000Z",\n      },\n    ],\n''')
replace_once(path,
'''  assertEquals(contexts[0]?.relationships?.["character.northreach.jonis-hale.v1"]?.standing, "trusted");\n''',
'''  assertEquals(contexts[0]?.relationships?.["character.northreach.jonis-hale.v1"]?.standing, "trusted");\n  assertEquals(contexts[0]?.storyChoices?.["interaction.jonis.production-pressure.v1"], {\n    interactionKey: "interaction.jonis.production-pressure.v1",\n    characterKey: "character.northreach.jonis-hale.v1",\n    choiceKey: "document-first",\n    source: "selected",\n  });\n  assertEquals(contexts[0]?.storyChoices?.["interaction.edda.residency-review.v1"], {\n    interactionKey: "interaction.edda.residency-review.v1",\n    characterKey: "character.northreach.edda-veyr.v1",\n    choiceKey: "wait",\n    source: "default",\n  });\n''')

write("backend/src/domains/storylines/services/storyChoiceCondition.test.ts", '''import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";\nimport { parseStoryCondition } from "../contracts/storyConditionContracts.ts";\nimport { evaluateStoryCondition } from "./storyConditionEngine.ts";\n\ndeclare const Deno: { test(name: string, run: () => void | Promise<void>): void };\n\nDeno.test("Story choice condition distinguishes explicit selection from authored default", () => {\n  const player: PlayerStoryContext = {\n    playerId: "player-1", gameSessionId: "game-1", homeCountryId: null, homeCountryCode: null,\n    currentCountryId: null, currentCountryCode: "NORTHREACH", cashBalance: 500, resources: {},\n    sectorExposurePct: {}, countryExposurePct: {}, activeContractKeys: [], completedContractKeys: [],\n    storyFlags: {}, storyChoices: {\n      "interaction.jonis.offer.v1": {\n        interactionKey: "interaction.jonis.offer.v1",\n        characterKey: "character.northreach.jonis-hale.v1",\n        choiceKey: "accept",\n        source: "selected",\n      },\n      "interaction.edda.review.v1": {\n        interactionKey: "interaction.edda.review.v1",\n        characterKey: "character.northreach.edda-veyr.v1",\n        choiceKey: "wait",\n        source: "default",\n      },\n    },\n  };\n  const selected = parseStoryCondition({ type: "player_story_choice_is", interactionKey: "interaction.jonis.offer.v1", choiceKey: "accept", source: "selected" });\n  const defaulted = parseStoryCondition({ type: "player_story_choice_is", interactionKey: "interaction.edda.review.v1", choiceKey: "wait", source: "default" });\n  const wrongSource = parseStoryCondition({ type: "player_story_choice_is", interactionKey: "interaction.edda.review.v1", choiceKey: "wait", source: "selected" });\n  if (!evaluateStoryCondition(selected, player)) throw new Error("selected choice did not match");\n  if (!evaluateStoryCondition(defaulted, player)) throw new Error("default choice did not match");\n  if (evaluateStoryCondition(wrongSource, player)) throw new Error("choice source was not distinguished");\n});\n''')

path = "backend/src/domains/storylines/services/storylineRunner.test.ts"
insert_before(path,
'''Deno.test("storyline runner does not create resolutions for ineligible events", async () => {\n''',
'''Deno.test("storyline runner applies delayed callback effects from an authoritative prior choice", async () => {\n  const repository = new FakeStorylineRepository({\n    candidates: [storylineEventCandidate({\n      id: "choice-callback",\n      eventKey: "choice-callback",\n      scheduledOffsetSeconds: 600,\n      playerRules: [{\n        ruleKey: "document-first-callback",\n        condition: {\n          type: "player_story_choice_is",\n          interactionKey: "interaction.jonis.production-pressure.v1",\n          choiceKey: "document-first",\n          source: "selected",\n        },\n        effects: [{\n          type: "cash_credit",\n          amount: 40,\n          label: "Documented compliance bonus",\n          reason: "Your earlier documented response qualified for the follow-up payment.",\n        }],\n      }],\n    })],\n  });\n  const effectDependencies = createFakeEffectDependencies();\n  const matchingPlayer = {\n    ...playerContext("player-1", "NORTHREACH"),\n    storyChoices: {\n      "interaction.jonis.production-pressure.v1": {\n        interactionKey: "interaction.jonis.production-pressure.v1",\n        characterKey: "character.northreach.jonis-hale.v1",\n        choiceKey: "document-first",\n        source: "selected" as const,\n      },\n    },\n  };\n  const nonMatchingPlayer = {\n    ...playerContext("player-2", "NORTHREACH"),\n    storyChoices: {\n      "interaction.jonis.production-pressure.v1": {\n        interactionKey: "interaction.jonis.production-pressure.v1",\n        characterKey: "character.northreach.jonis-hale.v1",\n        choiceKey: "take-promotion",\n        source: "selected" as const,\n      },\n    },\n  };\n  const result = await runDueStorylineEvents({\n    gameSessionId: "game-1",\n    now: "2026-06-25T12:20:00.000Z",\n    currentMarketTick: 5,\n    playerContexts: [matchingPlayer, nonMatchingPlayer],\n    repository,\n    effectDependencies,\n  });\n  assertEquals(result.resolvedCount, 1);\n  assertEquals(result.effectAppliedCount, 1);\n  assertEquals(effectDependencies.writes.cashAdjustments.length, 1);\n  assertEquals(effectDependencies.writes.cashAdjustments[0]?.playerId, "player-1");\n  assertEquals(effectDependencies.writes.cashAdjustments[0]?.signedAmount, 40);\n});\n\n''')

path = "backend/package.json"
text = read(path)
if '"test:story-choice-callbacks"' not in text:
    anchor = '    "test:story-relationships": '
    idx = text.find(anchor)
    if idx < 0:
        raise SystemExit("backend package story relationship script anchor missing")
    addition = '    "test:story-choice-callbacks": "deno test --config supabase/functions/deno.json --lock=supabase/functions/deno.lock --frozen src/domains/storylines/services/storyChoiceCondition.test.ts src/domains/storylines/services/storylineRunner.test.ts",\n'
    text = text[:idx] + addition + text[idx:]
    write(path, text)
