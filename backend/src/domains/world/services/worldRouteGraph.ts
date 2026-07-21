import {
  type PlayerResidencyState,
  type PlayerTravelContext,
  type TravelLegQuote,
  type TravelQuote,
  type WorldDefinitionBundle,
  type WorldLocationState,
  type WorldRouteDefinition,
  type WorldRouteState,
  type WorldRouteStateCommand,
  type WorldRuntimeState,
  WorldRuntimeError,
  WORLD_ROUTE_MODES,
} from "../contracts/worldRuntimeContracts.ts";

export function validateWorldDefinition(bundle: WorldDefinitionBundle): void {
  if (
    !bundle.definition.packId.trim() ||
    !bundle.definition.packVersion.trim() ||
    !bundle.definition.definitionDigest.trim()
  ) {
    throw invalid("World definition identity, version, and digest are required.");
  }
  if (bundle.locations.length !== 50) {
    throw invalid(`World definition requires exactly 50 locations; received ${bundle.locations.length}.`);
  }
  const locationIds = new Set<string>();
  for (const location of bundle.locations) {
    if (
      !/^loc_[a-z0-9_]+$/.test(location.publicLocationId) ||
      !location.countryId.trim() ||
      !location.name.trim() ||
      locationIds.has(location.publicLocationId)
    ) {
      throw invalid(`Location ${location.publicLocationId || "<missing>"} is invalid or duplicated.`);
    }
    locationIds.add(location.publicLocationId);
  }
  if (bundle.routes.length === 0) throw invalid("World definition requires at least one route.");
  const routeIds = new Set<string>();
  for (const route of bundle.routes) {
    if (
      !/^rte_[a-z0-9_]+$/.test(route.publicRouteId) ||
      routeIds.has(route.publicRouteId) ||
      route.fromLocationId === route.toLocationId ||
      !locationIds.has(route.fromLocationId) ||
      !locationIds.has(route.toLocationId) ||
      !WORLD_ROUTE_MODES.includes(route.mode) ||
      !Number.isSafeInteger(route.baseCostMinor) ||
      route.baseCostMinor < 0 ||
      !Number.isSafeInteger(route.baseDurationMinutes) ||
      route.baseDurationMinutes <= 0
    ) {
      throw invalid(`Route ${route.publicRouteId || "<missing>"} is invalid or duplicated.`);
    }
    routeIds.add(route.publicRouteId);
  }
}

export function createWorldRuntimeState(
  bundle: WorldDefinitionBundle,
  gameId: string,
  now: string,
): WorldRuntimeState {
  validateWorldDefinition(bundle);
  requireDate(now);
  if (!gameId.trim()) throw invalid("Game scope is required.");
  return Object.freeze({
    gameId,
    definition: Object.freeze({ ...bundle.definition }),
    locationStates: Object.freeze(bundle.locations.map((location): WorldLocationState =>
      Object.freeze({
        publicLocationId: location.publicLocationId,
        availability: location.enabled ? "normal" : "closed",
        revision: 0,
        updatedAt: now,
      })
    )),
    routeStates: Object.freeze(bundle.routes.map((route): WorldRouteState =>
      Object.freeze({
        publicRouteId: route.publicRouteId,
        status: "open",
        reason: "normal",
        costMultiplierBasisPoints: 10_000,
        durationMultiplierBasisPoints: 10_000,
        revision: 0,
        updatedAt: now,
      })
    )),
    executedCommandKeys: Object.freeze([]),
    revision: 0,
    updatedAt: now,
  });
}

