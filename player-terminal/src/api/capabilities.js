import { ROUTES } from "../core/router.js";

export const PLAYER_ACTION_CAPABILITIES = Object.freeze([
  "bankingExport",
  "bankTransfer",
  "businessHire",
  "businessPrice",
  "businessProduction",
  "chartRange",
  "contractAccept",
  "contractSubmit",
  "craftItem",
  "inventoryUse",
  "loanApply",
  "loanRepay",
  "logout",
  "marketOrder",
  "marketSearch",
  "marketWatchlist",
  "marketplaceCancel",
  "marketplaceListing",
  "marketplacePurchase",
  "messageAttachment",
  "messageSearch",
  "messageSend",
  "notificationsRead",
  "progressionClaim",
  "progressionUnlock",
  "savingsTransfer",
  "storePurchase",
  "storyDeliveryState"
]);

const ENDPOINT_ACTIONS = Object.freeze({
  ...Object.fromEntries(
    PLAYER_ACTION_CAPABILITIES
      .filter((key) => !["bankingExport", "chartRange", "marketSearch", "messageAttachment", "messageSearch"].includes(key))
      .map((key) => [key, key])
  ),
  storeQuote: "storePurchase",
  storyDeliveries: "storyDeliveryState"
});

function capabilitySource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function explicitCapability(source, key, group) {
  if (Array.isArray(source[group])) return source[group].includes(key) ? true : undefined;
  const nested = capabilitySource(source[group]);
  if (typeof nested[key] === "boolean") return nested[key];
  if (typeof source[key] === "boolean") return source[key];
  return undefined;
}

function mergedCapability(sources, key, group) {
  for (const source of sources) {
    const value = explicitCapability(source, key, group);
    if (typeof value === "boolean") return value;
  }
  return false;
}

export function resolveCapabilities({ config, session, dashboard }) {
  const sources = [
    capabilitySource(config.capabilities),
    capabilitySource(dashboard?.capabilities),
    capabilitySource(session?.capabilities)
  ];
  const preview = config.usePreviewData === true;
  const routes = Object.fromEntries(ROUTES.map((route) => [
    route,
    route === "dashboard" || route === "profile" || preview
      ? true
      : mergedCapability(sources, route, "routes")
  ]));
  const actions = Object.fromEntries(PLAYER_ACTION_CAPABILITIES.map((action) => [
    action,
    preview || mergedCapability(sources, action, "actions")
  ]));

  return Object.freeze({ routes: Object.freeze(routes), actions: Object.freeze(actions) });
}

export function isRouteEnabled(capabilities, route) {
  return route === "dashboard" || route === "profile" || capabilities?.routes?.[route] === true;
}

export function isActionEnabled(capabilities, action) {
  return capabilities?.actions?.[action] === true;
}

export function isEndpointEnabled(capabilities, endpointKey) {
  const action = ENDPOINT_ACTIONS[endpointKey];
  return action ? isActionEnabled(capabilities, action) : false;
}
