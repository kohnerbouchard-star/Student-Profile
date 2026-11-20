import {
  WORLD_BANKING_CAPABILITY_ENDPOINTS,
} from "./playerWorldBankingCapabilityEndpoints.ts";
import { BUSINESS_CAPABILITY_ENDPOINTS } from "./playerBusinessCapabilityEndpoints.ts";
import { GAMEPLAY_CAPABILITY_ENDPOINTS } from "./playerGameplayCapabilityEndpoints.ts";
import { SOCIAL_CAPABILITY_ENDPOINTS } from "./playerSocialCapabilityEndpoints.ts";

export const PLAYER_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-08-31.2" as const;

export const PLAYER_ROUTE_CAPABILITY_KEYS = [
  "dashboard",
  "news",
  "market",
  "portfolio",
  "business",
  "contracts",
  "store",
  "marketplace",
  "inventory",
  "crafting",
  "banking",
  "bankingFx",
  "loans",
  "messages",
  "progression",
  "profile",
  "world",
] as const;

export const PLAYER_ACTION_CAPABILITY_KEYS = [
  "arrivalClassSubmit",
  "bankingExport",
  "bankingFxCancel",
  "bankingFxInstant",
  "bankingFxQuote",
  "bankingFxStandard",
  "bankTransfer",
  "businessCreate",
  "businessEmployeeTerminate",
  "businessIpoPropose",
  "businessIpoVote",
  "businessIpoSubscribe",
  "businessFormationActivate",
  "businessFormationPropose",
  "businessFormationRespond",
  "businessCandidateHire",
  "businessPrice",
  "businessProductCreate",
  "businessProduction",
  "businessEquipmentInstall",
  "businessStoreOfferCreate",
  "businessStoreOfferStock",
  "businessStoreOfferPublish",

  "businessStatus",
  "businessTreasuryAccountOpen",
  "businessTreasuryFxCancel",
  "businessTreasuryFxInstant",
  "businessTreasuryFxQuote",
  "businessTreasuryFxStandard",
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
  "marketplaceActivate",
  "marketplaceCancel",
  "marketplaceListing",
  "marketplacePurchase",
  "marketplaceDispute",
  "messageAttachment",
  "messageSearch",
  "messageSend",
  "notificationsRead",
  "progressionClaim",
  "progressionUnlock",
  "residencyRequest",
  "savingsTransfer",
  "storePurchase",
  "storyDeliveryState",
  "travelComplete",
  "travelExecute",
  "travelQuote",
] as const;

export type PlayerRouteCapabilityKey =
  typeof PLAYER_ROUTE_CAPABILITY_KEYS[number];
export type PlayerActionCapabilityKey =
  typeof PLAYER_ACTION_CAPABILITY_KEYS[number];

export type PlayerCapabilityEndpointKey =
  | "bootstrap"
  | "capabilities"
  | "arrivalClass"
  | "banking"
  | "bankingFx"
  | "bankingFxHistory"
  | "bankingFxOrders"
  | "bankingFxQuote"
  | "bankingFxStandard"
  | "bankingFxInstant"
  | "bankingFxCancel"
  | "bankTransfer"
  | "business"
  | "businessStoreQuote"
  | "businessStorePurchase"
  | "businessIpos"
  | "businessIpoPropose"
  | "businessIpoVote"
  | "businessIpoSubscribe"
  | "businessTreasury"
  | "businessTreasuryAccountOpen"
  | "businessTreasuryFxQuote"
  | "businessTreasuryFxStandard"
  | "businessTreasuryFxInstant"
  | "businessTreasuryFxCancel"
  | "businessWorkforce"
  | "businessCreate"
  | "businessFormationActivate"
  | "businessFormationPropose"
  | "businessFormationRespond"
  | "businessCandidateHire"
  | "businessPrice"
  | "businessProductCreate"
  | "businessProduction"
  | "businessManufacturingJobs"
  | "businessManufacturingStart"
  | "businessEquipmentInstall"
  | "businessStoreOfferCreate"
  | "businessStoreOfferPublish"
  | "businessStoreOfferStock"
  | "businessManufacturingCancel"
  | "businessStatus"
  | "businessTerminate"
  | "contractAccept"
  | "contractSubmit"
  | "contracts"
  | "countries"
  | "country"
  | "dashboard"
  | "inventory"
  | "inventoryRedemptions"
  | "loanApply"
  | "loanRepay"
  | "loans"
  | "logout"
  | "market"
  | "marketAsset"
  | "marketOrder"
  | "marketWatchlist"
  | "marketplace"
  | "marketplaceActivate"
  | "marketplaceCancel"
  | "marketplaceDispute"
  | "marketplaceListing"
  | "marketplacePurchase"
  | "messages"
  | "messageThread"
  | "messagePolicy"
  | "messageSearch"
  | "messageThreadCreate"
  | "messageSend"
  | "messageRead"
  | "news"
  | "notifications"
  | "notificationsRead"
  | "portfolio"
  | "progression"
  | "progressionUnlock"
  | "progressionClaim"
  | "residencyRequest"
  | "savingsTransfer"
  | "store"
  | "storeQuote"
  | "storePurchase"
  | "storyDeliveries"
  | "storyDeliveryState"
  | "travelComplete"
  | "travelExecute"
  | "travelQuote"
  | "worldRuntime";

