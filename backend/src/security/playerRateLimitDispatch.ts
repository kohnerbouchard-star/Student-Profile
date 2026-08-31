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
import {
  createPlayerRequestApplicationContext,
  type PlayerRequestApplicationContext,
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
import type { RateLimitDecision } from "./rateLimitContracts.ts";
import {
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
} from "./rateLimitHttp.ts";
import {
  enforcePlayerBrowserResponsePrivacy,
  unsafePlayerBrowserResponse,
} from "./playerBrowserResponsePrivacy.ts";
import {
  readReviewedPlayerRateLimitOperation,
  type ReviewedPlayerRateLimitEndpointKey,
  type ReviewedPlayerRateLimitOperation,
} from "./playerRateLimitOperationRegistry.ts";

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
  readonly createRequestId?: () => string;
}

type ReviewedPlayerRequestGuardResult =
  | {
    readonly ok: true;
    readonly context: PlayerRequestApplicationContext;
  }
  | {
    readonly ok: false;
    readonly response: Response;
  };

export async function dispatchRateLimitedReviewedPlayerRequest(
  request: Request,
  endpointKey: ReviewedPlayerRateLimitEndpointKey,
  next: (
    context?: PlayerRequestApplicationContext,
  ) => Promise<Response> | Response,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<Response> {
  const operation = readReviewedPlayerRateLimitOperation(
    endpointKey,
    request.method,
  );

  try {
    if (!operation) {
      return await enforcePlayerBrowserResponsePrivacy(await next());
    }

    const guard = await guardReviewedPlayerRequest(
      request,
      {
        ...operation,
        action: threadScopedMessagingAction(request, endpointKey) ??
          operation.action,
      },
      dependencies,
    );
    const response = guard.ok === false
      ? guard.response
      : await next(guard.context);
    return await enforcePlayerBrowserResponsePrivacy(response);
  } catch {
    return unsafePlayerBrowserResponse();
  }
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

function threadScopedMessagingAction(
  request: Request,
  endpointKey: ReviewedPlayerRateLimitEndpointKey,
): string | null {
  if (
    !new Set<ReviewedPlayerRateLimitEndpointKey>([
      "messageThread",
      "messageSend",
      "messageRead",
    ]).has(endpointKey)
  ) return null;
  const match = new URL(request.url).pathname.match(
    /\/messages\/threads\/thr_([0-9a-f]{32})(?:\/|$)/,
  );
  return match?.[1] ? `player.messages.thr_${match[1].slice(0, 24)}` : null;
}

async function guardReviewedPlayerRequest(
  request: Request,
  operation: ReviewedPlayerRateLimitOperation,
  dependencies: PlayerRateLimitDispatchDependencies,
): Promise<ReviewedPlayerRequestGuardResult> {
  try {
    const client = createConfiguredClient(dependencies);
    const context = createPlayerRequestApplicationContext({
      scope: await (dependencies.resolveScope ?? resolveScope)(request, client),
      requestId: (dependencies.createRequestId ?? createRequestId)(),
    });
    const decision = await (
      dependencies.enforcePostAuth ?? enforcePlayerRateLimit
    )({
      action: operation.action,
      profile: operation.profile,
      request,
      scope: context,
    }, client);
    return decision.allowed ? { ok: true, context } : {
      ok: false,
      response: rateLimitExceededResponse(decision),
    };
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return {
        ok: false,
        response: jsonError(error.status, {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        }),
      };
    }
    return {
      ok: false,
      response: rateLimitUnavailableResponse(),
    };
  }
}

function createRequestId(): string {
  return crypto.randomUUID();
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

export { readReviewedPlayerRateLimitOperation } from "./playerRateLimitOperationRegistry.ts";
export type {
  ReviewedPlayerRateLimitEndpointKey,
  ReviewedPlayerRateLimitOperation,
} from "./playerRateLimitOperationRegistry.ts";
