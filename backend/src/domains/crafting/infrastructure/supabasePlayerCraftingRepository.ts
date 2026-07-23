import {
  PlayerCraftingError,
  type PlayerCraftingRepository,
} from "../contracts/playerCraftingContracts.ts";

interface QueryError {
  readonly code?: string;
  readonly message: string;
}
interface QueryResponse {
  readonly data: unknown;
  readonly error: QueryError | null;
}
interface CraftingClient {
  rpc(functionName: string, args?: unknown): PromiseLike<QueryResponse>;
}

export class SupabasePlayerCraftingRepository implements PlayerCraftingRepository {
  constructor(private readonly client: CraftingClient) {}

  read(input: Parameters<PlayerCraftingRepository["read"]>[0]) {
    return this.rpc("read_player_crafting_v1", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
    });
  }

  startJob(input: Parameters<PlayerCraftingRepository["startJob"]>[0]) {
    return this.rpc("start_player_crafting_job_v1", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
      p_recipe_key: input.command.recipeKey,
      p_quantity: input.command.quantity,
      p_substitutions: input.command.substitutions,
      p_idempotency_key: input.command.idempotencyKey,
    });
  }

  cancelJob(input: Parameters<PlayerCraftingRepository["cancelJob"]>[0]) {
    return this.rpc("cancel_player_crafting_job_v1", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
      p_job_public_id: input.jobKey,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  claimJob(input: Parameters<PlayerCraftingRepository["claimJob"]>[0]) {
    return this.rpc("claim_player_crafting_job_v1", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
      p_job_public_id: input.jobKey,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  useItem(input: Parameters<PlayerCraftingRepository["useItem"]>[0]) {
    return this.rpc("use_player_inventory_item_effect_v1", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
      p_item_key: input.itemKey,
      p_target_key: input.targetKey,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  equip(input: Parameters<PlayerCraftingRepository["equip"]>[0]) {
    return this.rpc("set_player_equipment_slot_v1", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
      p_equipment_public_id: input.equipmentKey,
      p_slot: input.slot,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  salvage(input: Parameters<PlayerCraftingRepository["salvage"]>[0]) {
    return this.rpc("salvage_player_equipment_v1", {
      p_game_session_id: input.gameId,
      p_player_id: input.playerUuid,
      p_equipment_public_id: input.equipmentKey,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  private async rpc(name: string, args: unknown): Promise<unknown> {
    const response = await this.client.rpc(name, args);
    if (response.error) throw mapError(response.error);
    const value = Array.isArray(response.data) && response.data.length === 1
      ? response.data[0]
      : response.data;
    if (!value || typeof value !== "object") throw failed();
    return value;
  }
}

function mapError(error: QueryError): PlayerCraftingError {
  const message = error.message.toUpperCase();
  const lower = error.message.toLowerCase();

  if (
    error.code === "42P01" || error.code === "42703" || error.code === "42883" ||
    lower.includes("does not exist") || lower.includes("schema cache")
  ) {
    return new PlayerCraftingError(
      "player_crafting_schema_not_applied",
      "Crafting is not available in this runtime.",
      503,
      true,
    );
  }

  if (
    message.includes("IDEMPOTENCY_CONFLICT") ||
    message.includes("ALREADY_ACTIVE") ||
    message.includes("COOLDOWN_ACTIVE") ||
    message.includes("RESERVATION_PROJECTION_INVALID") ||
    message.includes("OUTPUT_ALREADY_GRANTED") ||
    message.includes("JOB_NOT_READY") ||
    message.includes("RECRAFT_COOLDOWN_ACTIVE")
  ) {
    return new PlayerCraftingError(
      "player_crafting_conflict",
      "The crafting action conflicts with current authoritative state.",
      409,
      false,
    );
  }

  if (
    message.includes("NOT_FOUND") ||
    message.includes("UNAVAILABLE") ||
    message.includes("PACK_INACTIVE") ||
    message.includes("SCOPE_INACTIVE")
  ) {
    return new PlayerCraftingError(
      "player_crafting_unavailable",
      "The requested crafting resource is not available.",
      404,
      false,
    );
  }

  if (
    message.includes("INVALID") ||
    message.includes("LOCKED") ||
    message.includes("UNSUPPORTED")
  ) {
    return new PlayerCraftingError(
      "invalid_player_crafting_request",
      "The crafting request is invalid or unsupported.",
      400,
      false,
    );
  }

  return failed();
}

function failed(): PlayerCraftingError {
  return new PlayerCraftingError(
    "player_crafting_failed",
    "Crafting could not be completed.",
    500,
    false,
  );
}
