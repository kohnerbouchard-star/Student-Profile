export type Row = Record<string, unknown>;
export interface QueryError { readonly code?: string; readonly message: string }
export interface QueryResult<T> { readonly data: T | null; readonly error: QueryError | null }
export interface Filter extends PromiseLike<QueryResult<Row[]>> {
  eq(column: string, value: unknown): Filter;
  in(column: string, values: readonly unknown[]): Filter;
  order(column: string, options?: { readonly ascending?: boolean }): Filter;
  limit(value: number): Filter;
  maybeSingle(): PromiseLike<QueryResult<Row>>;
}
export interface Client {
  from(table: string): { select(columns: string): Filter };
  rpc(name: string, args: Row): PromiseLike<QueryResult<Row[] | Row | number>>;
}

export const LISTING_SELECT = [
  "id", "public_id", "seller_player_id", "seller_country_code", "store_item_id", "item_key",
  "quantity_initial", "quantity_available", "unit_price", "currency_code", "condition_label",
  "status", "version", "expires_at", "moderation_reason", "created_at", "updated_at",
].join(",");
export const RESERVATION_SELECT = [
  "id", "public_id", "listing_id", "buyer_player_id", "quantity", "buyer_total",
  "currency_code", "status", "version", "expires_at", "release_reason", "created_at",
].join(",");
export const ORDER_SELECT = [
  "id", "public_id", "reservation_id", "listing_id", "buyer_player_id", "seller_player_id",
  "item_key", "quantity", "unit_price", "subtotal", "fee_amount", "tax_amount", "buyer_total",
  "seller_proceeds", "currency_code", "status", "version", "completed_at", "refunded_at", "created_at",
].join(",");
export const DISPUTE_SELECT = [
  "id", "public_id", "order_id", "opened_by_player_id", "reason", "status", "version",
  "resolution_note", "opened_at", "resolved_at",
].join(",");
