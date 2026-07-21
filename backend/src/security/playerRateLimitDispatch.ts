import { sha256Hex } from "../platform/supabase/edgeCrypto.ts";
import { EdgeActivationError, jsonError } from "../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerCapabilityEndpointKey } from "../domains/players/contracts/playerCapabilityManifestContracts.ts";
import {
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../domains/players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../domains/players/api/playerSessionHttpHelpers.ts";
import { readPlayerProgressionRoutePath } from "../domains/progression/api/playerProgressionRoutePaths.ts";
import {
  enforcePlayerRateLimit,
  type EnforcePlayerRateLimitInput,
  enforcePreAuthRateLimit,
  type EnforcePreAuthRateLimitInput,
} from "./playerRateLimitService.ts";
import type { PlayerRateLimitProfile, RateLimitDecision } from "./rateLimitContracts.ts";
import { rateLimitExceededResponse, rateLimitUnavailableResponse } from "./rateLimitHttp.ts";

export interface ReviewedPlayerRateLimitOperation {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
}
export type ReviewedPlayerRateLimitEndpointKey = PlayerCapabilityEndpointKey | "inventoryRedemption";
export interface PlayerRateLimitDispatchDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (request: Request, client: EdgeSupabaseClient) => Promise<PlayerRequestScope>;
  readonly enforcePostAuth?: (input: EnforcePlayerRateLimitInput, client: EdgeSupabaseClient) => Promise<RateLimitDecision>;
  readonly enforcePreAuth?: (input: EnforcePreAuthRateLimitInput, client: EdgeSupabaseClient) => Promise<RateLimitDecision>;
}

const op = (action: string, profile: PlayerRateLimitProfile): ReviewedPlayerRateLimitOperation => Object.freeze({ action, profile });
const methods = (values: Readonly<Record<string, ReviewedPlayerRateLimitOperation>>) => Object.freeze(values);
const redemption = methods({
  GET: op("player.inventory.redemptions.read", "read"),
  POST: op("player.inventory.redemptions.request", "write"),
});
const OPERATIONS: Readonly<Record<
  ReviewedPlayerRateLimitEndpointKey,
  Readonly<Partial<Record<string, ReviewedPlayerRateLimitOperation>>>
>> = Object.freeze({
  bootstrap: methods({ GET: op("player.session.read", "read") }),
  capabilities: methods({ GET: op("player.capabilities.read", "read") }),
  banking: methods({ GET: op("player.banking.read", "read") }),
  contractAccept: methods({ POST: op("player.contracts.accept", "write") }),
  contractSubmit: methods({ POST: op("player.contracts.submit", "write") }),
  contracts: methods({ GET: op("player.contracts.read", "read") }),
  countries: methods({ GET: op("player.countries.read", "read") }),
  country: methods({ GET: op("player.country.read", "read") }),
  dashboard: methods({ GET: op("player.dashboard.read", "read") }),
  inventory: methods({ GET: op("player.inventory.read", "read") }),
  inventoryRedemption: redemption,
  inventoryRedemptions: redemption,
  logout: methods({ POST: op("player.session.logout", "sensitive") }),
  market: methods({ GET: op("player.market.read", "read") }),
  marketAsset: methods({ GET: op("player.asset.read", "read") }),
  marketOrder: methods({ POST: op("player.market.order", "sensitive") }),
  marketWatchlist: methods({
    DELETE: op("player.watchlist.write", "write"),
    GET: op("player.watchlist.read", "read"),
    PUT: op("player.watchlist.write", "write"),
  }),
  news: methods({ GET: op("player.news.read", "read") }),
  notifications: methods({ GET: op("player.notifications.read", "read") }),
  notificationsRead: methods({ POST: op("player.notifications.write", "write") }),
  portfolio: methods({ GET: op("player.portfolio.read", "read") }),
  progression: methods({ GET: op("player.progression.read", "read") }),
  progressionUnlock: methods({ POST: op("player.progression.skill.unlock", "sensitive") }),
  progressionClaim: methods({ POST: op("player.progression.reward.claim", "sensitive") }),
  store: methods({ GET: op("player.store.read", "read") }),
  storeQuote: methods({ POST: op("player.store.quote", "write") }),
  storePurchase: methods({
    GET: op("player.store.purchases.read", "read"),
    POST: op("player.store.purchase", "sensitive"),
  }),
  storyDeliveries: methods({ GET: op("player.story.deliveries.read", "read") }),
  storyDeliveryState: methods({ POST: op("player.story.deliveries.write", "write") }),
});

export function readReviewedPlayerRateLimitOperation(
  endpointKey: ReviewedPlayerRateLimitEndpointKey,
  method: string,
): ReviewedPlayerRateLimitOperation | null {
  return OPERATIONS[endpointKey][method.toUpperCase()] ?? null;
}

export async function dispatchRateLimitedReviewedPlayerRequest(
  request: Request,
  endpointKey: ReviewedPlayerRateLimitEndpointKey,
  next: () => Promise<Response> | Response,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<Response> {
  const resolvedKey = resolveReviewedEndpointKey(request, endpointKey);
  const operation = readReviewedPlayerRateLimitOperation(resolvedKey, request.method);
  if (!operation) return next();
  const limited = await guardReviewedPlayerRequest(request, operation, dependencies);
  return limited ?? next();
}

export async function dispatchRateLimitedPlayerLoginRequest(
  request: Request,
  next: () => Promise<Response> | Response,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<Response> {
  if (request.method !== "POST") return next();
  const limited = await guardPlayerLoginRequest(request, dependencies);
  return limited ?? next();
}

function resolveReviewedEndpointKey(
  request: Request,
  fallback: ReviewedPlayerRateLimitEndpointKey,
): ReviewedPlayerRateLimitEndpointKey {
  if (fallback !== "capabilities") return fallback;
  const route = readPlayerProgressionRoutePath(new URL(request.url).pathname);
  if (!route || route.kind === "malformed") return fallback;
  if (route.kind === "read") return "progression";
  if (route.kind === "unlock") return "progressionUnlock";
  return "progressionClaim";
}

async function guardReviewedPlayerRequest(
  request: Request,
  operation: ReviewedPlayerRateLimitOperation,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<Response | null> {
  try {
    const client = createConfiguredClient(dependencies);
    const scope = await (dependencies.resolveScope ?? resolveScope)(request, client);
    const decision = await (dependencies.enforcePostAuth ?? enforcePlayerRateLimit)({
      action: operation.action,
      profile: operation.profile,
      request,
      scope,
    }, client);
    return decision.allowed ? null : rateLimitExceededResponse(decision);
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return rateLimitUnavailableResponse();
  }
}

async function guardPlayerLoginRequest(
  request: Request,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<Response | null> {
  try {
    const client = createConfiguredClient(dependencies);
    const decision = await (dependencies.enforcePreAuth ?? enforcePreAuthRateLimit)({
      action: "player.login.attempt",
      profile: "login",
      request,
    }, client);
    return decision.allowed ? null : rateLimitExceededResponse(decision);
  } catch {
    return rateLimitUnavailableResponse();
  }
}

function createConfiguredClient(dependencies: PlayerRateLimitDispatchDependencies): EdgeSupabaseClient {
  const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
  if (!envResult.ok) throw new Error("missing runtime configuration");
  return dependencies.createServiceClient(envResult.value);
}
function resolveScope(request: Request, client: EdgeSupabaseClient) {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (tokenHash) => resolveActivePlayerSession(client, tokenHash),
  });
}