export function applyRouteStateCommand(
  state: WorldRuntimeState,
  bundle: WorldDefinitionBundle,
  command: WorldRouteStateCommand,
): WorldRuntimeState {
  validateWorldDefinition(bundle);
  requireDate(command.occurredAt);
  if (command.gameId !== state.gameId) {
    throw new WorldRuntimeError(
      "world_game_scope_mismatch",
      "Route-state command belongs to another game.",
      false,
    );
  }
  if (state.executedCommandKeys.includes(command.commandKey)) return state;
  if (command.expectedRevision !== state.revision) {
    throw new WorldRuntimeError(
      "world_revision_conflict",
      "World runtime changed before the route command was applied.",
      true,
    );
  }
  if (
    !command.commandKey.trim() ||
    command.publicRouteIds.length === 0 ||
    new Set(command.publicRouteIds).size !== command.publicRouteIds.length ||
    !validMultiplier(command.costMultiplierBasisPoints) ||
    !validMultiplier(command.durationMultiplierBasisPoints)
  ) {
    throw new WorldRuntimeError(
      "world_command_invalid",
      "Route-state command is malformed or unbounded.",
      false,
    );
  }
  const knownRoutes = new Set(bundle.routes.map((route) => route.publicRouteId));
  if (command.publicRouteIds.some((routeId) => !knownRoutes.has(routeId))) {
    throw new WorldRuntimeError(
      "world_command_invalid",
      "Route-state command references an unknown route.",
      false,
    );
  }
  const targetIds = new Set(command.publicRouteIds);
  return Object.freeze({
    ...state,
    routeStates: Object.freeze(state.routeStates.map((routeState) =>
      targetIds.has(routeState.publicRouteId)
        ? Object.freeze({
          ...routeState,
          status: command.status,
          reason: command.reason,
          costMultiplierBasisPoints: command.costMultiplierBasisPoints,
          durationMultiplierBasisPoints: command.durationMultiplierBasisPoints,
          revision: routeState.revision + 1,
          updatedAt: command.occurredAt,
        })
        : routeState
    )),
    executedCommandKeys: Object.freeze([
      ...state.executedCommandKeys,
      command.commandKey,
    ].slice(-512)),
    revision: state.revision + 1,
    updatedAt: command.occurredAt,
  });
}

export function applyLocationAvailability(input: {
  readonly state: WorldRuntimeState;
  readonly bundle: WorldDefinitionBundle;
  readonly gameId: string;
  readonly commandKey: string;
  readonly publicLocationIds: readonly string[];
  readonly availability: WorldLocationState["availability"];
  readonly expectedRevision: number;
  readonly occurredAt: string;
}): WorldRuntimeState {
  validateWorldDefinition(input.bundle);
  requireDate(input.occurredAt);
  if (input.gameId !== input.state.gameId) {
    throw new WorldRuntimeError("world_game_scope_mismatch", "Location command belongs to another game.", false);
  }
  if (input.state.executedCommandKeys.includes(input.commandKey)) return input.state;
  if (input.expectedRevision !== input.state.revision) {
    throw new WorldRuntimeError("world_revision_conflict", "World runtime changed before location update.", true);
  }
  const known = new Set(input.bundle.locations.map((location) => location.publicLocationId));
  if (
    !input.commandKey.trim() ||
    input.publicLocationIds.length === 0 ||
    new Set(input.publicLocationIds).size !== input.publicLocationIds.length ||
    input.publicLocationIds.some((locationId) => !known.has(locationId))
  ) {
    throw new WorldRuntimeError("world_command_invalid", "Location command is invalid.", false);
  }
  const targetIds = new Set(input.publicLocationIds);
  return Object.freeze({
    ...input.state,
    locationStates: Object.freeze(input.state.locationStates.map((locationState) =>
      targetIds.has(locationState.publicLocationId)
        ? Object.freeze({
          ...locationState,
          availability: input.availability,
          revision: locationState.revision + 1,
          updatedAt: input.occurredAt,
        })
        : locationState
    )),
    executedCommandKeys: Object.freeze([
      ...input.state.executedCommandKeys,
      input.commandKey,
    ].slice(-512)),
    revision: input.state.revision + 1,
    updatedAt: input.occurredAt,
  });
}

