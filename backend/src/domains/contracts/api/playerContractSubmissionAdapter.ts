/// <reference lib="dom" />

import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import type { JsonObject } from "../../../supabase/tableTypes.ts";

const STORY_DECISION_CONTRACT_KEYS = new Set([
  "contract.meridian.compare-financing-governance.v1",
  "contract.meridian.belonging-long-term-status-decision.v1",
]);
const MAX_BODY_LENGTH = 20_000;
const MAX_JSON_DEPTH = 8;
const MAX_OBJECT_KEYS = 80;
const MAX_ARRAY_LENGTH = 200;
const MAX_STRING_LENGTH = 4_000;
const MIN_STORY_RATIONALE_LENGTH = 20;


// Classification does not dispatch a second write: Story capture belongs to the
// existing progress AFTER trigger. Call semantic validation only after auth and availability.
export function isStoryDecisionContract(contractKey: string): boolean {
  return STORY_DECISION_CONTRACT_KEYS.has(contractKey);
}

// Transport parsing must remain before session resolution. Keep evidence verbatim;
// Story checks trim only for validation, never to rewrite the stored payload.
export async function readPlayerContractSubmissionBody(request: Request): Promise<{ readonly evidencePayload: JsonObject }> {
  const text = await request.text();
  if (!text.trim()) return { evidencePayload: {} };
  if (text.length > MAX_BODY_LENGTH) throw invalidRequest("Contract evidence is too large.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw invalidRequest("Request body must be valid JSON."); }
  if (!isRecord(value)) throw invalidRequest("Request body must be a JSON object.");
  for (const key of Object.keys(value)) {
    if (key !== "evidencePayload") throw invalidRequest("Only evidencePayload is accepted; Contract and player scope come from the route and session.");
  }
  const evidencePayload = value.evidencePayload ?? {};
  if (!isRecord(evidencePayload)) throw invalidRequest("evidencePayload must be a JSON object.");
  assertBoundedJson(evidencePayload, 0);
  return { evidencePayload: evidencePayload as JsonObject };
}

export function assertValidStoryDecisionEvidence(evidencePayload: JsonObject): void {
  const storyDecision = evidencePayload.storyDecision;
  if (!isRecord(storyDecision)) throw invalidRequest("Choose a Story response and explain your reasoning before submitting.");
  const optionKey = typeof storyDecision.optionKey === "string" ? storyDecision.optionKey.trim() : "";
  const rationale = typeof storyDecision.rationale === "string" ? storyDecision.rationale.trim() : "";
  if (!optionKey || !/^[a-z0-9_]{2,80}$/.test(optionKey)) throw invalidRequest("Choose one of the available Story responses.");
  if (rationale.length < MIN_STORY_RATIONALE_LENGTH) throw invalidRequest("Explain your reasoning in at least 20 characters before continuing the conversation.");
  if (rationale.length > MAX_STRING_LENGTH) throw invalidRequest("Story rationale text is too long.");
}

function assertBoundedJson(value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) throw invalidRequest("Contract evidence is too deeply nested.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalidRequest("Contract evidence contains an invalid number.");
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) throw invalidRequest("Contract evidence text is too long.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw invalidRequest("Contract evidence contains too many entries.");
    value.forEach((item) => assertBoundedJson(item, depth + 1));
    return;
  }
  if (!isRecord(value)) throw invalidRequest("Contract evidence contains an unsupported value.");
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) throw invalidRequest("Contract evidence contains too many fields.");
  for (const [key, nested] of entries) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw invalidRequest("Contract evidence contains an invalid field.");
    assertBoundedJson(nested, depth + 1);
  }
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError("invalid_player_contract_submit_request", message, 400, false);
}
