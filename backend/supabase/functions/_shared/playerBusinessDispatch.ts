import {
  handlePlayerBusinessRequest,
  readPlayerBusinessRoutePath,
  type PlayerBusinessRequestScope,
  type PlayerBusinessRoute,
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
    endpointKey(route),
    () =>
      handlePlayerBusinessRequest(request, route, {
        createServiceClient: dependencies.createServiceClient,
        resolveScope: resolveBusinessScope,
      }),
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

function endpointKey(route: PlayerBusinessRoute):
  | "business"
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
  | "businessPrice"
  | "businessTerminate"
  | "businessStatus" {
  if (route.kind === "businessRead") return "business";
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
  if (route.kind === "businessStoreQuote") return "storeQuote";
  if (route.kind === "businessStorePurchase") return "storePurchase";
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
