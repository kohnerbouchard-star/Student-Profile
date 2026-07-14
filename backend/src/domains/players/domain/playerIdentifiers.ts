import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

export function normalizePlayerIdentifier(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "player_identifier_required",
      "playerIdentifier is required.",
      400,
    );
  }

  if (normalizedValue.length > 128) {
    throw new EdgeActivationError(
      "player_identifier_too_long",
      "playerIdentifier must be 128 characters or fewer.",
      400,
    );
  }

  if (!/^[A-Z0-9:_-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_player_identifier",
      "playerIdentifier may only contain letters, numbers, colons, underscores, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}
