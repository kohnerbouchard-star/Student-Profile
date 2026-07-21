import {
  PROGRESSION_REWARD_ID_PATTERN,
  PROGRESSION_SKILL_ID_PATTERN,
  type PlayerProgressionRoute,
} from "../contracts/progressionContracts.ts";

const DIRECT_PREFIX = "/players/me/progression";
const EDGE_PREFIX = "/functions/v1/classroom-api/players/me/progression";

export function readPlayerProgressionRoutePath(
  pathname: string,
): PlayerProgressionRoute | null {
  const prefix = pathname === DIRECT_PREFIX || pathname.startsWith(`${DIRECT_PREFIX}/`)
    ? DIRECT_PREFIX
    : pathname === EDGE_PREFIX || pathname.startsWith(`${EDGE_PREFIX}/`)
    ? EDGE_PREFIX
    : null;
  if (!prefix) return null;

  const suffix = pathname.slice(prefix.length);
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
