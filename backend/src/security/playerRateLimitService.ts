import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";
import {
  buildPlayerRateLimitBuckets,
  type PlayerRateLimitContext,
  readTrustedClientIp,
  TRUSTED_IP_HEADERS,
  type TrustedIpHeader,
} from "./rateLimitKeying.ts";
import {
  type PlayerRateLimitProfile,
  type RateLimitDecision,
  RateLimitError,
  type RateLimitRepository,
} from "./rateLimitContracts.ts";
import { SupabaseRateLimitRepository } from "./supabaseRateLimitRepository.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

export interface PlayerRateLimitRuntimeConfig {
  readonly hmacSecret: string;
  readonly trustedIpHeader: TrustedIpHeader;
}

export interface EnforcePlayerRateLimitInput {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
  readonly request: Request;
  readonly scope: PlayerRequestScope;
}

export interface PlayerRateLimitServiceDependencies {
  readonly readConfig?: () => PlayerRateLimitRuntimeConfig;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => RateLimitRepository;
}

export async function enforcePlayerRateLimit(
  input: EnforcePlayerRateLimitInput,
  client: EdgeSupabaseClient,
  dependencies: PlayerRateLimitServiceDependencies = {},
): Promise<RateLimitDecision> {
  const config = (dependencies.readConfig ?? readPlayerRateLimitConfig)();
  const ipAddress = readTrustedClientIp(input.request, config.trustedIpHeader);
  const context: PlayerRateLimitContext = {
    action: input.action,
    gameUuid: input.scope.gameId,
    ipAddress,
    playerUuid: input.scope.playerUuid,
    profile: input.profile,
  };
  const buckets = await buildPlayerRateLimitBuckets(context, config.hmacSecret);
  const repository = dependencies.createRepository
    ? dependencies.createRepository(client)
    : new SupabaseRateLimitRepository(client);
  return repository.consume(buckets);
}

export function readPlayerRateLimitConfig(
  getEnv: (name: string) => string | undefined = Deno.env.get,
): PlayerRateLimitRuntimeConfig {
  const hmacSecret = getEnv("ECONOVARIA_RATE_LIMIT_HMAC_SECRET") ?? "";
  const header = (getEnv("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") ?? "")
    .trim().toLowerCase();

  if (
    hmacSecret.length < 32 || hmacSecret.length > 4_096 ||
    new Set(hmacSecret).size < 8
  ) {
    throw invalidConfig();
  }
  if (!TRUSTED_IP_HEADERS.includes(header as TrustedIpHeader)) {
    throw invalidConfig();
  }

  return {
    hmacSecret,
    trustedIpHeader: header as TrustedIpHeader,
  };
}

function invalidConfig(): RateLimitError {
  return new RateLimitError(
    "invalid_rate_limit_config",
    "Request rate limiting is not configured.",
  );
}
