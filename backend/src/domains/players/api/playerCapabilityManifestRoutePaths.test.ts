import { readPlayerBusinessBankingRoutePath } from "../../business-banking/api/playerBusinessBankingRoutePaths.ts";
import { readPlayerContractAcceptanceRoutePath } from "../../contracts/api/playerContractAcceptanceRoutePaths.ts";
import { readPlayerContractPublicListRoutePath } from "../../contracts/api/playerContractPublicListRoutePaths.ts";
import { readPlayerContractPublicSubmitRoutePath } from "../../contracts/api/playerContractPublicSubmitRoutePaths.ts";
import { readPlayerWorldRoutePath } from "../../countries/api/playerWorldRoutePaths.ts";
import { readPlayerCraftingRoutePath } from "../../crafting/api/playerCraftingRoutePaths.ts";
import { readPlayerBankingPublicRoutePath } from "../../economy/api/playerBankingPublicRoutePaths.ts";
import { readPlayerBankingFxRoutePath } from "../../banking-fx/api/playerBankingFxRoutePaths.ts";
import { readPlayerInventoryRoutePath } from "../../inventory/api/playerInventoryRoutePaths.ts";
import { readPlayerMarketplaceRoutePath } from "../../marketplace/api/playerMarketplaceRoutePaths.ts";
import { readPlayerMessageThreadLifecycleRoutePath } from "../../messaging/api/playerMessageThreadLifecycleRoutePaths.ts";
import { readPlayerMessagingRoutePath } from "../../messaging/api/playerMessagingRoutePaths.ts";
import { readPlayerNotificationRoutePath } from "../../notifications/api/playerNotificationRoutePaths.ts";
import { readPlayerStoryDeliveryRoutePath } from "../../notifications/api/playerStoryDeliveryRoutePaths.ts";
import { readPlayerProgressionRoutePath } from "../../progression/api/playerProgressionRoutePaths.ts";
import { readPlayerStockAssetListRoutePath } from "../../stocks/api/playerStockAssetListRoutePaths.ts";
import { readPlayerStorePublicRoutePath } from "../../store/api/playerStorePublicRoutePaths.ts";
import { parsePlayerWorldRuntimeRoute } from "../../world/api/playerWorldRuntimeRoutePaths.ts";
import { readPlayerApiRouteSegments } from "./playerApiRouteSegments.ts";
import { readPlayerCapabilityManifestRoutePath } from "./playerCapabilityManifestRoutePaths.ts";
import { readPlayerSessionLogoutRoutePath } from "./playerSessionLogoutRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player capability manifest route accepts only exact direct and Edge paths", () => {
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/players/me/capabilities"),
    { kind: "manifest" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/classroom-api/players/me/capabilities",
    ),
    { kind: "manifest" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/player-api/players/me/capabilities",
    ),
    { kind: "manifest" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/functions/v1/classroom-api/players/me/capabilities",
    ),
    { kind: "manifest" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/functions/v1/player-api/players/me/capabilities",
    ),
    { kind: "manifest" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/players/me/capabilities/extra"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/classroom-api/players/me/capabilities/extra",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/player-api/players/me/capabilities/extra",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/spoof/players/me/capabilities"),
    null,
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/spoof/classroom-api/players/me/capabilities",
    ),
    null,
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/spoof/player-api/players/me/capabilities",
    ),
    null,
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/players/me/inventory"),
    null,
  );
});

Deno.test("shared Player route prefix parser accepts bounded services and rejects spoofing", () => {
  assertEquals(readPlayerApiRouteSegments("/players/me/inventory"), [
    "players",
    "me",
    "inventory",
  ]);
  assertEquals(readPlayerApiRouteSegments("/player-api/players/me/inventory"), [
    "players",
    "me",
    "inventory",
  ]);
  assertEquals(
    readPlayerApiRouteSegments("/functions/v1/player-api/players/me/inventory"),
    ["players", "me", "inventory"],
  );
  assertEquals(
    readPlayerApiRouteSegments("/classroom-api/players/me/inventory"),
    ["players", "me", "inventory"],
  );
  assertEquals(
    readPlayerApiRouteSegments(
      "/functions/v1/classroom-api/players/me/inventory",
    ),
    ["players", "me", "inventory"],
  );
  assertEquals(
    readPlayerApiRouteSegments("/spoof/player-api/players/me/inventory"),
    null,
  );
  assertEquals(
    readPlayerApiRouteSegments("/functions/v1/player-api/spoof/players/me"),
    null,
  );
});

