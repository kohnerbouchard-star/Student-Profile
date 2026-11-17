export interface QueryError {
  readonly message: string;
  readonly code?: string;
}

export interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

export interface FilterBuilder
  extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  is(column: string, value: null): FilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FilterBuilder;
  limit(count: number): FilterBuilder;
  maybeSingle(): PromiseLike<QueryResponse<Record<string, unknown>>>;
}

export interface UpdateBuilder {
  eq(column: string, value: unknown): UpdateBuilder;
  is(column: string, value: null): UpdateBuilder;
  select(columns: string): {
    maybeSingle(): PromiseLike<QueryResponse<Record<string, unknown>>>;
  };
}

export interface QueryBuilder {
  select(columns: string): FilterBuilder;
  update(values: unknown): UpdateBuilder;
}

export interface PlayerStoryDeliveryClient {
  from(tableName: "notifications" | "notification_deliveries"): QueryBuilder;
}

export const DELIVERY_SELECT = [
  "id",
  "public_delivery_id",
  "notification_id",
  "game_session_id",
  "player_id",
  "delivered_at",
  "seen_at",
  "dismissed_at",
  "acknowledged_at",
].join(",");

export const NOTIFICATION_SELECT = [
  "id",
  "public_notification_id",
  "game_session_id",
  "notification_type",
  "title",
  "summary",
  "priority",
  "display_mode",
  "payload",
  "published_at",
].join(",");

export const MODAL_DISPLAY_MODES = [
  "modal_immediate",
  "modal_on_next_login",
] as const;

export const MAX_NOTIFICATION_CANDIDATES = 50;
