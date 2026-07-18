import { createEmptyReadModels } from "../data/empty-read-models.js";

const EMPTY_DASHBOARD = Object.freeze({
  marketStatus: "UNAVAILABLE",
  netWorth: 0,
  dailyChange: 0,
  contractsActive: 0,
  contractsDueSoon: 0,
  worldEvents: Object.freeze([]),
  liquidBalance: 0,
  savingsBalance: 0,
  portfolioValue: 0,
  inventoryValue: 0,
  marketPulse: Object.freeze([])
});

export function unsupportedReadModel(resourceKey) {
  if (resourceKey === "dashboard") return EMPTY_DASHBOARD;
  const empty = createEmptyReadModels();
  return Object.hasOwn(empty, resourceKey) ? empty[resourceKey] : null;
}
