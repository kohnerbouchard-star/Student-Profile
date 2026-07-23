import { hasPlayerBackendRoute } from "../api/backend-routes.js";
import { hasMarketplaceBackendRoute } from "../api/marketplace-backend-routes.js";
import { ApiRequestError } from "../api/errors.js";

const SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_SERVICE = "classroom-api";
const CORE_ENDPOINT_KEYS = new Set(["bootstrap", "capabilities", "dashboard", "countries"]);

const ENDPOINT_COVERAGE = Object.freeze({
  bootstrap: Object.freeze(["session"]),
  capabilities: Object.freeze(["capabilities"]),
  worldRuntime: Object.freeze(["worldRuntime"]),
  arrivalClass: Object.freeze(["arrivalClass"]),
  travelQuote: Object.freeze(["travelQuote"]),
  travelExecute: Object.freeze(["travelExecute"]),
  travelComplete: Object.freeze(["travelComplete"]),
  residencyRequest: Object.freeze(["residencyRequest"]),
  banking: Object.freeze(["banking"]),
  bankTransfer: Object.freeze(["bankTransfer"]),
  business: Object.freeze(["business"]),
  businessCreate: Object.freeze(["businessCreate"]),
  businessHire: Object.freeze(["businessHire"]),
  businessInputPurchase: Object.freeze(["businessInputPurchase"]),
  businessPrice: Object.freeze(["businessPrice"]),
  businessProductCreate: Object.freeze(["businessProductCreate"]),
  businessProduction: Object.freeze(["businessProduction"]),
  businessStatus: Object.freeze(["businessStatus"]),
  businessTerminate: Object.freeze(["businessTerminate"]),
  contractAccept: Object.freeze(["contractAccept"]),
  contractSubmit: Object.freeze(["contractSubmit"]),
  contracts: Object.freeze(["contracts"]),
  countries: Object.freeze(["countries"]),
  country: Object.freeze(["country"]),
  dashboard: Object.freeze(["dashboard"]),
  inventory: Object.freeze(["inventory"]),
  inventoryRedemptions: Object.freeze(["inventoryUse"]),
  loanApply: Object.freeze(["loanApply"]),
  loanRepay: Object.freeze(["loanRepay"]),
  loans: Object.freeze(["loans"]),
  logout: Object.freeze(["logout"]),
  market: Object.freeze(["market"]),
  marketAsset: Object.freeze(["marketAsset"]),
  marketOrder: Object.freeze(["marketOrder"]),
  marketWatchlist: Object.freeze(["marketWatchlist"]),
  marketplace: Object.freeze(["marketplace"]),
  marketplaceListing: Object.freeze(["marketplaceListing"]),
  marketplaceActivate: Object.freeze(["marketplaceActivate"]),
  marketplacePurchase: Object.freeze(["marketplacePurchase"]),
  marketplaceCancel: Object.freeze(["marketplaceCancel"]),
  marketplaceDispute: Object.freeze(["marketplaceDispute"]),
  messages: Object.freeze(["messages"]),
  messageThread: Object.freeze(["messageThread"]),
  messagePolicy: Object.freeze(["messagePolicy"]),
  messageSearch: Object.freeze(["messageSearch"]),
  messageThreadCreate: Object.freeze(["messageThreadCreate"]),
  messageSend: Object.freeze(["messageSend"]),
  messageRead: Object.freeze(["messageRead"]),
  news: Object.freeze(["news"]),
  notifications: Object.freeze(["notifications"]),
  notificationsRead: Object.freeze(["notificationsRead"]),
  portfolio: Object.freeze(["portfolio"]),
  savingsTransfer: Object.freeze(["savingsTransfer"]),
  store: Object.freeze(["store"]),
  storeQuote: Object.freeze(["storeQuote"]),
  storePurchase: Object.freeze(["storePurchase"]),
  storyDeliveries: Object.freeze(["storyDeliveries"]),
  storyDeliveryState: Object.freeze(["storyDeliveryState"]),
  crafting: Object.freeze(["crafting", "craftItem"]),
  craftingJobCancel: Object.freeze(["craftCancel"]),
  craftingJobClaim: Object.freeze(["craftClaim"]),
  itemEffectUse: Object.freeze(["itemEffectUse"]),
  equipmentEquip: Object.freeze(["equipmentEquip"]),
  equipmentSalvage: Object.freeze(["itemSalvage"]),
  progression: Object.freeze(["progression"]),
  progressionUnlock: Object.freeze(["progressionUnlock"]),
  progressionClaim: Object.freeze(["progressionClaim"])
});

