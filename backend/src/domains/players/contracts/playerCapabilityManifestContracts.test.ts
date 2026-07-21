import {
  buildPlayerCapabilityManifest,
  PLAYER_ACTION_CAPABILITY_KEYS,
  PLAYER_CAPABILITY_MANIFEST_VERSION,
  PLAYER_CAPABILITY_SCHEMA_VERSION,
  PLAYER_ROUTE_CAPABILITY_KEYS,
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

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("player capability manifest is generated from the reviewed endpoint allowlist", () => {
  const manifest = buildPlayerCapabilityManifest();
  assertEquals(manifest.schemaVersion, PLAYER_CAPABILITY_SCHEMA_VERSION);
  assertEquals(manifest.manifestVersion, PLAYER_CAPABILITY_MANIFEST_VERSION);
  assertEquals(manifest.service, "classroom-api");
  assertEquals(Object.keys(manifest.capabilities.routes), [...PLAYER_ROUTE_CAPABILITY_KEYS]);
  assertEquals(Object.keys(manifest.capabilities.actions), [...PLAYER_ACTION_CAPABILITY_KEYS]);

  for (const key of ["dashboard", "profile", "news", "market", "portfolio", "contracts", "inventory", "store", "banking", "messages"]) {
    assertEquals(manifest.capabilities.routes[key as keyof typeof manifest.capabilities.routes], true);
  }
  for (const key of ["marketWatchlist", "notificationsRead", "logout", "contractAccept", "contractSubmit", "inventoryUse", "marketOrder", "storePurchase", "storyDeliveryState", "messageSearch", "messageSend"]) {
    assertEquals(manifest.capabilities.actions[key as keyof typeof manifest.capabilities.actions], true);
  }
  assertEquals(manifest.capabilities.actions.messageAttachment, false);

  const endpointKeys = manifest.endpoints.map((endpoint) => endpoint.key);
  assertEquals(new Set(endpointKeys).size, endpointKeys.length);
  for (const key of [
    "bootstrap", "capabilities", "banking", "contractAccept", "contractSubmit", "contracts", "dashboard",
    "inventoryRedemptions", "marketOrder", "portfolio", "store", "storeQuote", "storePurchase",
    "storyDeliveries", "storyDeliveryState", "messages", "messageThread", "messagePolicy", "messageSearch",
    "messageThreadCreate", "messageSend", "messageRead",
  ]) assertEquals(endpointKeys.includes(key as never), true);
});

Deno.test("player capability manifest contains no UUID-shaped identifiers", () => {
  const serialized = JSON.stringify(buildPlayerCapabilityManifest());
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) {
    throw new Error(`UUID leaked in capability manifest: ${serialized}`);
  }
});

Deno.test("every advertised endpoint path is recognized by the authoritative dispatch boundary", () => {
  const operations = buildPlayerCapabilityManifest().endpoints.flatMap((endpoint) =>
    endpoint.operations.map((operation) => ({
      key: endpoint.key,
      path: operation.pathTemplate
        .replace(":contractKey", "arrival-orientation")
        .replace(":countryCode", "NR")
        .replace(":ticker", "AURA")
        .replace(":itemId", "meal-pass")
        .replace(":requestId", `red_${"a".repeat(32)}`)
        .replace(":deliveryId", `ndl_${"a".repeat(32)}`)
        .replace(":threadId", `thr_${"a".repeat(32)}`),
    }))
  );

  for (const operation of operations) {
    const key = operation.key;
    const parsed = key === "bootstrap"
      ? operation.path === "/players/me" ? { kind: "bootstrap" } : null
      : key === "dashboard"
      ? operation.path === "/players/me/game/dashboard" ? { kind: "dashboard" } : null
      : key === "capabilities"
      ? readPlayerCapabilityManifestRoutePath(operation.path)
      : key === "banking"
      ? readPlayerBankingPublicRoutePath(operation.path)
      : key === "contractAccept"
      ? readPlayerContractAcceptanceRoutePath(operation.path)
      : key === "contractSubmit"
      ? readPlayerContractPublicSubmitRoutePath(operation.path)
      : key === "contracts"
      ? readPlayerContractPublicListRoutePath(operation.path)
      : key === "countries" || key === "country" || key === "news"
      ? readPlayerWorldRoutePath(operation.path)
      : key === "market" || key === "marketAsset" || key === "marketWatchlist"
      ? readPlayerStockAssetListRoutePath(operation.path)
      : key === "marketOrder" || key === "portfolio"
      ? readPlayerStockMarketPublicRoutePath(operation.path)
      : key === "store" || key === "storeQuote" || key === "storePurchase"
      ? readPlayerStorePublicRoutePath(operation.path)
      : key === "inventory"
      ? readPlayerInventoryRoutePath(operation.path)
      : key === "inventoryRedemptions"
      ? readPlayerInventoryRedemptionRoutePath(operation.path)
      : ["notifications", "notificationsRead", "messages", "messageThread", "messagePolicy", "messageSearch", "messageThreadCreate", "messageSend", "messageRead"].includes(key)
      ? readPlayerNotificationRoutePath(operation.path)
      : key === "storyDeliveries" || key === "storyDeliveryState"
      ? readPlayerStoryDeliveryRoutePath(operation.path)
      : key === "logout"
      ? readPlayerSessionLogoutRoutePath(operation.path)
      : null;

    const routeKind = parsed && "kind" in parsed ? parsed.kind : null;
    if (!parsed || routeKind === "malformed") {
      throw new Error(`Advertised endpoint ${key} is not dispatchable: ${operation.path}`);
    }
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
