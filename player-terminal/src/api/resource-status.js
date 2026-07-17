export function resourceState(data, endpointKey) {
  return String(data?.resourceStatus?.[endpointKey]?.state || "unknown");
}

export function isResourceReady(data, endpointKey) {
  return resourceState(data, endpointKey) === "ready";
}

export function isResourceUnavailable(data, endpointKey) {
  return resourceState(data, endpointKey) === "unavailable";
}

export function resourceValue(data, endpointKey, value, fallback = "Unavailable") {
  return isResourceUnavailable(data, endpointKey) ? fallback : value;
}
