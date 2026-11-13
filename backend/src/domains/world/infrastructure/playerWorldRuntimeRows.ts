// Adapter-local database shapes. Public repository contracts remain in their existing owner.

export interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}

export interface DatabaseResult<T> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}

export interface QueryBuilder<T = unknown> extends PromiseLike<DatabaseResult<T[]>> {
  select(columns?: string): QueryBuilder<T>;
  insert(values: unknown): QueryBuilder<T>;
  update(values: unknown): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: readonly unknown[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  maybeSingle(): Promise<DatabaseResult<T>>;
  single(): Promise<DatabaseResult<T>>;
}

export interface PlayerWorldRuntimeSupabaseClient {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
  rpc<T = Record<string, unknown>>(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<DatabaseResult<T[]>>;
}

export interface PlayerCountryRow { readonly country_id: string; }
export interface CountryRuntimeRow {
  readonly country_id: string;
  readonly currency_code: string;
  readonly arrival_location_id: string;
  readonly arrival_package_definition_id: string;
}
export interface ClassGrantRow {
  readonly class_id: string;
  readonly grant_definition_id: string;
}
export interface ArrivalAssignmentRow {
  readonly public_id: string;
  readonly country_id: string;
  readonly class_id: string;
  readonly source: string;
  readonly questionnaire_id: string;
  readonly questionnaire_version: string;
  readonly score_result: unknown;
  readonly override_reason: unknown;
  readonly revision: unknown;
  readonly assigned_at: unknown;
  readonly updated_at: unknown;
}
export interface TravelStateRow {
  readonly current_location_id: string;
  readonly status: string;
  readonly active_journey_id: unknown;
  readonly arrival_at: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
export interface ResidencyRow {
  readonly current_country_id: string;
  readonly currency_code: unknown;
  readonly eligible_country_ids: unknown;
  readonly pending_country_id: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
export interface WorldRuntimeRow {
  readonly pack_id: string;
  readonly pack_version: string;
  readonly definition_digest: string;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
export interface LocationRow {
  readonly public_location_id: string;
  readonly country_id: string;
  readonly display_name: unknown;
  readonly location_kind: unknown;
  readonly availability: string;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
export interface RouteRow {
  readonly public_route_id: string;
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly mode: string;
  readonly bidirectional: unknown;
  readonly base_cost_minor: unknown;
  readonly base_duration_minutes: unknown;
  readonly status: string;
  readonly reason: string;
  readonly cost_multiplier_basis_points: unknown;
  readonly duration_multiplier_basis_points: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
export interface CampaignRow {
  readonly id: string;
  readonly public_id: string;
  readonly pack_id: string;
  readonly pack_version: string;
  readonly definition_id: string;
  readonly definition_digest: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: unknown;
  readonly event_sequence: unknown;
  readonly outcome: unknown;
  readonly scheduled_at: unknown;
  readonly paused_at: unknown;
  readonly disabled_at: unknown;
  readonly completed_at: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}
export interface CampaignExecutionRow {
  readonly public_id: string;
  readonly event_key: string;
  readonly execution_key: string;
  readonly to_phase: string;
  readonly sequence: unknown;
  readonly occurred_at: unknown;
}
export interface CampaignCommandRow {
  readonly idempotency_key: string;
  readonly payload: unknown;
  readonly status: string;
  readonly created_at: unknown;
}
export interface TravelQuoteRow {
  readonly public_id: string;
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly currency_code: string;
  readonly total_cost_minor: unknown;
  readonly total_duration_minutes: unknown;
  readonly route_state_revision: unknown;
  readonly legs: unknown;
  readonly status: string;
  readonly expires_at: unknown;
}
export interface TravelJourneyRow {
  readonly public_id: string;
  readonly quote: { readonly public_id: string };
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly currency_code: string;
  readonly total_cost_minor: unknown;
  readonly total_duration_minutes: unknown;
  readonly status: string;
  readonly departed_at: unknown;
  readonly arrival_at: unknown;
  readonly completed_at: unknown;
}
export interface TravelJourneyRpcRow {
  readonly journey_id: string;
  readonly quote_id: string;
  readonly from_location_id: string;
  readonly to_location_id: string;
  readonly currency_code: string;
  readonly total_cost_minor: unknown;
  readonly total_duration_minutes: unknown;
  readonly status: string;
  readonly departed_at: unknown;
  readonly arrival_at: unknown;
  readonly completed_at: unknown;
}
export interface TravelCompletionRpcRow {
  readonly journey_id: string;
  readonly current_location_id: string;
  readonly status: string;
  readonly completed_at: unknown;
  readonly travel_state_revision: unknown;
}
export interface ResidencyRpcRow {
  readonly current_country_id: string;
  readonly currency_code: unknown;
  readonly eligible_country_ids: unknown;
  readonly pending_country_id: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}
