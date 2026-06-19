import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

export function normalizeJoinCode(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "game_join_code_required",
      "gameJoinCode is required.",
      400,
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_game_join_code",
      "gameJoinCode may only contain letters, numbers, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}
