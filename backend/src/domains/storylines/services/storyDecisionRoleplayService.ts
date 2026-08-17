/// <reference lib="dom" />

import type { JsonValue } from "../../../supabase/tableTypes.ts";

export interface StoryDecisionRoleplayInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly contractKey: string;
}

export interface StoryDecisionRoleplayResult {
  readonly dialogue: string;
  readonly characterName: string;
  readonly source: "openai" | "fallback";
}

interface QueryError { readonly message: string; }
interface QueryResponse { readonly data: unknown; readonly error: QueryError | null; }
interface QueryBuilder {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResponse>;
}
export interface StoryDecisionRoleplayClient {
  from(tableName: string): QueryBuilder;
}

type JsonRecord = Record<string, JsonValue>;

const DEFAULT_FALLBACK = "You have made your position clear. I will remember where you stood when we see what follows.";
const MAX_DIALOGUE_LENGTH = 900;
const ROLEPLAY_TIMEOUT_MS = 6_000;

export async function renderStoryDecisionRoleplay(
  client: StoryDecisionRoleplayClient,
  input: StoryDecisionRoleplayInput,
): Promise<StoryDecisionRoleplayResult | null> {
  const decisionResponse = await client
    .from("player_story_decisions")
    .select("decision_key,option_key,rationale,relationship_character_key,semantic_tags,dimensions")
    .eq("game_session_id", input.gameSessionId)
    .eq("player_id", input.playerId)
    .eq("contract_key", input.contractKey)
    .maybeSingle();
  if (decisionResponse.error || !isRecord(decisionResponse.data)) return null;

  const decision = decisionResponse.data;
  const decisionKey = readText(decision.decision_key);
  const optionKey = readText(decision.option_key);
  const rationale = readText(decision.rationale);
  if (!decisionKey || !optionKey || !rationale) return null;

  const definitionResponse = await client
    .from("story_decision_definitions")
    .select("public_prompt")
    .eq("decision_key", decisionKey)
    .eq("is_active", true)
    .maybeSingle();
  const publicPrompt = isRecord(definitionResponse.data) && isRecord(definitionResponse.data.public_prompt)
    ? definitionResponse.data.public_prompt
    : {};
  const option = readPublicOption(publicPrompt, optionKey);
  const fallback = readText(publicPrompt.fallbackAcknowledgement) || DEFAULT_FALLBACK;

  const characterKey = readText(decision.relationship_character_key);
  let characterName = "Your contact";
  let relationshipStage = "engaged";
  let trustScore: number | null = null;
  let memory: Record<string, unknown> = {};
  if (characterKey) {
    const relationshipResponse = await client
      .from("player_story_relationships")
      .select("character_name,stage,trust_score,memory")
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .eq("character_key", characterKey)
      .maybeSingle();
    if (isRecord(relationshipResponse.data)) {
      characterName = readText(relationshipResponse.data.character_name) || characterName;
      relationshipStage = readText(relationshipResponse.data.stage) || relationshipStage;
      trustScore = readNumber(relationshipResponse.data.trust_score);
      memory = isRecord(relationshipResponse.data.memory) ? relationshipResponse.data.memory : {};
    }
  }

  const apiKey = readEnv("OPENAI_STORY_ROLEPLAY_API_KEY") || readEnv("OPENAI_API_KEY");
  const model = readEnv("OPENAI_STORY_ROLEPLAY_MODEL");
  if (!apiKey || !model) {
    return { dialogue: fallback, characterName, source: "fallback" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROLEPLAY_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        store: false,
        instructions: [
          `You are ${characterName}, a fictional Econovaria character speaking to a student player.`,
          "You are a roleplay renderer only. Never claim to change money, inventory, trust, contracts, markets, residency, story flags, endings, rewards, or any other game state.",
          "React to the student's rationale and selected option. Do not grade it, reveal hidden mechanics, invent world events, infer legal status, or add facts not contained in the supplied context.",
          "You may disagree, challenge an assumption, or ask one short non-mechanical follow-up. Keep the response natural and to 2-4 sentences.",
          "If the rationale is obviously irrelevant or unserious, stay in character and ask the student to take the reasoning seriously, but do not claim the mechanical decision was rejected.",
        ].join("\n"),
        input: JSON.stringify({
          sceneTitle: readText(publicPrompt.sceneTitle),
          authoredQuestion: readText(publicPrompt.question),
          selectedOption: {
            optionKey,
            label: option?.label ?? optionKey,
            characterReaction: option?.characterReaction ?? null,
            rationalePrompt: option?.rationalePrompt ?? null,
          },
          playerRationale: rationale,
          relationship: { stage: relationshipStage, trustScore },
          approvedMemory: sanitizeMemory(memory),
          semanticDecisionTags: Array.isArray(decision.semantic_tags) ? decision.semantic_tags.slice(0, 12) : [],
          decisionDimensions: isRecord(decision.dimensions) ? decision.dimensions : {},
        }),
        text: {
          format: {
            type: "json_schema",
            name: "econovaria_npc_roleplay",
            strict: true,
            schema: {
              type: "object",
              properties: { dialogue: { type: "string", minLength: 1, maxLength: MAX_DIALOGUE_LENGTH } },
              required: ["dialogue"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) return { dialogue: fallback, characterName, source: "fallback" };
    const payload: unknown = await response.json();
    const outputText = readResponseOutputText(payload);
    if (!outputText) return { dialogue: fallback, characterName, source: "fallback" };
    const structured = JSON.parse(outputText) as unknown;
    const dialogue = isRecord(structured) ? readText(structured.dialogue) : null;
    return {
      dialogue: dialogue?.slice(0, MAX_DIALOGUE_LENGTH) || fallback,
      characterName,
      source: dialogue ? "openai" : "fallback",
    };
  } catch {
    return { dialogue: fallback, characterName, source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}

function readPublicOption(prompt: Record<string, unknown>, optionKey: string): { readonly label: string; readonly characterReaction: string | null; readonly rationalePrompt: string | null } | null {
  const options = Array.isArray(prompt.options) ? prompt.options : [];
  for (const candidate of options) {
    if (!isRecord(candidate) || readText(candidate.optionKey) !== optionKey) continue;
    return {
      label: readText(candidate.label) || optionKey,
      characterReaction: readText(candidate.characterReaction),
      rationalePrompt: readText(candidate.rationalePrompt),
    };
  }
  return null;
}

function sanitizeMemory(memory: Record<string, unknown>): Record<string, unknown> {
  const allowed = ["lastStoryDecisionKey", "lastStoryDecisionOption", "storyDecisions"];
  return Object.fromEntries(allowed.flatMap((key) => Object.prototype.hasOwnProperty.call(memory, key) ? [[key, memory[key]]] : []));
}

function readResponseOutputText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text") {
        const value = readText(content.text);
        if (value) return value;
      }
    }
  }
  return null;
}

function readEnv(name: string): string | null {
  const runtime = globalThis as typeof globalThis & { Deno?: { env?: { get?: (key: string) => string | undefined } } };
  return readText(runtime.Deno?.env?.get?.(name));
}
function readText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
