import { renderStoryDecisionRoleplay, type StoryDecisionRoleplayClient } from "../../../src/domains/storylines/index.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const scope = { gameSessionId: "game-a", playerId: "player-a", contractKey: "story-choice" };
const decision = { decision_key: " choice ", option_key: " help ", rationale: " My reason ", relationship_character_key: " contact ", semantic_tags: ["care"], dimensions: { care: 2 } };
const prompt = { fallbackAcknowledgement: " Authored reply ", sceneTitle: "Scene", question: "Why?", options: [{ optionKey: "help", label: "Help", characterReaction: "Thanks", rationalePrompt: "Explain" }] };
const relationship = { character_name: " Mira ", stage: " trusted ", trust_score: "3.5", memory: { lastStoryDecisionKey: "prior", privateSecret: "omit" } };
const defaultFallback = "You have made your position clear. I will remember where you stood when we see what follows.";
type Result = { data: unknown; error: { message: string } | null };
const row = (data: unknown, error: Result["error"] = null): Result => ({ data, error });

function fake(results: Result[] = [row(decision), row({ public_prompt: prompt }), row(relationship)]) {
  const calls: unknown[][] = [];
  const client = { from(table: string) {
    calls.push(["from", table]);
    const query = {
      select(columns: string) { calls.push(["select", columns]); return query; },
      eq(column: string, value: unknown) { calls.push(["eq", column, value]); return query; },
      async maybeSingle() { calls.push(["maybeSingle"]); const next = results.shift(); if (!next) throw new Error("Unexpected read"); return next; },
    };
    return query;
  } } satisfies StoryDecisionRoleplayClient;
  return { client, calls };
}

async function runtime<T>(run: () => Promise<T>, provider?: typeof fetch): Promise<T> {
  const deno = (globalThis as unknown as { Deno: object }).Deno;
  const env = Object.getOwnPropertyDescriptor(deno, "env")!;
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch")!;
  Object.defineProperty(deno, "env", { configurable: true, value: { get: (name: string) => provider ? ({ OPENAI_API_KEY: "synthetic-test-key", OPENAI_STORY_ROLEPLAY_MODEL: "synthetic-test-model" } as Record<string, string>)[name] : undefined } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: provider ?? (() => { throw new Error("Unexpected provider call"); }) });
  try { return await run(); } finally {
    Object.defineProperty(deno, "env", env);
    Object.defineProperty(globalThis, "fetch", originalFetch);
  }
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("roleplay public boundary preserves exact scoped query sequence and authored fallback", async () => {
  const f = fake();
  const result = await runtime(() => renderStoryDecisionRoleplay(f.client, scope));
  equal(result, { dialogue: "Authored reply", characterName: "Mira", source: "fallback" });
  equal(f.calls, [
    ["from", "player_story_decisions"], ["select", "decision_key,option_key,rationale,relationship_character_key,semantic_tags,dimensions"],
    ["eq", "game_session_id", "game-a"], ["eq", "player_id", "player-a"], ["eq", "contract_key", "story-choice"], ["maybeSingle"],
    ["from", "story_decision_definitions"], ["select", "public_prompt"], ["eq", "decision_key", "choice"], ["eq", "is_active", true], ["maybeSingle"],
    ["from", "player_story_relationships"], ["select", "character_name,stage,trust_score,memory"],
    ["eq", "game_session_id", "game-a"], ["eq", "player_id", "player-a"], ["eq", "character_key", "contact"], ["maybeSingle"],
  ]);
});

for (const [name, result] of Object.entries({
  missing: row(null), array: row([]), error: row(decision, { message: "private database error" }),
  decisionKey: row({ ...decision, decision_key: " " }), optionKey: row({ ...decision, option_key: null }), rationale: row({ ...decision, rationale: 42 }),
})) Deno.test(`roleplay ${name} decision stops before further reads or provider`, async () => {
  const f = fake([result]);
  equal(await runtime(() => renderStoryDecisionRoleplay(f.client, scope)), null);
  equal(f.calls.filter(c => c[0] === "from"), [["from", "player_story_decisions"]]);
});

for (const data of [null, [], { public_prompt: null }]) Deno.test(`roleplay malformed definition ${JSON.stringify(data)} preserves defaults`, async () => {
  const f = fake([row({ ...decision, relationship_character_key: " " }), row(data, { message: "ignored" })]);
  equal(await runtime(() => renderStoryDecisionRoleplay(f.client, scope)), { dialogue: defaultFallback, characterName: "Your contact", source: "fallback" });
  equal(f.calls.filter(c => c[0] === "from").length, 2);
});

Deno.test("roleplay optional reads still use returned data alongside errors", async () => {
  const f = fake([row(decision), row({ public_prompt: prompt }, { message: "ignored" }), row(relationship, { message: "ignored" })]);
  equal(await runtime(() => renderStoryDecisionRoleplay(f.client, scope)), { dialogue: "Authored reply", characterName: "Mira", source: "fallback" });
});

Deno.test("roleplay missing relationship keeps default character", async () => {
  const f = fake([row(decision), row({ public_prompt: prompt }), row(null, { message: "ignored" })]);
  equal(await runtime(() => renderStoryDecisionRoleplay(f.client, scope)), { dialogue: "Authored reply", characterName: "Your contact", source: "fallback" });
});

Deno.test("roleplay thrown database failure propagates without a provider call", async () => {
  const failure = new Error("database unavailable");
  const client = { from() { throw failure; } } as StoryDecisionRoleplayClient;
  let caught: unknown;
  try { await runtime(() => renderStoryDecisionRoleplay(client, scope)); } catch (error) { caught = error; }
  equal(caught === failure, true);
});

Deno.test("roleplay provider request preserves safe context, structured output and length limit", async () => {
  const f = fake([row({ ...decision, semantic_tags: Array.from({ length: 14 }, (_, i) => i) }), row({ public_prompt: prompt }), row(relationship)]);
  let requests = 0;
  const result = await runtime(() => renderStoryDecisionRoleplay(f.client, scope), async (url, options) => {
    requests++;
    equal(url, "https://api.openai.com/v1/responses");
    equal(options?.method, "POST");
    equal(options?.signal instanceof AbortSignal, true);
    const body = JSON.parse(String(options?.body));
    equal(body.store, false);
    equal(body.model, "synthetic-test-model");
    equal(body.instructions.includes("Never claim to change money"), true);
    equal(JSON.parse(body.input), {
      sceneTitle: "Scene", authoredQuestion: "Why?",
      selectedOption: { optionKey: "help", label: "Help", characterReaction: "Thanks", rationalePrompt: "Explain" },
      playerRationale: "My reason", relationship: { stage: "trusted", trustScore: 3.5 },
      approvedMemory: { lastStoryDecisionKey: "prior" }, semanticDecisionTags: Array.from({ length: 12 }, (_, i) => i), decisionDimensions: { care: 2 },
    });
    equal(body.text.format.schema.properties.dialogue.maxLength, 900);
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ dialogue: ` ${"x".repeat(910)} ` }) }] }] });
  });
  equal(requests, 1);
  equal(result, { dialogue: "x".repeat(900), characterName: "Mira", source: "openai" });
});

