import {
  buildPlayerCapabilityManifest,
  PLAYER_ACTION_CAPABILITY_KEYS,
  PLAYER_CAPABILITY_MANIFEST_VERSION,
  PLAYER_CAPABILITY_SCHEMA_VERSION,
  PLAYER_ROUTE_CAPABILITY_KEYS,
  type PlayerCapabilityEndpointKey,
} from "./playerCapabilityManifestContracts.ts";
import { readPlayerCapabilityManifestRoutePath } from "../api/playerCapabilityManifestRoutePaths.ts";
import { readPlayerBankingPublicRoutePath } from "../../economy/api/playerBankingPublicRoutePaths.ts";
import { readPlayerSessionLogoutRoutePath } from "../api/playerSessionLogoutRoutePaths.ts";
import { readPlayerWorldRoutePath } from "../../countries/api/playerWorldRoutePaths.ts";
import { readPlayerContractAcceptanceRoutePath } from "../../contracts/api/playerContractAcceptanceRoutePaths.ts";
import { readPlayerContractPublicListRoutePath } from "../../contracts/api/playerContractPublicListRoutePaths.ts";
import { readPlayerContractPublicSubmitRoutePath } from "../../contracts/api/playerContractPublicSubmitRoutePaths.ts";
import { readPlayerInventoryRoutePath } from "../../inventory/api/playerInventoryRoutePaths.ts";
import { readPlayerInventoryRedemptionRoutePath } from "../../inventory/api/playerInventoryRedemptionRoutePaths.ts";
import { readPlayerNotificationRoutePath } from "../../notifications/api/playerNotificationRoutePaths.ts";
import { readPlayerStoryDeliveryRoutePath } from "../../notifications/api/playerStoryDeliveryRoutePaths.ts";
import { readPlayerStockAssetListRoutePath } from "../../stocks/api/playerStockAssetListRoutePaths.ts";
import { readPlayerStockMarketPublicRoutePath } from "../../stocks/api/playerStockMarketPublicRoutePaths.ts";
import { readPlayerStorePublicRoutePath } from "../../store/api/playerStorePublicRoutePaths.ts";
import { readPlayerBusinessBankingRoutePath } from "../../business-banking/api/playerBusinessBankingRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const BUSINESS_BANKING_ENDPOINTS = new Set<PlayerCapabilityEndpointKey>([
  "business",
  "businessCreate",
  "businessProductCreate",
  "businessInputPurchase",
  "businessProduction",
  "businessPrice",
  "businessHire",
  "businessTerminate",
  "businessStatus",
  "bankTransfer",
  "savingsTransfer",
  "loans",
  "loanApply",
  "loanRepay",
]);

Deno.test("player capability manifest is generated from the reviewed endpoint allowlist", () => {
  const manifest = buildPlayerCapabilityManifest();

  assertEquals(manifest.schemaVersion, PLAYER_CAPABILITY_SCHEMA_VERSION);
  assertEquals(manifest.manifestVersion, PLAYER_CAPABILITY_MANIFEST_VERSION);
  assertEquals(manifest.service, "classroom-api");
  assertEquals(Object.keys(manifest.capabilities.routes), [
    ...PLAYER_ROUTE_CAPABILITY_KEYS,
  ]);
  assertEquals(Object.keys(manifest.capabilities.actions), [
    ...PLAYER_ACTION_CAPABILITY_KEYS,
  ]);

  for (const route of [
    "dashboard",
    "profile",
    "news",
    "market",
    "portfolio",
    "contracts",
    "inventory",
    "store",
    "banking",
    "business",
    "loans",
  ] as const) {
    assertEquals(manifest.capabilities.routes[route], true);
  }

  for (const action of [
    "marketWatchlist",
    "notificationsRead",
    "logout",
    "contractAccept",
    "contractSubmit",
    "inventoryUse",
    "marketOrder",
    "storePurchase",
    "storyDeliveryState",
    "bankTransfer",
    "savingsTransfer",
    "businessCreate",
    "businessProductCreate",
    "businessInputPurchase",
    "businessProduction",
    "businessPrice",
    "businessHire",
    "businessEmployeeTerminate",
    "businessStatus",
    "loanApply",
    "loanRepay",
  ] as const) {
    assertEquals(manifest.capabilities.actions[action], true);
  }

  const endpointKeys = manifest.endpoints.map((endpoint) => endpoint.key);
  assertEquals(new Set(endpointKeys).size, endpointKeys.length);
  const expectedEndpointKeys: readonly PlayerCapabilityEndpointKey[] = [
    "bootstrap",
    "capabilities",
    "banking",
    "contractAccept",
    "contractSubmit",
    "contracts",
    "dashboard",
    "inventoryRedemptions",
    "marketOrder",
    "portfolio",
    "store",
    "storeQuote",
    "storePurchase",
    "storyDeliveries",
    "storyDeliveryState",
    ...BUSINESS_BANKING_ENDPOINTS,
  ];
  for (const endpoint of expectedEndpointKeys) {
    assertEquals(endpointKeys.includes(endpoint), true);
  }
});

