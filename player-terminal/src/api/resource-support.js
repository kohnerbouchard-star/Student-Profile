const RESOURCE_ENDPOINT_KEYS = Object.freeze({
  session: "session",
  dashboard: "dashboard",
  notifications: "notifications",
  countries: "countries",
  country: "country",
  news: "news",
  worldRuntime: "worldRuntime",
  market: "market",
  marketAsset: "marketAsset",
  portfolio: "portfolio",
  business: "business",
  contracts: "contracts",
  store: "store",
  marketplace: "marketplace",
  inventory: "inventory",
  crafting: "crafting",
  banking: "banking",
  loans: "loans",
  messages: "messages",
  progression: "progression"
});

function endpointKeySet(session) {
  const values = Array.isArray(session?.capabilityEndpointKeys)
    ? session.capabilityEndpointKeys
    : [];
  return new Set(values.map((value) => String(value || "").trim()).filter(Boolean));
}

export function createResourceSupport({ preview = false, session = null } = {}) {
  const manifestBound = Array.isArray(session?.capabilityEndpointKeys);
  const advertised = endpointKeySet(session);
  return Object.freeze(Object.fromEntries(
    Object.entries(RESOURCE_ENDPOINT_KEYS).map(([resourceKey, endpointKey]) => [
      resourceKey,
      preview || !manifestBound || resourceKey === "session" || advertised.has(endpointKey)
    ])
  ));
}

export function isResourceSupported(support, resourceKey) {
  return support?.[resourceKey] === true;
}
