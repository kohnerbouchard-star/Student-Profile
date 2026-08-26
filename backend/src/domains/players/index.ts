export {
  createPlayerRequestApplicationContext,
  readRequestedGameSessionId,
  rejectClientSuppliedBodyIdentity,
  rejectClientSuppliedPlayerIdentity,
  requireMatchingPlayerGameSession,
  resolvePlayerRequestScope,
} from "./api/playerRequestScope.ts";
export type {
  CreatePlayerRequestApplicationContextInput,
  PlayerRequestApplicationActor,
  PlayerRequestApplicationContext,
  PlayerRequestAuthorizationContext,
  PlayerRequestScope,
  PlayerRequestScopeDependencies,
  ResolvePlayerRequestScopeOptions,
} from "./api/playerRequestScope.ts";
export { readPlayerApiRouteSegments } from "./api/playerApiRouteSegments.ts";
export {
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "./api/playerSessionHttpHelpers.ts";
export type { PlayerCapabilityEndpointKey } from "./contracts/playerCapabilityManifestContracts.ts";