Deno.test("all migrated Player route families dispatch on the Player API boundary", () => {
  const prefix = "/functions/v1/player-api";
  assertEquals(
    readPlayerNotificationRoutePath(`${prefix}/players/me/notifications`),
    { kind: "list" },
  );
  assertEquals(
    readPlayerWorldRoutePath(`${prefix}/players/me/world/countries`),
    { kind: "countries" },
  );
  assertEquals(readPlayerInventoryRoutePath(`${prefix}/players/me/inventory`), {
    kind: "inventory",
  });
  assertEquals(readPlayerMessagingRoutePath(`${prefix}/players/me/messages`), {
    kind: "list",
  });
  assertEquals(
    readPlayerMessageThreadLifecycleRoutePath(`${prefix}/players/me/messages`),
    null,
  );
  assertEquals(
    readPlayerMessageThreadLifecycleRoutePath(
      `${prefix}/players/me/messages/policy`,
    ),
    { kind: "policy" },
  );
  assertEquals(
    readPlayerStockAssetListRoutePath(`${prefix}/players/me/stocks/assets`),
    { kind: "assets" },
  );
  assertEquals(
    readPlayerContractPublicListRoutePath(`${prefix}/players/me/contracts`),
    { kind: "contracts" },
  );
  assertEquals(
    readPlayerContractAcceptanceRoutePath(
      `${prefix}/players/me/contracts/contract-key/accept`,
    ),
    {
      kind: "accept",
      contractKey: "contract-key",
    },
  );
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      `${prefix}/players/me/contracts/contract-key/submit`,
    ),
    {
      kind: "submit",
      contractKey: "contract-key",
    },
  );
  assertEquals(
    readPlayerMarketplaceRoutePath(`${prefix}/players/me/marketplace/listings`),
    { kind: "collection" },
  );
  assertEquals(readPlayerCraftingRoutePath(`${prefix}/players/me/crafting`), {
    kind: "read",
  });
  assertEquals(
    readPlayerStorePublicRoutePath(`${prefix}/players/me/store/items`),
    { kind: "items" },
  );
  assertEquals(
    readPlayerStorePublicRoutePath(`${prefix}/players/me/store/offer-quotes`),
    {
      kind: "offerQuotes",
    },
  );
  assertEquals(
    readPlayerStorePublicRoutePath(
      `${prefix}/players/me/store/offer-purchases`,
    ),
    {
      kind: "offerPurchases",
    },
  );
  assertEquals(
    readPlayerStorePublicRoutePath(
      `${prefix}/players/me/store/receipts/spr_${"a".repeat(32)}`,
    ),
    { kind: "offerReceipt", receiptKey: `spr_${"a".repeat(32)}` },
  );
  assertEquals(
    readPlayerBankingPublicRoutePath(`${prefix}/players/me/ledger`),
    { kind: "banking" },
  );
  assertEquals(
    readPlayerBankingFxRoutePath(`${prefix}/players/me/banking/fx`),
    { kind: "overview" },
  );
  assertEquals(
    readPlayerBankingFxRoutePath(
      `${prefix}/players/me/banking/fx/orders/instant`,
    ),
    { kind: "instant" },
  );
  assertEquals(
    readPlayerBusinessBankingRoutePath(`${prefix}/players/me/business`),
    {
      kind: "businessRead",
      resource: "overview",
    },
  );
  assertEquals(
    readPlayerBusinessBankingRoutePath(
      `${prefix}/players/me/business/stockroom`,
    ),
    {
      kind: "businessRead",
      resource: "stockroom",
    },
  );
  assertEquals(
    parsePlayerWorldRuntimeRoute(`${prefix}/players/me/world-runtime`),
    {
      operation: "context",
      journeyId: null,
    },
  );
  assertEquals(
    readPlayerProgressionRoutePath(`${prefix}/players/me/progression`),
    { kind: "read" },
  );
  assertEquals(
    readPlayerSessionLogoutRoutePath(`${prefix}/players/me/session/logout`),
    { kind: "logout" },
  );
  assertEquals(
    readPlayerStoryDeliveryRoutePath(`${prefix}/players/me/story-deliveries`),
    { kind: "list" },
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