const ROUTE_REQUIREMENTS = Object.freeze({
  dashboard: "dashboard",
  world: "worldRuntime",
  news: "news",
  banking: "banking",
  business: "business",
  loans: "loans",
  market: "market",
  portfolio: "portfolio",
  contracts: "contracts",
  inventory: "inventory",
  store: "store",
  marketplace: "marketplace",
  messages: "messages",
  crafting: "crafting",
  progression: "progression",
  profile: "bootstrap"
});

const ACTION_REQUIREMENTS = Object.freeze({
  arrivalClassSubmit: "arrivalClass",
  bankTransfer: "bankTransfer",
  businessCreate: "businessCreate",
  businessEmployeeTerminate: "businessTerminate",
  businessHire: "businessHire",
  businessInputPurchase: "businessInputPurchase",
  businessPrice: "businessPrice",
  businessProductCreate: "businessProductCreate",
  businessProduction: "businessProduction",
  businessStatus: "businessStatus",
  contractAccept: "contractAccept",
  contractSubmit: "contractSubmit",
  inventoryUse: "inventoryRedemptions",
  loanApply: "loanApply",
  loanRepay: "loanRepay",
  logout: "logout",
  marketOrder: "marketOrder",
  marketWatchlist: "marketWatchlist",
  marketplaceListing: "marketplaceListing",
  marketplaceActivate: "marketplaceActivate",
  marketplacePurchase: "marketplacePurchase",
  marketplaceCancel: "marketplaceCancel",
  marketplaceDispute: "marketplaceDispute",
  messageSearch: "messageSearch",
  messageSend: "messageSend",
  notificationsRead: "notificationsRead",
  residencyRequest: "residencyRequest",
  savingsTransfer: "savingsTransfer",
  storePurchase: "storePurchase",
  storyDeliveryState: "storyDeliveryState",
  travelComplete: "travelComplete",
  travelExecute: "travelExecute",
  travelQuote: "travelQuote",
  craftItem: "crafting",
  craftCancel: "craftingJobCancel",
  craftClaim: "craftingJobClaim",
  equipmentEquip: "equipmentEquip",
  itemEffectUse: "itemEffectUse",
  itemSalvage: "equipmentSalvage",
  progressionUnlock: "progressionUnlock",
  progressionClaim: "progressionClaim"
});

function reviewedFrontendRoute(key) {
  return hasPlayerBackendRoute(key) || hasMarketplaceBackendRoute(key);
}

