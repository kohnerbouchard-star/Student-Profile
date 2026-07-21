import { sha256Hex } from "../platform/supabase/edgeCrypto.ts";
import {
  EdgeActivationError,
  jsonError,
} from "../platform/supabase/edgeResponse.ts";
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
import {
  enforcePlayerRateLimit,
  type EnforcePlayerRateLimitInput,
  enforcePreAuthRateLimit,
  type EnforcePreAuthRateLimitInput,
} from "./playerRateLimitService.ts";
import type {
  PlayerRateLimitProfile,
  RateLimitDecision,
} from "./rateLimitContracts.ts";
import {
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
} from "./rateLimitHttp.ts";

export interface ReviewedPlayerRateLimitOperation {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
}

export type ReviewedPlayerRateLimitEndpointKey =
  | PlayerCapabilityEndpointKey
  | "inventoryRedemption";

export interface PlayerRateLimitDispatchDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
  ) => Promise<PlayerRequestScope>;
  readonly enforcePostAuth?: (
    input: EnforcePlayerRateLimitInput,
    client: EdgeSupabaseClient,
  ) => Promise<RateLimitDecision>;
  readonly enforcePreAuth?: (
    input: EnforcePreAuthRateLimitInput,
    client: EdgeSupabaseClient,
  ) => Promise<RateLimitDecision>;
}

const redemptionOperations = byMethod({
  GET: operation("player.inventory.redemptions.read", "read"),
  POST: operation("player.inventory.redemptions.request", "write"),
});

const REVIEWED_PLAYER_RATE_LIMIT_OPERATIONS: Readonly<
  Record<
    ReviewedPlayerRateLimitEndpointKey,
    Readonly<Partial<Record<string, ReviewedPlayerRateLimitOperation>>>
  >
> = Object.freeze({
  bootstrap: byMethod({
    GET: operation("player.session.read", "read"),
  }),
  capabilities: byMethod({
    GET: operation("player.capabilities.read", "read"),
  }),
  banking: byMethod({
    GET: operation("player.banking.read", "read"),
  }),
  contractAccept: byMethod({
    POST: operation("player.contracts.accept", "write"),
  }),
  contractSubmit: byMethod({
    POST: operation("player.contracts.submit", "write"),
  }),
  contracts: byMethod({
    GET: operation("player.contracts.read", "read"),
  }),
  countries: byMethod({
    GET: operation("player.countries.read", "read"),
  }),
  country: byMethod({
    GET: operation("player.country.read", "read"),
  }),
  dashboard: byMethod({
    GET: operation("player.dashboard.read", "read"),
  }),
  inventory: byMethod({
    GET: operation("player.inventory.read", "read"),
  }),
  inventoryRedemption: redemptionOperations,
  inventoryRedemptions: redemptionOperations,
  logout: byMethod({
    POST: operation("player.session.logout", "sensitive"),
  }),
  market: byMethod({
    GET: operation("player.market.read", "read"),
  }),
  marketAsset: byMethod({
    GET: operation("player.asset.read", "read"),
  }),
  marketOrder: byMethod({
    POST: operation("player.market.order", "sensitive"),
  }),
  marketWatchlist: byMethod({
    DELETE: operation("player.watchlist.write", "write"),
    GET: operation("player.watchlist.read", "read"),
    PUT: operation("player.watchlist.write", "write"),
  }),
  news: byMethod({
    GET: operation("player.news.read", "read"),
  }),
  notifications: byMethod({
    GET: operation("player.notifications.read", "read"),
  }),
  notificationsRead: byMethod({
    POST: operation("player.notifications.write", "write"),
  }),
  storyDeliveries: byMethod({
    GET: operation("player.story.deliveries.read", "read"),
  }),
  storyDeliveryState: byMethod({
    POST: operation("player.story.deliveries.write", "write"),
  }),
  portfolio: byMethod({
    GET: operation("player.portfolio.read", "read"),
  }),
  progression: byMethod({
    GET: operation("player.progression.read", "read"),
  }),
  progressionUnlock: byMethod({
    POST: operation("player.progression.skill.unlock", "sensitive"),
  }),
  progressionClaim: byMethod({
    POST: operation("player.progression.reward.claim", "sensitive"),
  }),
  store: byMethod({
    GET: operation("player.store.read", "read"),
  }),
  storeQuote: byMethod({
    POST: operation("player.store.quote", "write"),
  }),
  storePurchase: byMethod({
    GET: operation("player.store.purchases.read", "read"),
    POST: operation("player.store.purchase", "sensitive"),
  }),
});

export function readReviewedPlayerRateLimitOperation(
  endpointKey: ReviewedPlayerRateLimitEndpointKey,
  method: string,
): ReviewedPlayerRateLimitOperation | null {
  return REVIEWED_PLAYER_RATE_LIMIT_OPERATIONS[endpointKey][
    method.toUpperCase()
  ] ?? null;
}

export async function dispatchRateLimitedReviewedPlayerRequest(
  request: Request,
  endpointKey: ReviewedPlayerRateLimitEndpointKey,
  next: () => Promise<Response> | Response,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<Response> {
  const operation = readReviewedPlayerRateLimitOperation(
    endpointKey,
    request.method,
  );
  if (!operation) return next();

  const limited = await guardReviewedPlayerRequest(
    request,
    operation,
    dependencies,
  );
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

async function guardReviewedPlayerRequest(
  request: Request,
  operation: ReviewedPlayerRateLimitOperation,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<Response | null> {
  try {
    const client = createConfiguredClient(dependencies);
    const scope = await (dependencies.resolveScope ?? resolveScope)(
      request,
      client,
    );
    const decision = await (
      dependencies.enforcePostAuth ?? enforcePlayerRateLimit
    )({
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
    const decision = await (
      dependencies.enforcePreAuth ?? enforcePreAuthRateLimit
    )({
      action: "player.login.attempt",
      profile: "login",
      request,
    }, client);
    return decision.allowed ? null : rateLimitExceededResponse(decision);
  } catch {
    return rateLimitUnavailableResponse();
  }
}

function createConfiguredClient(
  dependencies: PlayerRateLimitDispatchDependencies,
): EdgeSupabaseClient {
  const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
  if (!envResult.ok) throw new Error("missing runtime configuration");
  return dependencies.createServiceClient(envResult.value);
}

function resolveScope(request: Request, client: EdgeSupabaseClient) {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (sessionTokenHash) =>
      resolveActivePlayerSession(client, sessionTokenHash),
  });
}

function operation(
  action: string,
  profile: PlayerRateLimitProfile,
): ReviewedPlayerRateLimitOperation {
  return Object.freeze({ action, profile });
}

function byMethod(
  operations: Readonly<Record<string, ReviewedPlayerRateLimitOperation>>,
) {
  return Object.freeze(operations);
}
