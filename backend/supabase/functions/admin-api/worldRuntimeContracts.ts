export interface OperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}


export interface Input {
  readonly request: Request;
  readonly gameId: string;
  readonly staffUserId: string;
  readonly suffix: string;
}


export interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}


export interface DatabaseResult<T> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}


export interface QueryBuilder<T = Record<string, unknown>>
  extends PromiseLike<DatabaseResult<T[]>> {
  eq(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  maybeSingle(): Promise<DatabaseResult<T>>;
}


export interface TableBuilder<T = Record<string, unknown>> {
  select(columns?: string): QueryBuilder<T>;
}


export interface WorldRuntimeAdminService {
  from<T = Record<string, unknown>>(table: string): TableBuilder<T>;
  rpc<T = Record<string, unknown>>(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<DatabaseResult<T[]>>;
}


export const CAMPAIGN_ID = /^cmp_[0-9a-f]{32}$/u;

export const EFFECT_ID = /^cec_[0-9a-f]{32}$/u;

export const ASSIGNMENT_ID = /^acl_[0-9a-f]{32}$/u;

export const ROUTE_ID = /^rte_[a-z0-9_]+$/u;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;

export const PHASES = [
  "arrival",
  "opportunity",
  "rivalry",
  "shortage",
  "meridian_disruption",
  "open_conflict",
  "adaptation",
  "reconstruction",
  "continued_conflict",
] as const;

export const CLASS_IDS = [
  "analyst",
  "builder",
  "maker",
  "mediator",
  "navigator",
  "operator",
  "steward",
  "trader",
] as const;

export const EFFECT_KINDS = [
  "publish_news",
  "create_contract",
  "notify_players",
  "apply_market_shock",
  "set_store_scarcity",
  "set_route_state",
] as const;


export function adaptWorldRuntimeAdminService(
  service: unknown,
): WorldRuntimeAdminService {
  if (
    !isRecord(service) ||
    typeof service.from !== "function" ||
    typeof service.rpc !== "function"
  ) {
    throw new Error("World administration database service is unavailable.");
  }
  return service as unknown as WorldRuntimeAdminService;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
