import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizePlayerContracts } from "../src/features/contracts/contract-read-model.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { normalizePlayerInvalidationEvent, resourcesVisibleOnRoute } from "../src/realtime/player-invalidation-controller.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("structured contract choices normalize and submit public selection keys", () => {
  const model = normalizePlayerContracts({
    contracts: [{
      contractKey: "econ.quiz-1",
      sourceType: "teacher",
      title: "Scarcity check",
      description: "Answer the question.",
      instructions: "Choose the best response.",
      category: "Economics",
      status: "active",
      visibility: "public",
      targetingPayload: {},
      requirementsPayload: {},
      rewardPayload: { cashAmount: 25, currencyCode: "ECO" },
      completionMode: "manual_review",
      metadata: { issuer: "Economic Council", materials: [{ type: "quiz", questions: [{ prompt: "What is scarcity?", options: ["Limited resources relative to wants", "Unlimited resources"] }] }] },
    }],
    progress: [],
  });
  assert.equal(model.items[0].interaction.type, "multiple_choice");
  assert.equal(model.items[0].interaction.questions[0].options.length, 2);
  assert.deepEqual(normalizeWritePayload("contractSubmit", { "contractChoice-q1": "A", note: "Reasoning supplied" }), {
    evidencePayload: { answers: [{ questionKey: "q1", optionKey: "a" }], note: "Reasoning supplied" },
  });
});

test("live invalidations are scoped and World participates in route reconciliation", () => {
  assert.deepEqual(normalizePlayerInvalidationEvent({ gameSessionId: "g1", resources: ["market", "worldRuntime", "unknown"] }, "g1"), ["market", "worldRuntime"]);
  assert.deepEqual(normalizePlayerInvalidationEvent({ gameSessionId: "g2", resources: ["market"] }, "g1"), []);
  assert.equal(resourcesVisibleOnRoute("world").has("worldRuntime"), true);
});

test("V2 CSS owners load after runtime styles without map ownership or priority escalation", () => {
  const index = read("index.html");
  const styles = ["player-terminal-interior-v2.css", "player-terminal-finance-v2.css", "player-terminal-communications-v2.css", "player-terminal-economy-items-v2.css", "player-terminal-operations-v2.css", "player-terminal-world-v2.css"];
  let previous = index.indexOf("player-world-runtime.css");
  assert.ok(previous >= 0);
  for (const name of styles) {
    const source = read(`css/${name}`);
    const next = index.indexOf(name);
    assert.ok(next > previous);
    previous = next;
    assert.equal(source.includes("!important"), false);
    assert.ok(Buffer.byteLength(source) < 32768);
  }
  const world = read("css/player-terminal-world-v2.css");
  for (const selector of [".player-terminal-country-overlay", ".player-terminal-country-region", ".player-terminal-country-hit", ".player-terminal-country-fill", ".player-terminal-country-border", ".player-terminal-country-marker"]) assert.equal(world.includes(selector), false);
});

test("targeted live reads replace full reload after message read", () => {
  const controller = read("src/realtime/player-invalidation-controller.js");
  assert.ok(controller.includes("api.refreshResources(targets)"));
  assert.ok(controller.includes("updateStoreFromSnapshot"));
  const messageRead = read("src/features/messages/message-read-flow.js");
  assert.equal(messageRead.includes("await terminal.refresh()"), false);
  assert.ok(messageRead.includes('["messages", "notifications"]'));
});
