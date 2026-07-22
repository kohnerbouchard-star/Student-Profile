import {
  PlayerCraftingError,
} from "../contracts/playerCraftingContracts.ts";
import { SupabasePlayerCraftingRepository } from "./supabasePlayerCraftingRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const JOB = `cft_${"a".repeat(32)}`;
const EQUIPMENT = `eqp_${"b".repeat(32)}`;

Deno.test("Crafting repository routes every Player operation through reviewed RPCs", async () => {
  const client = new Client();
  const repository = new SupabasePlayerCraftingRepository(client);

  await repository.read({ gameId: GAME, playerUuid: PLAYER });
  await repository.startJob({
    gameId: GAME,
    playerUuid: PLAYER,
    command: {
      recipeKey: "recipe.test-widget",
      quantity: 2,
      substitutions: { structural: "alloy_plate" },
      idempotencyKey: "craft.start.0001",
    },
  });
  await repository.cancelJob({
    gameId: GAME,
    playerUuid: PLAYER,
    jobKey: JOB,
    idempotencyKey: "craft.cancel.0001",
  });
  await repository.claimJob({
    gameId: GAME,
    playerUuid: PLAYER,
    jobKey: JOB,
    idempotencyKey: "craft.claim.0001",
  });
  await repository.useItem({
    gameId: GAME,
    playerUuid: PLAYER,
    itemKey: "water_test_kit",
    targetKey: null,
    idempotencyKey: "craft.use.0001",
  });
  await repository.equip({
    gameId: GAME,
    playerUuid: PLAYER,
    equipmentKey: EQUIPMENT,
    slot: "field",
    idempotencyKey: "craft.equip.0001",
  });
  await repository.salvage({
    gameId: GAME,
    playerUuid: PLAYER,
    equipmentKey: EQUIPMENT,
    idempotencyKey: "craft.salvage.0001",
  });

  assertEquals(client.calls, [
    ["read_player_crafting_v1", { p_game_session_id: GAME, p_player_id: PLAYER }],
    ["start_player_crafting_job_v1", {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_recipe_key: "recipe.test-widget",
      p_quantity: 2,
      p_substitutions: { structural: "alloy_plate" },
      p_idempotency_key: "craft.start.0001",
    }],
    ["cancel_player_crafting_job_v1", {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_job_public_id: JOB,
      p_idempotency_key: "craft.cancel.0001",
    }],
    ["claim_player_crafting_job_v1", {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_job_public_id: JOB,
      p_idempotency_key: "craft.claim.0001",
    }],
    ["use_player_inventory_item_effect_v1", {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_item_key: "water_test_kit",
      p_target_key: null,
      p_idempotency_key: "craft.use.0001",
    }],
    ["set_player_equipment_slot_v1", {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_equipment_public_id: EQUIPMENT,
      p_slot: "field",
      p_idempotency_key: "craft.equip.0001",
    }],
    ["salvage_player_equipment_v1", {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_equipment_public_id: EQUIPMENT,
      p_idempotency_key: "craft.salvage.0001",
    }],
  ]);
});

Deno.test("Crafting repository preserves committed replay responses", async () => {
  const replay = {
    outcome: "replayed",
    jobKey: JOB,
    committed: true,
    refreshRequired: true,
  };
  const repository = new SupabasePlayerCraftingRepository(new Client({ data: [replay], error: null }));
  assertEquals(await repository.claimJob({
    gameId: GAME,
    playerUuid: PLAYER,
    jobKey: JOB,
    idempotencyKey: "craft.claim.replay.0001",
  }), replay);
});

Deno.test("Crafting repository maps paused or ended lifecycle scope to unavailable", async () => {
  const repository = new SupabasePlayerCraftingRepository(new Client({
    data: null,
    error: { message: "CRAFTING_PLAYER_SCOPE_INACTIVE", code: "P0001" },
  }));
  await assertCraftingError(
    repository.startJob({
      gameId: GAME,
      playerUuid: PLAYER,
      command: {
        recipeKey: "recipe.test-widget",
        quantity: 1,
        substitutions: {},
        idempotencyKey: "craft.scope.0001",
      },
    }),
    "player_crafting_unavailable",
    404,
    false,
  );
});

Deno.test("Crafting repository maps repair and durability operations to invalid requests", async () => {
  const repository = new SupabasePlayerCraftingRepository(new Client({
    data: null,
    error: { message: "EQUIPMENT_REPAIR_UNSUPPORTED", code: "P0001" },
  }));
  await assertCraftingError(
    repository.useItem({
      gameId: GAME,
      playerUuid: PLAYER,
      itemKey: "repair_kit",
      targetKey: EQUIPMENT,
      idempotencyKey: "craft.repair.0001",
    }),
    "invalid_player_crafting_request",
    400,
    false,
  );
});

Deno.test("Crafting repository maps duplicate or divergent replay keys to conflict", async () => {
  const repository = new SupabasePlayerCraftingRepository(new Client({
    data: null,
    error: { message: "EQUIPMENT_IDEMPOTENCY_CONFLICT", code: "P0001" },
  }));
  await assertCraftingError(
    repository.equip({
      gameId: GAME,
      playerUuid: PLAYER,
      equipmentKey: EQUIPMENT,
      slot: "field",
      idempotencyKey: "craft.equip.conflict.0001",
    }),
    "player_crafting_conflict",
    409,
    false,
  );
});

Deno.test("Crafting repository fails closed on empty RPC responses", async () => {
  const repository = new SupabasePlayerCraftingRepository(new Client({ data: null, error: null }));
  await assertCraftingError(
    repository.read({ gameId: GAME, playerUuid: PLAYER }),
    "player_crafting_failed",
    500,
    false,
  );
});

class Client {
  readonly calls: [string, unknown][] = [];
  constructor(
    private readonly response: { data: unknown; error: { message: string; code?: string } | null } = {
      data: { ok: true },
      error: null,
    },
  ) {}
  rpc(name: string, args: unknown) {
    this.calls.push([name, args]);
    return Promise.resolve(this.response);
  }
}

async function assertCraftingError(
  promise: Promise<unknown>,
  code: string,
  status: number,
  retryable: boolean,
) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof PlayerCraftingError)) throw error;
    assertEquals(error.code, code);
    assertEquals(error.status, status);
    assertEquals(error.retryable, retryable);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