export function quoteTravel(
  bundle: WorldDefinitionBundle,
  state: WorldRuntimeState,
  context: PlayerTravelContext,
  toLocationId: string,
): TravelQuote {
  validateWorldDefinition(bundle);
  if (
    context.gameId !== state.gameId ||
    context.residency.gameId !== state.gameId ||
    context.residency.gameSessionId !== context.gameSessionId ||
    context.residency.playerUuid !== context.playerUuid
  ) {
    throw new WorldRuntimeError(
      "world_game_scope_mismatch",
      "Travel context is not scoped to this game session.",
      false,
    );
  }
  const locations = new Map(bundle.locations.map((location) => [location.publicLocationId, location]));
  if (!locations.has(context.currentLocationId) || !locations.has(toLocationId)) {
    throw new WorldRuntimeError("world_route_not_found", "Travel endpoint does not exist.", false);
  }
  const locationStates = new Map(state.locationStates.map((item) => [item.publicLocationId, item]));
  for (const endpoint of [context.currentLocationId, toLocationId]) {
    const endpointState = locationStates.get(endpoint);
    if (!endpointState || endpointState.availability === "closed") {
      throw new WorldRuntimeError("world_location_unavailable", `Location ${endpoint} is unavailable.`, true);
    }
  }
  if (context.currentLocationId === toLocationId) {
    return Object.freeze({
      gameId: state.gameId,
      playerUuid: context.playerUuid,
      fromLocationId: context.currentLocationId,
      toLocationId,
      totalCostMinor: 0,
      totalDurationMinutes: 0,
      legs: Object.freeze([]),
      routeStateRevision: state.revision,
    });
  }
  const allowedModes = new Set(context.allowedModes);
  if (allowedModes.size === 0 || [...allowedModes].some((mode) => !WORLD_ROUTE_MODES.includes(mode))) {
    throw new WorldRuntimeError("world_travel_mode_forbidden", "No reviewed travel mode is available.", false);
  }
  const routeStates = new Map(state.routeStates.map((item) => [item.publicRouteId, item]));
  const adjacency = buildAdjacency(bundle.routes);
  const frontier: Candidate[] = [{
    locationId: context.currentLocationId,
    totalCostMinor: 0,
    totalDurationMinutes: 0,
    legs: [],
    signature: "",
  }];
  const best = new Map<string, string>();
  while (frontier.length > 0) {
    frontier.sort(compareCandidates);
    const current = frontier.shift();
    if (!current) break;
    const scoreKey = candidateKey(current);
    const previous = best.get(current.locationId);
    if (previous && previous <= scoreKey) continue;
    best.set(current.locationId, scoreKey);
    if (current.locationId === toLocationId) {
      return Object.freeze({
        gameId: state.gameId,
        playerUuid: context.playerUuid,
        fromLocationId: context.currentLocationId,
        toLocationId,
        totalCostMinor: current.totalCostMinor,
        totalDurationMinutes: current.totalDurationMinutes,
        legs: Object.freeze(current.legs),
        routeStateRevision: state.revision,
      });
    }
    for (const edge of adjacency.get(current.locationId) ?? []) {
      if (!allowedModes.has(edge.route.mode)) continue;
      const runtime = routeStates.get(edge.route.publicRouteId);
      if (!runtime || runtime.status === "closed") continue;
      const destinationState = locationStates.get(edge.toLocationId);
      if (!destinationState || destinationState.availability === "closed") continue;
      const scarcityMultiplier = destinationState.availability === "shortage" ? 11_500 : 10_000;
      const conflictMultiplier = destinationState.availability === "conflict" ? 12_500 : 10_000;
      const costMinor = applyBasisPoints(
        applyBasisPoints(edge.route.baseCostMinor, runtime.costMultiplierBasisPoints),
        scarcityMultiplier,
      );
      const durationMinutes = applyBasisPoints(
        applyBasisPoints(edge.route.baseDurationMinutes, runtime.durationMultiplierBasisPoints),
        conflictMultiplier,
      );
      const leg: TravelLegQuote = Object.freeze({
        publicRouteId: edge.route.publicRouteId,
        fromLocationId: current.locationId,
        toLocationId: edge.toLocationId,
        mode: edge.route.mode,
        costMinor,
        durationMinutes,
      });
      frontier.push({
        locationId: edge.toLocationId,
        totalCostMinor: current.totalCostMinor + costMinor,
        totalDurationMinutes: current.totalDurationMinutes + durationMinutes,
        legs: [...current.legs, leg],
        signature: `${current.signature}|${edge.route.publicRouteId}`,
      });
    }
  }
  throw new WorldRuntimeError(
    "world_route_not_found",
    "No eligible open route reaches the requested location.",
    true,
  );
}

