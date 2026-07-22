import { ApiRequestError } from "./errors.js";

export const CRAFTING_BACKEND_ROUTE_KEYS = Object.freeze([
  "crafting",
  "craftItem",
  "craftCancel",
  "craftClaim",
  "itemEffectUse",
  "equipmentEquip",
  "itemSalvage",
]);

export function hasCraftingBackendRoute(endpointKey) {
  return CRAFTING_BACKEND_ROUTE_KEYS.includes(endpointKey);
}

export function resolveCraftingBackendRequest({ endpointKey, payload = {}, params = {} }) {
  const required = (value, field) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
    throw new ApiRequestError(`${field} is required for ${endpointKey}.`, {
      body: { code: "player_route_context_missing", fieldName: field, endpointKey },
    });
  };
  const idempotencyKey = () => required(payload.idempotencyKey, "idempotencyKey");

  switch (endpointKey) {
    case "crafting":
      return request(endpointKey, "GET", "/players/me/crafting");
    case "craftItem":
      return request(endpointKey, "POST", "/players/me/crafting/jobs", {
        recipeKey: required(params.recipeId || payload.recipeKey || payload.recipeId, "recipeKey"),
        quantity: Number(payload.quantity ?? 1),
        substitutions: payload.substitutions && typeof payload.substitutions === "object" && !Array.isArray(payload.substitutions)
          ? payload.substitutions
          : {},
        idempotencyKey: idempotencyKey(),
      });
    case "craftCancel": {
      const jobKey = required(params.jobKey || payload.jobKey, "jobKey");
      return request(endpointKey, "POST", `/players/me/crafting/jobs/${encodeURIComponent(jobKey)}/cancel`, {
        idempotencyKey: idempotencyKey(),
      });
    }
    case "craftClaim": {
      const jobKey = required(params.jobKey || payload.jobKey, "jobKey");
      return request(endpointKey, "POST", `/players/me/crafting/jobs/${encodeURIComponent(jobKey)}/claim`, {
        idempotencyKey: idempotencyKey(),
      });
    }
    case "itemEffectUse": {
      const itemKey = required(params.itemKey || payload.itemKey, "itemKey");
      return request(endpointKey, "POST", `/players/me/items/${encodeURIComponent(itemKey)}/use`, {
        targetKey: typeof payload.targetKey === "string" ? payload.targetKey.trim() : null,
        idempotencyKey: idempotencyKey(),
      });
    }
    case "equipmentEquip": {
      const equipmentKey = required(params.equipmentKey || payload.equipmentKey, "equipmentKey");
      return request(endpointKey, "POST", `/players/me/equipment/${encodeURIComponent(equipmentKey)}/equip`, {
        slot: required(payload.slot, "slot"),
        idempotencyKey: idempotencyKey(),
      });
    }
    case "itemSalvage": {
      const equipmentKey = required(params.equipmentKey || payload.equipmentKey, "equipmentKey");
      return request(endpointKey, "POST", `/players/me/equipment/${encodeURIComponent(equipmentKey)}/salvage`, {
        idempotencyKey: idempotencyKey(),
      });
    }
    default:
      throw new ApiRequestError(`No Crafting backend route is registered for ${endpointKey}.`, {
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
