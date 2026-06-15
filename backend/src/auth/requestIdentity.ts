import {
  denyAccess,
  type AccessResult,
  type PlayerIdentity,
  type RequestIdentity,
  type StaffIdentity,
  type SupabaseAuthUser,
} from "./types";

export type HeaderValue = string | ReadonlyArray<string> | undefined;
export type HeaderSource = Record<string, HeaderValue>;

export interface RequestIdentitySources {
  readonly supabaseAuthUser?: SupabaseAuthUser | null;
  readonly playerSessionToken?: string | null;
}

export interface RequestIdentityResolvers {
  resolveStaffIdentity(
    supabaseAuthUser: SupabaseAuthUser,
  ): Promise<AccessResult<StaffIdentity>>;

  resolvePlayerIdentityFromSessionToken(
    playerSessionToken: string,
  ): Promise<AccessResult<PlayerIdentity>>;
}

export async function resolveRequestIdentity(
  sources: RequestIdentitySources,
  resolvers: RequestIdentityResolvers,
): Promise<AccessResult<RequestIdentity>> {
  const playerSessionToken = sources.playerSessionToken?.trim() || null;
  const hasStaffAuth = Boolean(sources.supabaseAuthUser?.id);
  const hasPlayerSession = Boolean(playerSessionToken);

  if (hasStaffAuth && hasPlayerSession) {
    return denyAccess(
      "ambiguous_identity",
      "Request must resolve to either staff identity or player identity, not both.",
      400,
    );
  }

  if (sources.supabaseAuthUser?.id) {
    return resolvers.resolveStaffIdentity(sources.supabaseAuthUser);
  }

  if (playerSessionToken) {
    return resolvers.resolvePlayerIdentityFromSessionToken(playerSessionToken);
  }

  return denyAccess(
    "missing_identity",
    "Request did not include a staff auth user or player session token.",
    401,
  );
}

export function readHeader(headers: HeaderSource, name: string): string | null {
  const requestedName = name.toLowerCase();
  const matchingKey = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === requestedName,
  );
  const value = matchingKey ? headers[matchingKey] : undefined;

  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

export function readBearerToken(headers: HeaderSource): string | null {
  const authorization = readHeader(headers, "authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim() || null;
}

export function readPlayerSessionToken(
  headers: HeaderSource,
  headerName = "x-player-session-token",
): string | null {
  return readHeader(headers, headerName);
}
