import { expectedJourney, GAME, journeyRow, NOW, PLAYER, SCOPE, type Row } from "./supabasePlayerWorldRuntimeRepository.fixtures.ts";

export function quoteRow(overrides: Row = {}): Row {
  return { public_id: "trq_saved", from_location_id: "loc_home", to_location_id: "loc_port", currency_code: "ELD",
    total_cost_minor: "21", total_duration_minutes: "22", route_state_revision: "23", status: "created", expires_at: NOW,
    legs: [{ publicRouteId: " route_road ", fromLocationId: "loc_home", toLocationId: "loc_port", mode: "land",
      costMinor: "21", durationMinutes: "22", routeRevision: "23", ignored: "database metadata" }], ...overrides };
}
export function quoteInput(): Row {
  return { publicQuoteId: "trq_requested", gameId: "ignored_game", playerUuid: "ignored_player", fromLocationId: "loc_home",
    toLocationId: "loc_port", currencyCode: "ELD", totalCostMinor: 11, totalDurationMinutes: 12, routeStateRevision: 13,
    legs: [{ publicRouteId: "route_road", fromLocationId: "loc_home", toLocationId: "loc_port", mode: "land",
      costMinor: 11, durationMinutes: 12, routeRevision: 13, ignored: "request metadata" }], status: "created", expiresAt: NOW };
}
export const EXPECTED_INSERT = {
  public_id: "trq_requested", game_session_id: GAME, player_id: PLAYER, from_location_id: "loc_home",
  to_location_id: "loc_port", currency_code: "ELD", total_cost_minor: 11, total_duration_minutes: 12,
  route_state_revision: 13, legs: [{ publicRouteId: "route_road", fromLocationId: "loc_home", toLocationId: "loc_port",
    mode: "land", costMinor: 11, durationMinutes: 12, routeRevision: 13 }], status: "created", expires_at: NOW,
};
export function expectedQuote(overrides: Row = {}): Row {
  return { publicQuoteId: "trq_saved", gameId: GAME, playerUuid: PLAYER, fromLocationId: "loc_home", toLocationId: "loc_port",
    currencyCode: "ELD", totalCostMinor: 21, totalDurationMinutes: 22, routeStateRevision: 23,
    legs: [{ publicRouteId: " route_road ", fromLocationId: "loc_home", toLocationId: "loc_port", mode: "land",
      costMinor: 21, durationMinutes: 22, routeRevision: 23 }], status: "created", expiresAt: NOW, ...overrides };
}
export function rpcJourneyRow(overrides: Row = {}): Row {
  const { public_id, quote, ...rest } = journeyRow();
  return { ...rest, journey_id: public_id, quote_id: quote.public_id, ...overrides };
}
export const EXECUTE_INPUT = { scope: SCOPE, publicQuoteId: "trq_requested", idempotencyKey: "travel-key", occurredAt: NOW };
export const COMPLETE_INPUT = { scope: SCOPE, publicJourneyId: "trj_requested", occurredAt: NOW };
export const RESIDENCY_INPUT = { scope: SCOPE, request: { countryId: "meridian", expectedRevision: 4 }, occurredAt: NOW };
export const EXECUTE_CALL = { target: "execute_player_travel_v1", operations: [["rpc", {
  p_game_session_id: GAME, p_player_id: PLAYER, p_quote_public_id: "trq_requested", p_idempotency_key: "travel-key",
  p_departed_at: NOW, p_request_metadata: { source: "player_world_runtime" },
}]] };
export const COMPLETE_CALL = { target: "complete_player_travel_v1", operations: [["rpc", {
  p_game_session_id: GAME, p_player_id: PLAYER, p_journey_public_id: "trj_requested", p_effective_at: NOW,
}]] };
export const RESIDENCY_CALL = { target: "request_player_residency_change_v1", operations: [["rpc", {
  p_game_session_id: GAME, p_player_id: PLAYER, p_target_country_id: "meridian", p_expected_revision: 4, p_requested_at: NOW,
}]] };
export function residencyRow(overrides: Row = {}): Row {
  return { current_country_id: "eldoran", currency_code: "ELD", eligible_country_ids: ["eldoran", 1, "meridian", "meridian"],
    pending_country_id: "meridian", revision: "8", updated_at: NOW, ...overrides };
}
export function expectedResidency(overrides: Row = {}): Row {
  return { gameId: GAME, gameSessionId: GAME, playerUuid: PLAYER, currentCountryId: "eldoran", currencyCode: "ELD",
    eligibleCountryIds: ["eldoran", "meridian", "meridian"], pendingCountryId: "meridian", revision: 8, updatedAt: NOW, ...overrides };
}
export function assignmentInput() {
  return { scope: SCOPE, assignment: { assignmentId: "asg_requested", countryId: "eldoran", classId: "analyst", assignedAt: NOW },
    scoreResult: { questionnaireId: "q_main", questionnaireVersion: "v1", scores: { analyst: 8 } },
    assignmentIdempotencyKey: "assign-key", arrivalPackageDefinitionId: "arrival_package", grantDefinitionId: "class_grant",
    grantIdempotencyKey: "grant-key" };
}
export { expectedJourney };
