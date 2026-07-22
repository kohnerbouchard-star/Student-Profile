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
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../domains/players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../domains/players/api/playerSessionHttpHelpers.ts";
import {
  enforcePlayerRateLimit,
  type EnforcePlayerRateLimitInput,
} from "./playerRateLimitService.ts";
import type { RateLimitDecision } from "./rateLimitContracts.ts";
import {
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
} from "./rateLimitHttp.ts";

export type PlayerCraftingRateLimitEndpointKey =
  | "crafting"
  | "craftingJobCancel"
  | "craftingJobClaim"
  | "itemEffectUse"
  | "equipmentEquip"
  | "equipmentSalvage";

interface CraftingOperation {
  readonly action: string;
  readonly profile: "read" | "write" | "sensitive";
}

const OPERATIONS: Readonly<
  Record<PlayerCraftingRateLimitEndpointKey, Readonly<Partial<Record<string, CraftingOperation>>>>
> = Object.freeze({
  crafting: byMethod({
    GET: operation("player.crafting.read", "read"),
    POST: operation("player.crafting.start", "sensitive"),
  }),
  craftingJobCancel: byMethod({
    POST: operation("player.crafting.cancel", "write"),
  }),
  craftingJobClaim: byMethod({
    POST: operation("player.crafting.claim", "sensitive"),
  }),
  itemEffectUse: byMethod({
    POST: operation("player.items.effect.use", "sensitive"),
  }),
  equipmentEquip: byMethod({
    POST: operation("player.equipment.equip", "write"),
  }),
  equipmentSalvage: byMethod({
    POST: operation("player.equipment.salvage", "sensitive"),
  }),
});

export interface PlayerCraftingRateLimitDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
  ) => Promise<PlayerRequestScope>;
  readonly enforce?: (
    input: EnforcePlayerRateLimitInput,
    client: EdgeSupabaseClient,
  ) => Promise<RateLimitDecision>;
}

export function readPlayerCraftingRateLimitOperation(
  endpointKey: PlayerCraftingRateLimitEndpointKey,
  method: string,
): CraftingOperation | null {
  return OPERATIONS[endpointKey][method.toUpperCase()] ?? null;
}

export async function dispatchRateLimitedPlayerCraftingRequest(
  request: Request,
  endpointKey: PlayerCraftingRateLimitEndpointKey,
  next: () => Promise<Response> | Response,
  dependencies: PlayerCraftingRateLimitDependencies,
): Promise<Response> {
  const reviewed = readPlayerCraftingRateLimitOperation(endpointKey, request.method);
  if (!reviewed) return next();
  try {
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!envResult.ok) return rateLimitUnavailableResponse();
    const client = dependencies.createServiceClient(envResult.value);
    const scope = await (dependencies.resolveScope ?? resolveScope)(request, client);
    const decision = await (dependencies.enforce ?? enforcePlayerRateLimit)({
      action: reviewed.action,
      profile: reviewed.profile,
      request,
      scope,
    }, client);
    return decision.allowed ? next() : rateLimitExceededResponse(decision);
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

function resolveScope(request: Request, client: EdgeSupabaseClient) {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (sessionTokenHash) =>
      resolveActivePlayerSession(client, sessionTokenHash),
  });
}

function operation(
  action: string,
  profile: CraftingOperation["profile"],
): CraftingOperation {
  return Object.freeze({ action, profile });
}

function byMethod(operations: Readonly<Record<string, CraftingOperation>>) {
  return Object.freeze(operations);
}