export type PlayerCapabilityHttpMethod = "DELETE" | "GET" | "POST" | "PUT";

export interface PlayerCapabilityEndpointOperation {
  readonly method: PlayerCapabilityHttpMethod;
  readonly pathTemplate: string;
}

export interface PlayerCapabilityEndpointDescriptor {
  readonly key: PlayerCapabilityEndpointKey;
  readonly operations: readonly PlayerCapabilityEndpointOperation[];
  readonly routeCapabilities?: readonly PlayerRouteCapabilityKey[];
  readonly actionCapabilities?: readonly PlayerActionCapabilityKey[];
}

export interface PlayerCapabilityManifest {
  readonly schemaVersion: typeof PLAYER_CAPABILITY_SCHEMA_VERSION;
  readonly manifestVersion: typeof PLAYER_CAPABILITY_MANIFEST_VERSION;
  readonly service: "classroom-api";
  readonly capabilities: {
    readonly routes: Readonly<Record<PlayerRouteCapabilityKey, boolean>>;
    readonly actions: Readonly<Record<PlayerActionCapabilityKey, boolean>>;
  };
  readonly endpoints: readonly {
    readonly key: PlayerCapabilityEndpointKey;
    readonly operations: readonly PlayerCapabilityEndpointOperation[];
  }[];
}

export type PlayerCapabilityManifestResponseBody = {
  readonly ok: true;
} & PlayerCapabilityManifest;

export type PlayerCapabilityManifestRoute =
  | { readonly kind: "manifest" }
  | { readonly kind: "malformed" };

const REVIEWED_ENDPOINTS: readonly PlayerCapabilityEndpointDescriptor[] = [
  ...WORLD_BANKING_CAPABILITY_ENDPOINTS,
  ...BUSINESS_CAPABILITY_ENDPOINTS,
  ...GAMEPLAY_CAPABILITY_ENDPOINTS,
  ...SOCIAL_CAPABILITY_ENDPOINTS,
] as const;

export function buildPlayerCapabilityManifest(): PlayerCapabilityManifest {
  const routeCapabilities = new Set(
    REVIEWED_ENDPOINTS.flatMap((descriptor) =>
      descriptor.routeCapabilities ?? []
    ),
  );
  const actionCapabilities = new Set(
    REVIEWED_ENDPOINTS.flatMap((descriptor) =>
      descriptor.actionCapabilities ?? []
    ),
  );

  return Object.freeze({
    schemaVersion: PLAYER_CAPABILITY_SCHEMA_VERSION,
    manifestVersion: PLAYER_CAPABILITY_MANIFEST_VERSION,
    service: "classroom-api",
    capabilities: Object.freeze({
      routes: capabilityFlags(PLAYER_ROUTE_CAPABILITY_KEYS, routeCapabilities),
      actions: capabilityFlags(
        PLAYER_ACTION_CAPABILITY_KEYS,
        actionCapabilities,
      ),
    }),
    endpoints: Object.freeze(
      REVIEWED_ENDPOINTS.map((descriptor) =>
        Object.freeze({
          key: descriptor.key,
          operations: Object.freeze(descriptor.operations.map((operation) =>
            Object.freeze({ ...operation })
          )),
        })
      ),
    ),
  });
}

function capabilityFlags<TKey extends string>(
  keys: readonly TKey[],
  supported: ReadonlySet<TKey>,
): Readonly<Record<TKey, boolean>> {
  return Object.freeze(Object.fromEntries(
    keys.map((key) => [key, supported.has(key)]),
  ) as Record<TKey, boolean>);
}
