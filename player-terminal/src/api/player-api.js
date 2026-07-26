import { PLAYER_ENDPOINTS } from "./endpoints.js";
import { PlayerApi as CorePlayerApi } from "./player-api-core.js";

function actionPathParams(endpointKey, payload, params = {}) {
  const endpoint = PLAYER_ENDPOINTS[endpointKey];
  if (!endpoint || typeof endpoint.path !== "string") return { ...params };

  const resolved = { ...params };
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  for (const match of endpoint.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)) {
    const key = match[1];
    if (resolved[key] !== undefined && resolved[key] !== null && String(resolved[key]).trim()) continue;
    const value = source[key];
    if (value === undefined || value === null || !String(value).trim()) continue;
    resolved[key] = value;
  }
  return resolved;
}

function adapterPayload(payload, params) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const resolved = { ...payload };
  for (const [key, value] of Object.entries(params || {})) {
    if (Object.hasOwn(resolved, key)) continue;
    if (value === undefined || value === null || !String(value).trim()) continue;
    resolved[key] = value;
  }
  return resolved;
}

export class PlayerApi extends CorePlayerApi {
  execute(endpointKey, payload, params = {}, options = {}) {
    const resolvedParams = actionPathParams(endpointKey, payload, params);
    return super.execute(
      endpointKey,
      adapterPayload(payload, resolvedParams),
      resolvedParams,
      options,
    );
  }
}
