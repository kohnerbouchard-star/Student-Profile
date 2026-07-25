import {
  PROGRESSION_REWARD_ID_PATTERN,
  PROGRESSION_SKILL_ID_PATTERN,
  type PlayerProgressionRoute,
} from "../contracts/progressionContracts.ts";

const DIRECT_PREFIX = "/players/me/progression";
const DEPLOYED_EDGE_PREFIX = "/classroom-api/players/me/progression";
const PUBLIC_EDGE_PREFIX = "/functions/v1/classroom-api/players/me/progression";
const ROUTE_PREFIXES = Object.freeze([
  DIRECT_PREFIX,
  DEPLOYED_EDGE_PREFIX,
  PUBLIC_EDGE_PREFIX,
]);

export function readPlayerProgressionRoutePath(
  pathname: string,
): PlayerProgressionRoute | null {
  const normalized = normalize(pathname);
  const prefix = ROUTE_PREFIXES.find((candidate) =>
    normalized === candidate || normalized.startsWith(`${candidate}/`)
  ) ?? null;
  if (!prefix) return null;

  const suffix = normalized.slice(prefix.length);
  if (!suffix) return { kind: "read" };
  const segments = suffix.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "skills" && segments[2] === "unlock") {
    return PROGRESSION_SKILL_ID_PATTERN.test(segments[1] ?? "")
      ? { kind: "unlock", skillId: segments[1]! }
      : { kind: "malformed" };
  }
  if (segments.length === 3 && segments[0] === "rewards" && segments[2] === "claim") {
    return PROGRESSION_REWARD_ID_PATTERN.test(segments[1] ?? "")
      ? { kind: "claim", rewardId: segments[1]! }
      : { kind: "malformed" };
  }
  return { kind: "malformed" };
}

function normalize(pathname: string): string {
  const trimmed = pathname.trim().replace(/\/{2,}/g, "/");
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed || "/";
}
