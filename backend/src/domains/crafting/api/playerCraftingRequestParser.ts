/// <reference lib="dom" />

import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type EquipItemCommand,
  type IdempotentCraftingCommand,
  PlayerCraftingError,
  type PlayerCraftingRoute,
  type StartCraftingJobCommand,
  type UseItemEffectCommand,
} from "../contracts/playerCraftingContracts.ts";

const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RECIPE = /^recipe\.[a-z0-9][a-z0-9._-]{2,127}$/;
const ITEM = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SLOT = /^[a-z][a-z0-9_-]{1,31}$/;
const SUBSTITUTION = /^[a-z][a-z0-9._-]{1,63}$/;
const MAX_BODY_BYTES = 16_384;
const SCOPE_HEADERS = [
  "x-econovaria-game-id",
  "x-econovaria-game-session-id",
  "x-stock-market-runner-secret",
] as const;

export async function parsePlayerCraftingCommand(
  request: Request,
  route: PlayerCraftingRoute,
): Promise<StartCraftingJobCommand | IdempotentCraftingCommand | UseItemEffectCommand | EquipItemCommand> {
  rejectScopeHeaders(request);
  if (new URL(request.url).searchParams.size) throw invalid("Crafting mutations do not accept query parameters.");
  const value = await readObject(request);

  if (route.kind === "startJob") {
    requireExactKeys(value, ["recipeKey", "quantity", "substitutions", "idempotencyKey"]);
    const recipeKey = typeof value.recipeKey === "string" ? value.recipeKey.trim().toLowerCase() : "";
    const quantity = value.quantity;
    if (!RECIPE.test(recipeKey)) throw invalid("recipeKey is invalid.");
    if (!Number.isSafeInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 25) {
      throw invalid("quantity must be an integer from 1 through 25.");
    }
    const substitutionsValue = value.substitutions ?? {};
    if (!isRecord(substitutionsValue)) throw invalid("substitutions must be an object.");
    const substitutions: Record<string, string> = {};
    for (const [group, itemKeyValue] of Object.entries(substitutionsValue)) {
      const itemKey = typeof itemKeyValue === "string" ? itemKeyValue.trim().toLowerCase() : "";
      if (!SUBSTITUTION.test(group) || !ITEM.test(itemKey)) throw invalid("A substitution key or item is invalid.");
      substitutions[group] = itemKey;
    }
    return {
      recipeKey,
      quantity: Number(quantity),
      substitutions,
      idempotencyKey: readIdempotency(value.idempotencyKey),
    };
  }

  if (route.kind === "useItem") {
    requireExactKeys(value, ["targetKey", "idempotencyKey"], ["targetKey"]);
    const targetKey = value.targetKey === null || value.targetKey === undefined
      ? null
      : typeof value.targetKey === "string" && value.targetKey.trim().length <= 128
      ? value.targetKey.trim()
      : (() => { throw invalid("targetKey is invalid."); })();
    return { targetKey, idempotencyKey: readIdempotency(value.idempotencyKey) };
  }

  if (route.kind === "equip") {
    requireExactKeys(value, ["slot", "idempotencyKey"]);
    const slot = typeof value.slot === "string" ? value.slot.trim().toLowerCase() : "";
    if (!SLOT.test(slot)) throw invalid("slot is invalid.");
    return { slot, idempotencyKey: readIdempotency(value.idempotencyKey) };
  }

  requireExactKeys(value, ["idempotencyKey"]);
  return { idempotencyKey: readIdempotency(value.idempotencyKey) };
}

export function validatePlayerCraftingRead(request: Request): void {
  rejectScopeHeaders(request);
  if (new URL(request.url).searchParams.size) throw invalid("Crafting reads do not accept query parameters.");
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim() || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw invalid("Provide a valid crafting JSON object.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid("Provide a valid crafting JSON object.");
  }
  if (!isRecord(value)) throw invalid("Request body must be a JSON object.");
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  accepted: readonly string[],
  optional: readonly string[] = [],
): void {
  const keys = Object.keys(value);
  const acceptedSet = new Set(accepted);
  if (keys.some((key) => !acceptedSet.has(key))) throw invalid("Crafting request contains unsupported fields.");
  for (const key of accepted) {
    if (!optional.includes(key) && !keys.includes(key)) throw invalid(`Crafting request requires ${key}.`);
  }
}

function readIdempotency(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY.test(key)) throw invalid("idempotencyKey must use 1 to 128 safe public characters.");
  return key;
}

function rejectScopeHeaders(request: Request): void {
  if (SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalid("Crafting scope derives only from the authenticated player session.");
  }
}

function invalid(message: string): PlayerCraftingError {
  return new PlayerCraftingError("invalid_player_crafting_request", message, 400, false);
}