export function createResidencyState(input: {
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly currentCountryId: string;
  readonly currencyCode: string;
  readonly eligibleCountryIds: readonly string[];
  readonly now: string;
}): PlayerResidencyState {
  requireDate(input.now);
  if ([input.gameId, input.gameSessionId, input.playerUuid, input.currentCountryId, input.currencyCode].some((value) => !value.trim())) {
    throw new WorldRuntimeError("world_command_invalid", "Residency scope is required.", false);
  }
  const eligible = [...new Set(input.eligibleCountryIds)].filter((countryId) => countryId.trim());
  return Object.freeze({
    gameId: input.gameId,
    gameSessionId: input.gameSessionId,
    playerUuid: input.playerUuid,
    currentCountryId: input.currentCountryId,
    currencyCode: input.currencyCode,
    eligibleCountryIds: Object.freeze(eligible),
    pendingCountryId: null,
    revision: 0,
    updatedAt: input.now,
  });
}

export function requestResidencyChange(
  state: PlayerResidencyState,
  input: {
    readonly gameId: string;
    readonly expectedRevision: number;
    readonly countryId: string;
    readonly requestedAt: string;
  },
): PlayerResidencyState {
  requireDate(input.requestedAt);
  if (input.gameId !== state.gameId) {
    throw new WorldRuntimeError("world_game_scope_mismatch", "Residency request belongs to another game.", false);
  }
  if (input.expectedRevision !== state.revision) {
    throw new WorldRuntimeError("world_revision_conflict", "Residency state changed before the request.", true);
  }
  if (!state.eligibleCountryIds.includes(input.countryId)) {
    throw new WorldRuntimeError(
      "world_command_invalid",
      "Country is not currently eligible under public game rules.",
      false,
    );
  }
  return Object.freeze({
    ...state,
    pendingCountryId: input.countryId,
    revision: state.revision + 1,
    updatedAt: input.requestedAt,
  });
}

interface Edge {
  readonly route: WorldRouteDefinition;
  readonly toLocationId: string;
}

interface Candidate {
  readonly locationId: string;
  readonly totalCostMinor: number;
  readonly totalDurationMinutes: number;
  readonly legs: readonly TravelLegQuote[];
  readonly signature: string;
}

function buildAdjacency(routes: readonly WorldRouteDefinition[]): Map<string, Edge[]> {
  const adjacency = new Map<string, Edge[]>();
  for (const route of routes) {
    addEdge(adjacency, route.fromLocationId, { route, toLocationId: route.toLocationId });
    if (route.bidirectional) {
      addEdge(adjacency, route.toLocationId, { route, toLocationId: route.fromLocationId });
    }
  }
  return adjacency;
}

function addEdge(adjacency: Map<string, Edge[]>, from: string, edge: Edge): void {
  const edges = adjacency.get(from) ?? [];
  edges.push(edge);
  adjacency.set(from, edges);
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return left.totalCostMinor - right.totalCostMinor ||
    left.totalDurationMinutes - right.totalDurationMinutes ||
    left.signature.localeCompare(right.signature);
}

function candidateKey(candidate: Candidate): string {
  return `${candidate.totalCostMinor.toString().padStart(16, "0")}:${candidate.totalDurationMinutes.toString().padStart(16, "0")}:${candidate.signature}`;
}

function applyBasisPoints(value: number, basisPoints: number): number {
  return Math.ceil((value * basisPoints) / 10_000);
}

function validMultiplier(value: number): boolean {
  return Number.isInteger(value) && value >= 1_000 && value <= 50_000;
}

function requireDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new WorldRuntimeError("world_command_invalid", "Runtime timestamp is invalid.", false);
  }
}

function invalid(message: string): WorldRuntimeError {
  return new WorldRuntimeError("world_definition_invalid", message, false);
}
