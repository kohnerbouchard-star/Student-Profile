import {
  handlePlayerBusinessRequest,
  type PlayerBusinessRequestScope,
  type PlayerBusinessRoute,
  readPlayerBusinessRoutePath,
} from "../../../src/domains/business/index.ts";
import { resolvePlayerRequestScope } from "../../../src/domains/players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../../src/domains/players/api/playerSessionHttpHelpers.ts";
import { sha256Hex } from "../../../src/platform/supabase/edgeCrypto.ts";
import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { dispatchRateLimitedReviewedPlayerRequest } from "../../../src/security/playerRateLimitDispatch.ts";

export interface PlayerBusinessDispatchDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

export async function dispatchPlayerBusinessRequest(
  request: Request,
  dependencies: PlayerBusinessDispatchDependencies,
): Promise<Response | null> {
  const route = readPlayerBusinessRoutePath(new URL(request.url).pathname);
  if (!route) return null;
  return dispatchRateLimitedReviewedPlayerRequest(
    request,
    endpointKey(route, request.method),
    (applicationContext) =>
      handlePlayerBusinessRequest(request, route, {
        createServiceClient: dependencies.createServiceClient,
        resolveScope: resolveBusinessScope,
      }, applicationContext),
    { createServiceClient: dependencies.createServiceClient },
  );
}

async function resolveBusinessScope(
  request: Request,
  client: EdgeSupabaseClient,
  body: Record<string, unknown>,
): Promise<PlayerBusinessRequestScope> {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (tokenHash) =>
      resolveActivePlayerSession(client, tokenHash),
  }, { body });
}

function endpointKey(
  route: PlayerBusinessRoute,
  method: string,
):
  | "business"
  | "businessTreasury"
  | "businessTreasuryAccountOpen"
  | "businessTreasuryFxQuote"
  | "businessTreasuryFxStandard"
  | "businessTreasuryFxInstant"
  | "businessTreasuryFxCancel"
  | "businessStoreQuote"
  | "businessStorePurchase"
  | "businessCreate"
  | "businessFormationPropose"
  | "businessFormationRespond"
  | "businessFormationActivate"
  | "businessWorkforce"
  | "businessCandidateHire"
  | "businessRetiredHire"
  | "storeQuote"
  | "storePurchase"
  | "businessProductCreate"
  | "businessInputPurchase"
  | "businessProduction"
  | "businessManufacturingJobs"
  | "businessManufacturingStart"
  | "businessManufacturingCancel"
  | "businessPrice"
  | "businessTerminate"
  | "businessStatus" {
  if (route.kind === "businessRead") return "business";
  if (route.kind === "businessTreasuryRead") return "businessTreasury";
  if (route.kind === "businessTreasuryAccountOpen") {
    return "businessTreasuryAccountOpen";
  }
  if (route.kind === "businessTreasuryFxQuote") {
    return "businessTreasuryFxQuote";
  }
  if (route.kind === "businessTreasuryFxStandard") {
    return "businessTreasuryFxStandard";
  }
  if (route.kind === "businessTreasuryFxInstant") {
    return "businessTreasuryFxInstant";
  }
  if (route.kind === "businessTreasuryFxCancel") {
    return "businessTreasuryFxCancel";
  }
  if (route.kind === "businessCreate") {
    if (route.operation === "formationPropose") {
      return "businessFormationPropose";
    }
    if (route.operation === "formationRespond") {
      return "businessFormationRespond";
    }
    if (route.operation === "formationActivate") {
      return "businessFormationActivate";
    }
    return "businessCreate";
  }
  if (route.kind === "businessManufacturingCollection") {
    return method === "GET"
      ? "businessManufacturingJobs"
      : "businessManufacturingStart";
  }
  if (route.kind === "businessManufacturingCancel") {
    return "businessManufacturingCancel";
  }
  if (route.kind === "businessStoreQuote") return "businessStoreQuote";
  if (route.kind === "businessStorePurchase") return "businessStorePurchase";
  return ({
    businessWorkforce: "businessWorkforce",
    businessCandidateHire: "businessCandidateHire",
    businessProductCreate: "businessProductCreate",
    businessInputPurchase: "businessInputPurchase",
    businessProduction: "businessProduction",
    businessPrice: "businessPrice",
    businessHire: "businessRetiredHire",
    businessTerminate: "businessTerminate",
    businessStatus: "businessStatus",
  } as const)[route.kind];
}