for (const [name, provider] of Object.entries({
  unavailable: async () => new Response("unavailable", { status: 503 }),
  invalidJson: async () => new Response("not json"),
  missingOutput: async () => Response.json({ output: [] }),
  invalidOutput: async () => Response.json({ output: [{ content: [{ type: "output_text", text: "bad json" }] }] }),
  blankDialogue: async () => Response.json({ output: [{ content: [{ type: "output_text", text: '{"dialogue":" "}' }] }] }),
  networkFailure: async () => { throw new Error("provider unavailable"); },
})) Deno.test(`roleplay provider ${name} returns authored fallback without retry`, async () => {
  let calls = 0;
  const f = fake();
  equal(await runtime(() => renderStoryDecisionRoleplay(f.client, scope), async () => { calls++; return provider(); }), { dialogue: "Authored reply", characterName: "Mira", source: "fallback" });
  equal(calls, 1);
});

Deno.test("roleplay renderer accepts a read port without any database client", async () => {
  const { renderStoryDecisionRoleplay: renderFromRepository } = await import("../../../src/domains/storylines/services/storyDecisionRoleplayService.ts");
  const calls: unknown[] = [];
  const repository = {
    async readDecision(input: unknown) { calls.push(input); return row(decision); },
    async readDefinition(key: string) { calls.push(key); return row({ public_prompt: prompt }); },
    async readRelationship(input: unknown) { calls.push(input); return row(relationship); },
  };
  equal(await runtime(() => renderFromRepository(repository, scope)), { dialogue: "Authored reply", characterName: "Mira", source: "fallback" });
  equal(calls, [scope, "choice", { gameSessionId: "game-a", playerId: "player-a", characterKey: "contact" }]);
});

for (const failureAt of [2, 3]) Deno.test(`roleplay read ${failureAt} exception still propagates`, async () => {
  const failure = new Error("optional read unavailable");
  const f = fake();
  const from = f.client.from.bind(f.client);
  let calls = 0;
  f.client.from = (table: string) => { if (++calls === failureAt) throw failure; return from(table); };
  let caught: unknown;
  try { await runtime(() => renderStoryDecisionRoleplay(f.client, scope)); } catch (error) { caught = error; }
  equal(caught === failure, true);
  equal(calls, failureAt);
});

Deno.test("roleplay six-second timeout aborts once and returns fallback", async () => {
  const timer = Object.getOwnPropertyDescriptor(globalThis, "setTimeout")!;
  const nativeTimer = setTimeout;
  const delays: number[] = [];
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: (callback: () => void, delay: number) => { delays.push(delay); return nativeTimer(callback, 0); } });
  try {
    let requests = 0;
    const result = await runtime(() => renderStoryDecisionRoleplay(fake().client, scope), async (_url, options) => {
      requests++;
      return await new Promise<Response>((_resolve, reject) => options!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    });
    equal(delays, [6000]);
    equal(requests, 1);
    equal(result, { dialogue: "Authored reply", characterName: "Mira", source: "fallback" });
  } finally { Object.defineProperty(globalThis, "setTimeout", timer); }
});
