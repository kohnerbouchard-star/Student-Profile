import { ApiRequestError } from "./errors.js";

export const PROGRESSION_BACKEND_ROUTE_KEYS = Object.freeze([
  "progression",
  "progressionUnlock",
  "progressionClaim",
]);

export function hasProgressionBackendRoute(endpointKey) {
  return PROGRESSION_BACKEND_ROUTE_KEYS.includes(endpointKey);
}

export function resolveProgressionBackendRequest({ endpointKey, payload = {}, params = {} }) {
  const required = (value, field) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
    throw new ApiRequestError(`${field} is required for ${endpointKey}.`, {
      body: { code: "player_route_context_missing", fieldName: field, endpointKey },
    });
  };
  const idempotencyKey = () => required(payload.idempotencyKey, "idempotencyKey");

  switch (endpointKey) {
    case "progression":
      return request(endpointKey, "GET", "/players/me/progression");
    case "progressionUnlock": {
      const skillId = required(params.skillId || payload.skillId, "skillId");
      return request(
        endpointKey,
        "POST",
        `/players/me/progression/skills/${encodeURIComponent(skillId)}/unlock`,
        { idempotencyKey: idempotencyKey() },
      );
    }
    case "progressionClaim": {
      const rewardId = required(params.rewardId || payload.rewardId, "rewardId");
      return request(
        endpointKey,
        "POST",
        `/players/me/progression/rewards/${encodeURIComponent(rewardId)}/claim`,
        { idempotencyKey: idempotencyKey() },
      );
    }
    default:
      throw new ApiRequestError(`No Progression backend route is registered for ${endpointKey}.`, {
        body: { code: "player_route_not_registered", endpointKey },
      });
  }
}

function request(endpointKey, method, path, payload) {
  return {
    endpointKey,
    method,
    path,
    payload,
    provisional: { method, path, payload },
  };
}
