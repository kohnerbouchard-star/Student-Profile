import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import {
  PROGRESSION_REWARD_ID_PATTERN,
  PROGRESSION_SKILL_ID_PATTERN,
  type PlayerProgressionRoute,
} from "../contracts/progressionContracts.ts";

export function readPlayerProgressionRoutePath(
  pathname: string,
): PlayerProgressionRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (
    !segments ||
    segments[0] !== "players" ||
    segments[1] !== "me" ||
    segments[2] !== "progression"
  ) {
    return null;
  }

  const suffix = segments.slice(3);
  if (suffix.length === 0) return { kind: "read" };
  if (suffix.length === 3 && suffix[0] === "skills" && suffix[2] === "unlock") {
    return PROGRESSION_SKILL_ID_PATTERN.test(suffix[1] ?? "")
      ? { kind: "unlock", skillId: suffix[1]! }
      : { kind: "malformed" };
  }
  if (suffix.length === 3 && suffix[0] === "rewards" && suffix[2] === "claim") {
    return PROGRESSION_REWARD_ID_PATTERN.test(suffix[1] ?? "")
      ? { kind: "claim", rewardId: suffix[1]! }
      : { kind: "malformed" };
  }
  return { kind: "malformed" };
}
