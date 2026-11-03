/// <reference lib="dom" />

import {
  dispatchRateLimitedPlayerCraftingRequest,
  type PlayerCraftingRateLimitEndpointKey,
} from "../../../security/playerCraftingRateLimitDispatch.ts";
import type { PlayerCraftingRoute } from "../contracts/playerCraftingContracts.ts";
import {
  handlePlayerCraftingRequest,
  type PlayerCraftingHttpHandlerDependencies,
} from "./playerCraftingHttpHandler.ts";

export type PlayerCraftingInventoryBridgeDependencies = Pick<
  PlayerCraftingHttpHandlerDependencies,
  | "createServiceClient"
  | "readSupabaseEnv"
  | "hashSessionToken"
  | "resolvePlayerSession"
  | "now"
>;

export function handleCraftingBridgeRequest(
  request: Request,
  route: PlayerCraftingRoute,
  dependencies: PlayerCraftingInventoryBridgeDependencies,
): Promise<Response> {
  return dispatchRateLimitedPlayerCraftingRequest(
    request,
    craftingEndpointKey(route),
    () =>
      handlePlayerCraftingRequest(request, route, {
        createServiceClient: dependencies.createServiceClient,
        readSupabaseEnv: dependencies.readSupabaseEnv,
        hashSessionToken: dependencies.hashSessionToken,
        resolvePlayerSession: dependencies.resolvePlayerSession,
        now: dependencies.now,
      }),
    {
      createServiceClient: dependencies.createServiceClient,
      readEnvironment: dependencies.readSupabaseEnv,
    },
  );
}

export function craftingEndpointKey(
  route: PlayerCraftingRoute,
): PlayerCraftingRateLimitEndpointKey {
  switch (route.kind) {
    case "read":
    case "startJob":
    case "malformed":
      return "crafting";
    case "cancelJob":
      return "craftingJobCancel";
    case "claimJob":
      return "craftingJobClaim";
    case "useItem":
      return "itemEffectUse";
    case "equip":
      return "equipmentEquip";
    case "salvage":
      return "equipmentSalvage";
  }
}
