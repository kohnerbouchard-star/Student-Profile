import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";
import {
  buildAuthenticatedRateLimitBuckets,
  buildPreAuthRateLimitBuckets,
  readTrustedClientIp,
  TRUSTED_IP_HEADERS,
  type TrustedIpHeader,
  validateRateLimitHmacSecret,
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

export interface EnforceStaffRateLimitInput {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
  readonly request: Request;
  readonly staffUuid: string;
  readonly gameUuid: string;
}

export interface EnforcePreAuthRateLimitInput {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
  readonly request: Request;
}

export interface EnforceScopedRateLimitInput {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
  readonly request: Request;
  readonly identityUuid: string;
  readonly gameUuid: string;
}

export interface PlayerRateLimitServiceDependencies {
  readonly readConfig?: () => PlayerRateLimitRuntimeConfig;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => RateLimitRepository;
}

export function enforcePlayerRateLimit(
  input: EnforcePlayerRateLimitInput,
  client: EdgeSupabaseClient,
  dependencies: PlayerRateLimitServiceDependencies = {},
): Promise<RateLimitDecision> {
  return enforceScopedRateLimit({
    action: input.action,
    profile: input.profile,
    request: input.request,
    identityUuid: input.scope.playerUuid,
    gameUuid: input.scope.gameId,
  }, client, dependencies);
}

export function enforceStaffRateLimit(
  input: EnforceStaffRateLimitInput,
  client: EdgeSupabaseClient,
  dependencies: PlayerRateLimitServiceDependencies = {},
): Promise<RateLimitDecision> {
  return enforceScopedRateLimit({
    action: input.action,
    profile: input.profile,
    request: input.request,
    identityUuid: input.staffUuid,
    gameUuid: input.gameUuid,
  }, client, dependencies);
}

export async function enforcePreAuthRateLimit(
  input: EnforcePreAuthRateLimitInput,
  client: EdgeSupabaseClient,
  dependencies: PlayerRateLimitServiceDependencies = {},
): Promise<RateLimitDecision> {
  const config = (dependencies.readConfig ?? readPlayerRateLimitConfig)();
  const ipAddress = readTrustedClientIp(input.request, config.trustedIpHeader);
  const buckets = await buildPreAuthRateLimitBuckets({
    action: input.action,
    ipAddress,
    profile: input.profile,
  }, config.hmacSecret);
  const repository = dependencies.createRepository
    ? dependencies.createRepository(client)
    : new SupabaseRateLimitRepository(
      client,
      "consume_pre_auth_request_rate_limits_v1",
    );
  return repository.consume(buckets);
}

export function readPlayerRateLimitConfig(
  getEnv: (name: string) => string | undefined = Deno.env.get,
): PlayerRateLimitRuntimeConfig {
  const hmacSecret = getEnv("ECONOVARIA_RATE_LIMIT_HMAC_SECRET") ?? "";
  const header = (getEnv("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") ?? "")
    .trim().toLowerCase();

  validateRateLimitHmacSecret(hmacSecret);
  if (!TRUSTED_IP_HEADERS.includes(header as TrustedIpHeader)) {
    throw invalidConfig();
  }

  return {
    hmacSecret,
    trustedIpHeader: header as TrustedIpHeader,
  };
}

export async function enforceScopedRateLimit(
  input: EnforceScopedRateLimitInput,
  client: EdgeSupabaseClient,
  dependencies: PlayerRateLimitServiceDependencies = {},
): Promise<RateLimitDecision> {
  const config = (dependencies.readConfig ?? readPlayerRateLimitConfig)();
  const ipAddress = readTrustedClientIp(input.request, config.trustedIpHeader);
  const buckets = await buildAuthenticatedRateLimitBuckets({
    action: input.action,
    gameUuid: input.gameUuid,
    identityUuid: input.identityUuid,
    ipAddress,
    profile: input.profile,
  }, config.hmacSecret);
  const repository = dependencies.createRepository
    ? dependencies.createRepository(client)
    : new SupabaseRateLimitRepository(client);
  return repository.consume(buckets);
}

function invalidConfig(): RateLimitError {
  return new RateLimitError(
    "invalid_rate_limit_config",
    "Request rate limiting is not configured.",
  );
}
