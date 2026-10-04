import { deepStrictEqual as assertEquals } from "node:assert";
import { prepareStoryContractEffect } from "./prepareStoryEffects.ts";
import { executeStoryEffect } from "./storyEffectEngine.ts";
import { parseStoryEffect } from "../contracts/storyEffectContracts.ts";
import type { StoryContractCreateWriteInput, StoryEffectExecutionDependencies } from "../contracts/storyEffectExecutionContracts.ts";

Deno.test("REF-033 prepares complete Contract descriptors without dependencies or mutation", async () => {
  const context = Object.freeze({ gameSessionId: "game-1", storylineEventId: "event-1", now: "2026-06-25T12:00:00.000Z" });
  const effect = parseStoryEffect({ type: "contract_unlock", contractKey: "ref033-contract", label: "Label", reason: "Reason" });
  if (effect.type !== "contract_unlock") throw new Error("fixture type");
  Object.freeze(effect.payload);
  Object.freeze(effect);
  const expected = {
    gameSessionId: "game-1", contractKey: "ref033-contract", sourceType: "story_event",
    sourceId: "event-1", createdByStaffId: null, title: "Label", description: "Reason",
    instructions: "Reason", category: "story", status: "active", visibility: "public",
    targetingPayload: {}, requirementsPayload: {}, rewardPayload: {}, completionMode: "manual_review",
    publishedAt: context.now, deadlineAt: null, expiresAt: null,
    metadata: { storyEffect: { type: "contract_unlock", label: "Label", reason: "Reason" } },
  };
  assertEquals(prepareStoryContractEffect(context, effect), expected);
  assertEquals(prepareStoryContractEffect(context, effect), expected);
  const dependencies = createFakeDependencies({ enableContracts: true });
  const result = await executeStoryEffect({ ...context, dependencies, effect });
  assertEquals(dependencies.writes.contracts, [expected]);
  assertEquals(result.status, "applied");
  const reward = Object.freeze({ amount: 0.015, currencyCode: "SLV" });
  const payload = Object.freeze({ title: "  Authored  ", description: null, instructions: " Do this ",
    category: " research ", rewardPayload: reward, deadlineAt: " deadline ", expiresAt: " expiry ",
    metadata: Object.freeze({ retained: true, storyEffect: "overridden" }) });
  const prepared = prepareStoryContractEffect(context, Object.freeze({ ...effect, label: null, reason: null, payload }));
  assertEquals(prepared, { ...expected, title: "Authored", description: "", instructions: "Do this",
    category: "research", rewardPayload: reward, deadlineAt: "deadline", expiresAt: "expiry",
    metadata: { retained: true, storyEffect: { type: "contract_unlock", label: null, reason: null } } });
  assertEquals(prepared.rewardPayload === reward, true);
});

Deno.test("REF-033 preserves absent writer precedence and validation before Contract writes", async () => {
  for (const payload of [{ title: " " }, { rewardPayload: [] }]) {
    const effect = parseStoryEffect({ type: "contract_unlock", contractKey: "ref033-contract", payload });
    const absent = createFakeDependencies();
    const skipped = await executeStoryEffect({ ...baseExecutionInput(absent), effect });
    assertSkippedReason(skipped, "unsupported_effect_type");
    const dependencies = createFakeDependencies({ enableContracts: true });
    const failed = await executeStoryEffect({ ...baseExecutionInput(dependencies), effect });
    assertEquals(failed.status, "failed");
    assertFailedMessage(failed, "title" in payload
      ? "contract_unlock payload title must be a non-empty string."
      : "contract_unlock payload rewardPayload must be a JSON object.");
    assertEquals(Object.values(dependencies.writes).every(writes => writes.length === 0), true);
  }
});

Deno.test("REF-033 preserves failed receipt when persistence fails after preparation", async () => {
  const dependencies = createFakeDependencies({ enableContracts: true, failContracts: true });
  const effect = parseStoryEffect({ type: "contract_unlock", contractKey: "ref033-contract" });
  const result = await executeStoryEffect({ ...baseExecutionInput(dependencies), effect });
  assertEquals(result.status, "failed");
  assertFailedMessage(result, "contract repository unavailable");
  assertEquals(Object.values(dependencies.writes).every(writes => writes.length === 0), true);
});

function baseExecutionInput(dependencies: StoryEffectExecutionDependencies) {
  return { gameSessionId: "game-1", storylineEventId: "event-1", now: "2026-06-25T12:00:00.000Z", dependencies };
}
function createFakeDependencies(options: { enableContracts?: boolean; failContracts?: boolean } = {}) {
  const writes = { contracts: [] as StoryContractCreateWriteInput[] };
  const unexpected = () => { throw new Error("unexpected non-Contract write"); };
  return { writes, ledger: { recordCashAdjustment: unexpected }, policies: { upsertPolicy: unexpected },
    flags: { setStoryFlag: unexpected }, impacts: { createPlayerImpact: unexpected },
    contracts: options.enableContracts ? { async createGameSessionContract(input: StoryContractCreateWriteInput) {
      if (options.failContracts) throw new Error("contract repository unavailable");
      writes.contracts.push(input); return { id: "contract-1" };
    } } : undefined };
}
function assertSkippedReason(result: Awaited<ReturnType<typeof executeStoryEffect>>, reason: string) {
  if (result.status !== "skipped") throw new Error("expected skipped receipt");
  assertEquals(result.reason, reason);
}
function assertFailedMessage(result: Awaited<ReturnType<typeof executeStoryEffect>>, message: string) {
  if (result.status !== "failed") throw new Error("expected failed receipt");
  assertEquals(result.errorMessage, message);
}