function mismatch(message, detail = {}) {
  return new ApiRequestError(message, {
    code: "CAPABILITY_CONTRACT_MISMATCH",
    endpointKey: "capabilities",
    detail
  });
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function coreEndpointFailure(endpointKey, message, detail = {}) {
  if (CORE_ENDPOINT_KEYS.has(endpointKey)) throw mismatch(message, { endpointKey, ...detail });
  return null;
}

function validateCapabilityGroup(groupName, values, endpointKeys, requirements) {
  const group = object(values);
  if (!group) throw mismatch(`The ${groupName} capability group is missing.`, { groupName });

  const reviewed = {};
  for (const [key, enabled] of Object.entries(group)) {
    const endpointKey = requirements[key];
    if (!endpointKey) continue;

    if (typeof enabled !== "boolean") {
      if (CORE_ENDPOINT_KEYS.has(endpointKey)) {
        throw mismatch(`Capability ${groupName}.${key} must be boolean.`, { groupName, key, endpointKey });
      }
      reviewed[key] = false;
      continue;
    }

    if (enabled && !endpointKeys.has(endpointKey)) {
      if (CORE_ENDPOINT_KEYS.has(endpointKey)) {
        throw mismatch(`Capability ${groupName}.${key} is missing its endpoint descriptor.`, {
          groupName,
          key,
          endpointKey
        });
      }
      reviewed[key] = false;
      continue;
    }
    reviewed[key] = enabled;
  }

  for (const key of Object.keys(requirements)) {
    if (!Object.hasOwn(reviewed, key)) reviewed[key] = false;
  }
  return Object.freeze(reviewed);
}

export function validateStudentProfileCapabilityManifest(raw) {
  const manifest = object(raw);
  if (!manifest) throw mismatch("The capability manifest is missing.");
  if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw mismatch("The capability schema version is not supported.", {
      expectedSchemaVersion: SUPPORTED_SCHEMA_VERSION,
      receivedSchemaVersion: manifest.schemaVersion
    });
  }
  if (manifest.service !== SUPPORTED_SERVICE) {
    throw mismatch("The capability manifest service is not supported.", {
      expectedService: SUPPORTED_SERVICE,
      receivedService: manifest.service
    });
  }
  if (typeof manifest.manifestVersion !== "string" || !manifest.manifestVersion.trim()) {
    throw mismatch("The capability manifest version is missing.");
  }
  if (!Array.isArray(manifest.endpoints)) throw mismatch("The capability endpoint registry is missing.");

  const seenEndpointKeys = new Set();
  const reviewedEndpointKeys = new Set();
  const reviewedEndpoints = [];

  for (const descriptor of manifest.endpoints) {
    const item = object(descriptor);
    const key = typeof item?.key === "string" ? item.key.trim() : "";
    if (!key || seenEndpointKeys.has(key)) {
      throw mismatch("Capability endpoint keys must be unique and non-empty.", { key });
    }
    seenEndpointKeys.add(key);

    const frontendKeys = ENDPOINT_COVERAGE[key];
    if (!frontendKeys?.length) continue;
    if (!frontendKeys.every(reviewedFrontendRoute)) {
      coreEndpointFailure(key, `Backend endpoint ${key} has no reviewed frontend route mapping.`, { key });
      continue;
    }
    if (!Array.isArray(item.operations) || item.operations.length === 0) {
      coreEndpointFailure(key, `Backend endpoint ${key} has no operations.`, { key });
      continue;
    }

    const operations = [];
    let valid = true;
    for (const operation of item.operations) {
      const method = typeof operation?.method === "string" ? operation.method.trim().toUpperCase() : "";
      const pathTemplate = typeof operation?.pathTemplate === "string" ? operation.pathTemplate.trim() : "";
      const isPlayerPath = pathTemplate === "/players/me" || pathTemplate.startsWith("/players/me/");
      if (!new Set(["DELETE", "GET", "POST", "PUT"]).has(method) || !isPlayerPath) {
        coreEndpointFailure(key, `Backend endpoint ${key} contains an invalid operation.`, {
          key,
          method,
          pathTemplate
        });
        valid = false;
        break;
      }
      operations.push(Object.freeze({ method, pathTemplate }));
    }
    if (!valid) continue;

    reviewedEndpointKeys.add(key);
    reviewedEndpoints.push(Object.freeze({ key, operations: Object.freeze(operations) }));
  }

  for (const key of CORE_ENDPOINT_KEYS) {
    if (!reviewedEndpointKeys.has(key)) {
      throw mismatch(`The core endpoint ${key} is missing or invalid.`, { endpointKey: key, key });
    }
  }

  const capabilities = object(manifest.capabilities);
  if (!capabilities) throw mismatch("The capability flags are missing.");
  const routes = validateCapabilityGroup(
    "routes",
    capabilities.routes,
    reviewedEndpointKeys,
    ROUTE_REQUIREMENTS
  );
  const actions = validateCapabilityGroup(
    "actions",
    capabilities.actions,
    reviewedEndpointKeys,
    ACTION_REQUIREMENTS
  );

  return Object.freeze({
    schemaVersion: manifest.schemaVersion,
    manifestVersion: manifest.manifestVersion.trim(),
    service: manifest.service,
    capabilities: Object.freeze({ routes, actions }),
    endpoints: Object.freeze(reviewedEndpoints)
  });
}
