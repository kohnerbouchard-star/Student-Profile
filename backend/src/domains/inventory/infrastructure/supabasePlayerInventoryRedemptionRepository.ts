import {
  type PlayerInventoryRedemptionDto,
  PlayerInventoryRedemptionError,
  type PlayerInventoryRedemptionRepository,
  type PlayerInventoryRedemptionStatus,
} from "../contracts/playerInventoryRedemptionContracts.ts";

interface QueryError {
  readonly code?: string;
  readonly message: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface RedemptionClient {
  rpc<T>(functionName: string, args?: unknown): PromiseLike<QueryResponse<T>>;
}

interface RedemptionRpcRow {
  readonly request_outcome?: unknown;
  readonly request_id: unknown;
  readonly item_id: unknown;
  readonly quantity: unknown;
  readonly status: unknown;
  readonly request_note: unknown;
  readonly resolution_note: unknown;
  readonly requested_at: unknown;
  readonly reviewed_at: unknown;
  readonly fulfilled_at: unknown;
  readonly updated_at: unknown;
}

const REQUEST_ID_PATTERN = /^red_[0-9a-f]{32}$/;
const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const STATUSES = new Set(["pending", "approved", "rejected", "fulfilled"]);

export class SupabasePlayerInventoryRedemptionRepository
  implements PlayerInventoryRedemptionRepository {
  constructor(private readonly client: RedemptionClient) {}

  async request(
    input: Parameters<PlayerInventoryRedemptionRepository["request"]>[0],
  ): Promise<
    Awaited<ReturnType<PlayerInventoryRedemptionRepository["request"]>>
  > {
    const response = await this.client.rpc<readonly RedemptionRpcRow[]>(
      "request_inventory_redemption_atomic_v1",
      {
        p_game_session_id: input.gameId,
        p_player_id: input.playerUuid,
        p_item_key: input.itemId,
        p_quantity: input.command.quantity,
        p_request_note: input.command.note,
        p_idempotency_key: input.command.idempotencyKey,
      },
    );
    if (response.error) throw mapError(response.error);
    const row = response.data?.[0];
    if (!row) throw failed();
    const outcome = readText(row.request_outcome);
    if (outcome !== "created" && outcome !== "replayed") throw failed();
    const redemption = toDto(row);
    if (
      redemption.itemId !== input.itemId ||
      redemption.quantity !== input.command.quantity
    ) {
      throw failed();
    }
    return { outcome, redemption };
  }

  async read(
    input: Parameters<PlayerInventoryRedemptionRepository["read"]>[0],
  ): Promise<readonly PlayerInventoryRedemptionDto[]> {
    const response = await this.client.rpc<readonly RedemptionRpcRow[]>(
      "read_player_inventory_redemptions_v1",
      {
        p_game_session_id: input.gameId,
        p_player_id: input.playerUuid,
        p_status: input.status,
        p_limit: input.limit,
        p_offset: input.offset,
        p_request_public_id: input.requestId,
      },
    );
    if (response.error) throw mapError(response.error);
    const rows = response.data ?? [];
    if (rows.length > input.limit) throw failed();
    const redemptions = rows.map(toDto);
    if (
      input.requestId &&
      redemptions.some((redemption) => redemption.id !== input.requestId)
    ) throw failed();
    return redemptions;
  }
}

function toDto(row: RedemptionRpcRow): PlayerInventoryRedemptionDto {
  const id = readText(row.request_id);
  const itemId = readText(row.item_id);
  const status = readText(row.status);
  const quantity = typeof row.quantity === "number"
    ? row.quantity
    : Number(row.quantity);
  if (
    !REQUEST_ID_PATTERN.test(id) || !ITEM_ID_PATTERN.test(itemId) ||
    !STATUSES.has(status) || !Number.isSafeInteger(quantity) || quantity < 1 ||
    quantity > 100
  ) {
    throw failed();
  }
  return {
    id,
    itemId,
    quantity,
    status: status as PlayerInventoryRedemptionStatus,
    requestNote: readNullableText(row.request_note),
    resolutionNote: readNullableText(row.resolution_note),
    requestedAt: readTimestamp(row.requested_at),
    reviewedAt: readNullableTimestamp(row.reviewed_at),
    fulfilledAt: readNullableTimestamp(row.fulfilled_at),
    updatedAt: readTimestamp(row.updated_at),
  };
}

function mapError(error: QueryError): PlayerInventoryRedemptionError {
  const message = error.message.toUpperCase();
  const lower = error.message.toLowerCase();
  if (
    error.code === "42P01" || error.code === "42703" ||
    error.code === "42883" ||
    lower.includes("does not exist") || lower.includes("schema cache")
  ) {
    return new PlayerInventoryRedemptionError(
      "player_inventory_redemption_schema_not_applied",
      "Inventory redemption is not available in this runtime.",
      503,
      true,
    );
  }
  if (
    message.includes("INVENTORY_REDEMPTION_ITEM_NOT_AVAILABLE") ||
    message.includes("INVENTORY_REDEMPTION_PLAYER_SCOPE_INACTIVE")
  ) {
    return new PlayerInventoryRedemptionError(
      "player_inventory_redemption_unavailable",
      "This item is not available for redemption.",
      404,
      false,
    );
  }
  if (message.includes("INVENTORY_REDEMPTION_QUANTITY_UNAVAILABLE")) {
    return new PlayerInventoryRedemptionError(
      "player_inventory_redemption_quantity_unavailable",
      "The requested item quantity is not available.",
      409,
      false,
    );
  }
  if (message.includes("INVENTORY_REDEMPTION_IDEMPOTENCY_CONFLICT")) {
    return new PlayerInventoryRedemptionError(
      "player_inventory_redemption_idempotency_conflict",
      "This idempotency key was already used for another request.",
      409,
      false,
    );
  }
  if (
    message.includes("INVENTORY_REDEMPTION_REQUEST_INVALID") ||
    message.includes("INVENTORY_REDEMPTION_READ_INVALID")
  ) {
    return new PlayerInventoryRedemptionError(
      "invalid_player_inventory_redemption_request",
      "Inventory redemption request is invalid.",
      400,
      false,
    );
  }
  return failed();
}

function readText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw failed();
}

function readNullableText(value: unknown): string | null {
  if (value === null) return null;
  return readText(value);
}

function readTimestamp(value: unknown): string {
  const text = readText(value);
  if (Number.isNaN(Date.parse(text))) throw failed();
  return text;
}

function readNullableTimestamp(value: unknown): string | null {
  return value === null ? null : readTimestamp(value);
}

function failed(): PlayerInventoryRedemptionError {
  return new PlayerInventoryRedemptionError(
    "player_inventory_redemption_failed",
    "Inventory redemption could not be completed.",
    500,
    false,
  );
}
