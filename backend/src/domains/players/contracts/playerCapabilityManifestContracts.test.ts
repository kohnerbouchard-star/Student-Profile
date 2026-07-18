import {
  buildPlayerCapabilityManifest,
  PLAYER_ACTION_CAPABILITY_KEYS,
  PLAYER_CAPABILITY_MANIFEST_VERSION,
  PLAYER_CAPABILITY_SCHEMA_VERSION,
  PLAYER_ROUTE_CAPABILITY_KEYS,
} from "./playerCapabilityManifestContracts.ts";
import { readPlayerCapabilityManifestRoutePath } from "../api/playerCapabilityManifestRoutePaths.ts";
import { readPlayerSessionLogoutRoutePath } from "../api/playerSessionLogoutRoutePaths.ts";
import { readPlayerWorldRoutePath } from "../../countries/api/playerWorldRoutePaths.ts";
import { readPlayerInventoryRoutePath } from "../../inventory/api/playerInventoryRoutePaths.ts";
import { readPlayerNotificationRoutePath } from "../../notifications/api/playerNotificationRoutePaths.ts";
import { readPlayerStockAssetListRoutePath } from "../../stocks/api/playerStockAssetListRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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

  assertEquals(manifest.capabilities.routes.news, true);
  assertEquals(manifest.capabilities.routes.market, true);
  assertEquals(manifest.capabilities.routes.inventory, true);
  assertEquals(manifest.capabilities.routes.dashboard, false);
  assertEquals(manifest.capabilities.routes.contracts, false);
  assertEquals(manifest.capabilities.routes.store, false);
  assertEquals(manifest.capabilities.routes.banking, false);
  assertEquals(manifest.capabilities.routes.profile, false);

  assertEquals(manifest.capabilities.actions.marketWatchlist, true);
  assertEquals(manifest.capabilities.actions.notificationsRead, true);
  assertEquals(manifest.capabilities.actions.logout, true);
  assertEquals(manifest.capabilities.actions.marketOrder, false);
  assertEquals(manifest.capabilities.actions.contractAccept, false);
  assertEquals(manifest.capabilities.actions.contractSubmit, false);
  assertEquals(manifest.capabilities.actions.storePurchase, false);

  const endpointKeys = manifest.endpoints.map((endpoint) => endpoint.key);
  assertEquals(new Set(endpointKeys).size, endpointKeys.length);
  assertEquals(endpointKeys.includes("capabilities"), true);
  assertEquals(endpointKeys.includes("marketOrder" as never), false);
  assertEquals(endpointKeys.includes("contractAccept" as never), false);
  assertEquals(endpointKeys.includes("store" as never), false);
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

Deno.test("every advertised endpoint path is recognized by an authoritative route parser", () => {
  const operations = buildPlayerCapabilityManifest().endpoints.flatMap((
    endpoint,
  ) =>
    endpoint.operations.map((operation) => ({
      key: endpoint.key,
      path: operation.pathTemplate
        .replace(":countryCode", "NR")
        .replace(":ticker", "AURA"),
    }))
  );

  for (const operation of operations) {
    const parsed = operation.key === "capabilities"
      ? readPlayerCapabilityManifestRoutePath(operation.path)
      : operation.key === "countries" || operation.key === "country" ||
          operation.key === "news"
      ? readPlayerWorldRoutePath(operation.path)
      : operation.key === "market" || operation.key === "marketAsset" ||
          operation.key === "marketWatchlist"
      ? readPlayerStockAssetListRoutePath(operation.path)
      : operation.key === "inventory"
      ? readPlayerInventoryRoutePath(operation.path)
      : operation.key === "notifications" ||
          operation.key === "notificationsRead"
      ? readPlayerNotificationRoutePath(operation.path)
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
