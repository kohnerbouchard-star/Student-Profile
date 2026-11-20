import type { JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type { StoryCondition } from "../contracts/storyConditionContracts.ts";

export function evaluateStoryCondition(
  condition: StoryCondition,
  player: PlayerStoryContext,
): boolean {
  if ("all" in condition) return condition.all.every((child) => evaluateStoryCondition(child, player));
  if ("any" in condition) return condition.any.some((child) => evaluateStoryCondition(child, player));
  if ("not" in condition) return !evaluateStoryCondition(condition.not, player);

  switch (condition.type) {
    case "player_current_country_is":
      return readText(player.currentCountryCode) === condition.countryCode;
    case "player_home_country_is":
      return readText(player.homeCountryCode) === condition.countryCode;
    case "player_current_country_in":
      return condition.countryCodes.includes(readText(player.currentCountryCode) ?? "");
    case "player_home_country_in":
      return condition.countryCodes.includes(readText(player.homeCountryCode) ?? "");
    case "player_has_resource":
      return readNumberFromRecord(player.resources, condition.resourceKey) > 0;
    case "player_resource_quantity_at_least":
      return readNumberFromRecord(player.resources, condition.resourceKey) >= condition.quantity;
    case "player_portfolio_sector_exposure_at_least":
      return readNumberFromRecord(player.sectorExposurePct, condition.sector) >= condition.percent;
    case "player_portfolio_country_exposure_at_least":
      return readNumberFromRecord(player.countryExposurePct, condition.countryCode) >= condition.percent;
    case "player_cash_below": {
      const cashBalance = readFiniteNumber(player.cashBalance);
      return cashBalance !== null && cashBalance < condition.amount;
    }
    case "player_cash_above": {
      const cashBalance = readFiniteNumber(player.cashBalance);
      return cashBalance !== null && cashBalance > condition.amount;
    }
    case "player_completed_contract":
      return Array.isArray(player.completedContractKeys) && player.completedContractKeys.includes(condition.contractKey);
    case "player_story_decision_in": {
      const optionKey = readStoryDecisionAcrossRelationships(player.relationships, condition.decisionKey);
      return optionKey !== null && condition.optionKeys.includes(optionKey);
    }
    case "player_relationship_stage_is": {
      const relationship = readRelationship(player.relationships, condition.characterKey);
      return readText(relationship?.stage) === condition.stage;
    }
    case "player_relationship_reply_count_at_least": {
      const relationship = readRelationship(player.relationships, condition.characterKey);
      return readFiniteNumber(relationship?.replyCount) !== null &&
        (readFiniteNumber(relationship?.replyCount) ?? 0) >= condition.count;
    }
    case "player_relationship_trust_score": {
      const relationship = readRelationship(player.relationships, condition.characterKey);
      const trustScore = readFiniteNumber(relationship?.trustScore);
      if (trustScore === null) return false;
      return condition.operator === "at_least" ? trustScore >= condition.score : trustScore <= condition.score;
    }
    case "player_relationship_story_decision_in": {
      const relationship = readRelationship(player.relationships, condition.characterKey);
      const optionKey = readStoryDecisionFromRelationship(relationship, condition.decisionKey);
      return optionKey !== null && condition.optionKeys.includes(optionKey);
    }
    case "story_flag_equals":
      return readStoryFlag(player.storyFlags, condition.flagKey, condition.value);
  }
}

function readText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function readNumberFromRecord(record: unknown, key: string): number {
  if (!isRecord(record)) return 0;
  return readFiniteNumber(record[key]) ?? 0;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRelationship(relationships: unknown, characterKey: string): Record<string, unknown> | null {
  if (!isRecord(relationships)) return null;
  const relationship = relationships[characterKey];
  return isRecord(relationship) ? relationship : null;
}

function readStoryDecisionFromRelationship(
  relationship: Record<string, unknown> | null,
  decisionKey: string,
): string | null {
  const memory = isRecord(relationship?.memory) ? relationship.memory : null;
  const decisions = isRecord(memory?.storyDecisions) ? memory.storyDecisions : null;
  return readText(decisions?.[decisionKey]);
}

function readStoryDecisionAcrossRelationships(relationships: unknown, decisionKey: string): string | null {
  if (!isRecord(relationships)) return null;
  for (const characterKey of Object.keys(relationships).sort()) {
    const relationship = readRelationship(relationships, characterKey);
    const optionKey = readStoryDecisionFromRelationship(relationship, decisionKey);
    if (optionKey) return optionKey;
  }
  return null;
}

function readStoryFlag(flags: unknown, flagKey: string, expected: JsonValue): boolean {
  if (!isRecord(flags) || !Object.prototype.hasOwnProperty.call(flags, flagKey)) return false;
  return jsonValuesEqual(flags[flagKey], expected);
}

function jsonValuesEqual(left: unknown, right: JsonValue): boolean {
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return left === right;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return left.length === right.length && left.every((value, index) => jsonValuesEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && jsonValuesEqual(left[key], right[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