Deno.test("player capability manifest contains no UUID-shaped identifiers", () => {
  const serialized = JSON.stringify(buildPlayerCapabilityManifest());
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(serialized)
  ) {
    throw new Error(`UUID leaked in capability manifest: ${serialized}`);
  }
});

Deno.test("every advertised endpoint path is recognized by the authoritative dispatch boundary", () => {
  const operations = buildPlayerCapabilityManifest().endpoints.flatMap((
    endpoint,
  ) =>
    endpoint.operations.map((operation) => ({
      key: endpoint.key,
      path: operation.pathTemplate
        .replace(":contractKey", "arrival-orientation")
        .replace(":countryCode", "NR")
        .replace(":ticker", "AURA")
        .replace(":itemId", "meal-pass")
        .replace(":requestId", `red_${"a".repeat(32)}`)
        .replace(":deliveryId", `ndl_${"a".repeat(32)}`)
        .replace(":productKey", `bpr_${"a".repeat(32)}`)
        .replace(":employeeKey", `emp_${"a".repeat(32)}`)
        .replace(":offerKey", `lop_${"a".repeat(32)}`)
        .replace(":loanKey", `lon_${"a".repeat(32)}`),
    }))
  );

  for (const operation of operations) {
    const parsed = operation.key === "bootstrap"
      ? operation.path === "/players/me" ? { kind: "bootstrap" } : null
      : operation.key === "dashboard"
      ? operation.path === "/players/me/game/dashboard"
        ? { kind: "dashboard" }
        : null
      : operation.key === "capabilities"
      ? readPlayerCapabilityManifestRoutePath(operation.path)
      : BUSINESS_BANKING_ENDPOINTS.has(operation.key)
      ? readPlayerBusinessBankingRoutePath(operation.path)
      : operation.key === "banking"
      ? readPlayerBankingPublicRoutePath(operation.path)
      : operation.key === "contractAccept"
      ? readPlayerContractAcceptanceRoutePath(operation.path)
      : operation.key === "contractSubmit"
      ? readPlayerContractPublicSubmitRoutePath(operation.path)
      : operation.key === "contracts"
      ? readPlayerContractPublicListRoutePath(operation.path)
      : operation.key === "countries" || operation.key === "country" ||
          operation.key === "news"
      ? readPlayerWorldRoutePath(operation.path)
      : operation.key === "market" || operation.key === "marketAsset" ||
          operation.key === "marketWatchlist"
      ? readPlayerStockAssetListRoutePath(operation.path)
      : operation.key === "marketOrder" || operation.key === "portfolio"
      ? readPlayerStockMarketPublicRoutePath(operation.path)
      : operation.key === "store" || operation.key === "storeQuote" ||
          operation.key === "storePurchase"
      ? readPlayerStorePublicRoutePath(operation.path)
      : operation.key === "inventory"
      ? readPlayerInventoryRoutePath(operation.path)
      : operation.key === "inventoryRedemptions"
      ? readPlayerInventoryRedemptionRoutePath(operation.path)
      : operation.key === "notifications" ||
          operation.key === "notificationsRead"
      ? readPlayerNotificationRoutePath(operation.path)
      : operation.key === "storyDeliveries" ||
          operation.key === "storyDeliveryState"
      ? readPlayerStoryDeliveryRoutePath(operation.path)
      : operation.key === "logout"
      ? readPlayerSessionLogoutRoutePath(operation.path)
      : null;

    if (!parsed || parsed.kind === "malformed") {
      throw new Error(
        `Advertised endpoint ${operation.key} is not dispatchable: ${operation.path}`,
      );
    }
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
