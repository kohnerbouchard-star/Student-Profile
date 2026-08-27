import {
  MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN,
  type PlayerMarketplaceFundingAllocationInput,
} from "../contracts/playerMarketplaceFundingContracts.ts";
import { PlayerMarketplaceError } from "../contracts/playerMarketplaceContracts.ts";

export function readMarketplaceFundingAllocations(
  value: unknown,
): readonly PlayerMarketplaceFundingAllocationInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw invalid("Choose between one and three Checking accounts.");
  }

  const seen = new Set<string>();
  const result = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw invalid("Marketplace funding allocation is invalid.");
    }

    const row = entry as Record<string, unknown>;
    const keys = Object.keys(row);
    if (
      keys.length !== 2 ||
      !keys.includes("sourceAccountKey") ||
      !keys.includes("targetAmount")
    ) {
      throw invalid("Marketplace funding allocation is invalid.");
    }

    const sourceAccountKey = typeof row.sourceAccountKey === "string"
      ? row.sourceAccountKey.trim().toLowerCase()
      : "";
    const targetAmount = Number(row.targetAmount);
    if (
      !MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN.test(sourceAccountKey) ||
      seen.has(sourceAccountKey)
    ) {
      throw invalid("Marketplace funding accounts must be valid and unique.");
    }
    if (
      !Number.isFinite(targetAmount) || targetAmount <= 0 ||
      targetAmount > 999_999_999_999_999
    ) {
      throw invalid("Marketplace funding target amount is invalid.");
    }

    seen.add(sourceAccountKey);
    return Object.freeze({ sourceAccountKey, targetAmount });
  });

  return Object.freeze(result);
}

export function readMarketplaceClientTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw invalid("clientSubmittedAt is invalid.");
  }
  return new Date(value).toISOString();
}

function invalid(message: string): PlayerMarketplaceError {
  return new PlayerMarketplaceError(
    "invalid_player_marketplace_request",
    message,
    400,
  );
}
