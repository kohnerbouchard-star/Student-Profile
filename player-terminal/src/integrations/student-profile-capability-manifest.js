import { hasPlayerBackendRoute } from "../api/backend-routes.js";
import { ApiRequestError } from "../api/errors.js";

const SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_SERVICE = "classroom-api";

const ENDPOINT_COVERAGE = Object.freeze({
  capabilities: Object.freeze(["capabilities"]),
  contractAccept: Object.freeze(["contractAccept"]),
  contractSubmit: Object.freeze(["contractSubmit"]),
  contracts: Object.freeze(["contracts"]),
  countries: Object.freeze(["countries"]),
  country: Object.freeze(["country"]),
  inventory: Object.freeze(["inventory"]),
  inventoryRedemptions: Object.freeze(["inventoryUse"]),
  logout: Object.freeze(["logout"]),
  market: Object.freeze(["market"]),
  marketAsset: Object.freeze(["marketAsset"]),
  marketWatchlist: Object.freeze(["marketWatchlist"]),
  news: Object.freeze(["news"]),
  notifications: Object.freeze(["notifications"]),
  notificationsRead: Object.freeze(["notificationsRead"])
});

const ROUTE_REQUIREMENTS = Object.freeze({
  news: "news",
  market: "market",
  contracts: "contracts",
  inventory: "inventory"
});

const ACTION_REQUIREMENTS = Object.freeze({
  contractAccept: "contractAccept",
  contractSubmit: "contractSubmit",
  inventoryUse: "inventoryRedemptions",
  logout: "logout",
  marketWatchlist: "marketWatchlist",
  notificationsRead: "notificationsRead"
});

function mismatch(message, detail = {}) {
  return new ApiRequestError(message, {
    code: "CAPABILITY_CONTRACT_MISMATCH",
    endpointKey: "capabilities",
    body: { code: "capability_contract_mismatch", ...detail }
  });
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function validateCapabilityGroup(groupName, values, endpointKeys, requirements) {
  const group = object(values);
  if (!group) throw mismatch(`The ${groupName} capability group is missing.`);

  for (const [key, enabled] of Object.entries(group)) {
    if (typeof enabled !== "boolean") {
      throw mismatch(`Capability ${groupName}.${key} must be boolean.`, { groupName, key });
    }
    if (!enabled) continue;
    const endpointKey = requirements[key];
    if (!endpointKey) {
      throw mismatch(`Capability ${groupName}.${key} is advertised without reviewed frontend coverage.`, { groupName, key });
    }
    if (!endpointKeys.has(endpointKey)) {
      throw mismatch(`Capability ${groupName}.${key} is missing its endpoint descriptor.`, { groupName, key, endpointKey });
    }
  }
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

  const endpointKeys = new Set();
  for (const descriptor of manifest.endpoints) {
    const item = object(descriptor);
    const key = typeof item?.key === "string" ? item.key.trim() : "";
    if (!key || endpointKeys.has(key)) throw mismatch("Capability endpoint keys must be unique and non-empty.", { key });
    const frontendKeys = ENDPOINT_COVERAGE[key];
    if (!frontendKeys?.length || !frontendKeys.every(hasPlayerBackendRoute)) {
      throw mismatch(`Backend endpoint ${key} has no reviewed frontend route mapping.`, { key });
    }
    if (!Array.isArray(item.operations) || item.operations.length === 0) {
      throw mismatch(`Backend endpoint ${key} has no operations.`, { key });
    }
    for (const operation of item.operations) {
      const method = typeof operation?.method === "string" ? operation.method.trim().toUpperCase() : "";
      const pathTemplate = typeof operation?.pathTemplate === "string" ? operation.pathTemplate.trim() : "";
      if (!new Set(["DELETE", "GET", "POST", "PUT"]).has(method) || !pathTemplate.startsWith("/players/me/")) {
        throw mismatch(`Backend endpoint ${key} contains an invalid operation.`, { key, method, pathTemplate });
      }
    }
    endpointKeys.add(key);
  }

  const capabilities = object(manifest.capabilities);
  if (!capabilities) throw mismatch("The capability flags are missing.");
  validateCapabilityGroup("routes", capabilities.routes, endpointKeys, ROUTE_REQUIREMENTS);
  validateCapabilityGroup("actions", capabilities.actions, endpointKeys, ACTION_REQUIREMENTS);

  return Object.freeze({
    schemaVersion: manifest.schemaVersion,
    manifestVersion: manifest.manifestVersion.trim(),
    service: manifest.service,
    capabilities: Object.freeze({
      routes: Object.freeze({ ...capabilities.routes }),
      actions: Object.freeze({ ...capabilities.actions })
    }),
    endpoints: Object.freeze(manifest.endpoints.map((descriptor) => Object.freeze({
      key: descriptor.key,
      operations: Object.freeze(descriptor.operations.map((operation) => Object.freeze({
        method: operation.method,
        pathTemplate: operation.pathTemplate
      })))
    })))
  });
}
