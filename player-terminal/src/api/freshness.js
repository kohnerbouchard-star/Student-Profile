const DEFAULT_FRESHNESS_MS = Object.freeze({
  session: 60_000,
  dashboard: 15_000,
  notifications: 15_000,
  countries: 300_000,
  country: 300_000,
  news: 30_000,
  market: 5_000,
  marketAsset: 5_000,
  portfolio: 10_000,
  business: 30_000,
  contracts: 15_000,
  store: 30_000,
  marketplace: 15_000,
  inventory: 15_000,
  crafting: 15_000,
  banking: 10_000,
  loans: 30_000,
  messages: 10_000,
  progression: 30_000
});

export const INVALIDATABLE_PLAYER_RESOURCES = Object.freeze(new Set(Object.keys(DEFAULT_FRESHNESS_MS)));

export function resourceFreshnessMs(endpointKey, overrides = {}) {
  const override = Number(overrides?.[endpointKey]);
  if (Number.isFinite(override) && override >= 0) return override;
  return DEFAULT_FRESHNESS_MS[endpointKey] ?? 30_000;
}

export function validInvalidationResources(values) {
  const input = Array.isArray(values) ? values : [];
  return [...new Set(input
    .map((value) => String(value || "").trim())
    .filter((value) => INVALIDATABLE_PLAYER_RESOURCES.has(value)))];
}
