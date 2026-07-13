import { applyDifficultyPolicy } from "./mutationAdapters.ts";

function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function contractDto(row: any): any {
  return {
    id: row.id,
    contractId: row.id,
    contractKey: row.contract_key,
    key: row.contract_key,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    targetingPayload: row.targeting_payload || {},
    requirementsPayload: row.requirements_payload || {},
    rewardPayload: row.reward_payload || {},
    completionMode: row.completion_mode,
    publishedAt: row.published_at,
    deadlineAt: row.deadline_at,
    expiresAt: row.expires_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function audit(
  service: any,
  input: {
    gameSessionId: string;
    staffUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, any>;
  },
): Promise<void> {
  const result = await service.from("audit_log").insert({
    game_session_id: input.gameSessionId,
    actor_type: "staff_user",
    actor_id: input.staffUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    metadata: input.metadata || {},
  });
  if (result.error) throw result.error;
}

async function archiveContract(
  service: any,
  gameSessionId: string,
  contractId: string,
  staffUserId: string,
): Promise<any> {
  const existing = await service
    .from("game_session_contracts")
    .select("*")
    .eq("game_session_id", gameSessionId)
    .eq("id", contractId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "contract_not_found",
        message: "Contract was not found for this game.",
      },
    };
  }

  if (existing.data.status === "archived") {
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          archived: true,
          alreadyArchived: true,
          contract: contractDto(existing.data),
        },
      },
    };
  }

  const result = await service
    .from("game_session_contracts")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("game_session_id", gameSessionId)
    .eq("id", contractId)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;

  await audit(service, {
    gameSessionId,
    staffUserId,
    action: "contracts.contract_archived",
    targetType: "game_session_contract",
    targetId: contractId,
    metadata: { previousStatus: existing.data.status },
  });

  return {
    handled: true,
    status: 200,
    body: {
      data: {
        archived: true,
        alreadyArchived: false,
        contract: contractDto(result.data),
      },
    },
  };
}

async function duplicateContract(
  service: any,
  gameSessionId: string,
  contractId: string,
  staffUserId: string,
): Promise<any> {
  const existing = await service
    .from("game_session_contracts")
    .select("*")
    .eq("game_session_id", gameSessionId)
    .eq("id", contractId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "contract_not_found",
        message: "Contract was not found for this game.",
      },
    };
  }

  const copiedAt = new Date().toISOString();
  const baseKey = text(existing.data.contract_key, "contract").slice(0, 46);
  const contractKey = `${baseKey}-copy-${crypto.randomUUID().slice(0, 8)}`;
  const metadata = {
    ...object(existing.data.metadata),
    duplicatedFromContractId: contractId,
    duplicatedAt: copiedAt,
  };

  const result = await service
    .from("game_session_contracts")
    .insert({
      game_session_id: gameSessionId,
      contract_template_id: existing.data.contract_template_id,
      contract_key: contractKey,
      source_type: "teacher",
      source_id: null,
      created_by_staff_id: staffUserId,
      title: `${existing.data.title} (Copy)`,
      description: existing.data.description,
      instructions: existing.data.instructions,
      category: existing.data.category,
      status: "draft",
      visibility: existing.data.visibility,
      targeting_payload: existing.data.targeting_payload || {},
      requirements_payload: existing.data.requirements_payload || {},
      reward_payload: existing.data.reward_payload || {},
      completion_mode: existing.data.completion_mode,
      published_at: null,
      deadline_at: existing.data.deadline_at,
      expires_at: existing.data.expires_at,
      metadata,
    })
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;

  await audit(service, {
    gameSessionId,
    staffUserId,
    action: "contracts.contract_duplicated",
    targetType: "game_session_contract",
    targetId: result.data.id,
    metadata: { sourceContractId: contractId },
  });

  return {
    handled: true,
    status: 201,
    body: {
      data: {
        duplicated: true,
        sourceContractId: contractId,
        contract: contractDto(result.data),
      },
    },
  };
}

async function archivePlayer(
  service: any,
  gameSessionId: string,
  playerId: string,
  staffUserId: string,
): Promise<any> {
  const existing = await service
    .from("players")
    .select("id,display_name,roster_label,status,created_at,updated_at")
    .eq("game_session_id", gameSessionId)
    .eq("id", playerId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "player_not_found",
        message: "Player was not found for this game.",
      },
    };
  }

  const archivedAt = new Date().toISOString();
  const playerResult = await service
    .from("players")
    .update({ status: "archived", updated_at: archivedAt })
    .eq("game_session_id", gameSessionId)
    .eq("id", playerId)
    .select("id,display_name,roster_label,status,created_at,updated_at")
    .maybeSingle();
  if (playerResult.error) throw playerResult.error;

  const credentialResult = await service
    .from("player_access_credentials")
    .update({ status: "revoked", revoked_at: archivedAt, updated_at: archivedAt })
    .eq("game_session_id", gameSessionId)
    .eq("player_id", playerId)
    .eq("status", "active");
  if (credentialResult.error) throw credentialResult.error;

  const sessionResult = await service
    .from("player_sessions")
    .update({ status: "revoked", revoked_at: archivedAt, updated_at: archivedAt })
    .eq("game_session_id", gameSessionId)
    .eq("player_id", playerId)
    .eq("status", "active");
  if (sessionResult.error) throw sessionResult.error;

  await audit(service, {
    gameSessionId,
    staffUserId,
    action: "players.player_archived",
    targetType: "player",
    targetId: playerId,
    metadata: { previousStatus: existing.data.status },
  });

  return {
    handled: true,
    status: 200,
    body: {
      data: {
        archived: true,
        destructiveDelete: false,
        player: playerResult.data,
      },
    },
  };
}

async function restockStoreItem(
  service: any,
  gameSessionId: string,
  itemId: string,
  staffUserId: string,
  body: Record<string, any>,
): Promise<any> {
  const quantity = Math.trunc(number(
    body.quantity ?? body.amount ?? body.restockQuantity ?? body.stockDelta,
    0,
  ));
  if (quantity <= 0) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "invalid_restock_quantity",
        message: "Restock quantity must be a positive integer.",
      },
    };
  }

  const existing = await service
    .from("store_items")
    .select("id,name,stock_quantity,status,visibility")
    .eq("game_session_id", gameSessionId)
    .eq("id", itemId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "store_item_not_found",
        message: "Store item was not found.",
      },
    };
  }

  const stockQuantity = number(existing.data.stock_quantity) + quantity;
  const result = await service
    .from("store_items")
    .update({ stock_quantity: stockQuantity, updated_at: new Date().toISOString() })
    .eq("game_session_id", gameSessionId)
    .eq("id", itemId)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;

  await audit(service, {
    gameSessionId,
    staffUserId,
    action: "store.item_restocked",
    targetType: "store_item",
    targetId: itemId,
    metadata: {
      quantity,
      previousStockQuantity: existing.data.stock_quantity,
      stockQuantity,
    },
  });

  return {
    handled: true,
    status: 200,
    body: {
      data: {
        restocked: true,
        quantityAdded: quantity,
        item: result.data,
      },
    },
  };
}

async function rebalanceStorePrice(
  service: any,
  gameSessionId: string,
  itemId: string,
  staffUserId: string,
  body: Record<string, any>,
): Promise<any> {
  const price = number(body.price ?? body.newPrice ?? body.targetPrice, Number.NaN);
  if (!Number.isFinite(price) || price < 0) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "store_rebalance_price_required",
        message: "A non-negative target price is required. Automatic repricing is not configured.",
      },
    };
  }

  const result = await service
    .from("store_items")
    .update({ price, updated_at: new Date().toISOString() })
    .eq("game_session_id", gameSessionId)
    .eq("id", itemId)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "store_item_not_found",
        message: "Store item was not found.",
      },
    };
  }

  await audit(service, {
    gameSessionId,
    staffUserId,
    action: "store.item_price_rebalanced",
    targetType: "store_item",
    targetId: itemId,
    metadata: { price },
  });

  return {
    handled: true,
    status: 200,
    body: { data: { rebalanced: true, item: result.data } },
  };
}

async function resetSettingsGroup(
  service: any,
  gameSessionId: string,
  group: string,
): Promise<any> {
  const normalizedGroup = text(group).toLowerCase();
  if (["difficulty", "economy", "simulation"].includes(normalizedGroup)) {
    const difficultyPolicy = await applyDifficultyPolicy(service, gameSessionId, {
      difficulty_preset: "moderate",
      source: "preset",
    });
    const settings = await service
      .from("game_settings")
      .update({ difficulty_preset: "moderate" })
      .eq("game_session_id", gameSessionId)
      .select("*")
      .maybeSingle();
    if (settings.error) throw settings.error;
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          reset: true,
          group: normalizedGroup,
          difficultyPolicy,
          settings: settings.data,
        },
      },
    };
  }

  const columnByGroup: Record<string, string> = {
    attendance: "attendance_window",
    business: "business_market_window",
    "business-market": "business_market_window",
    stocks: "stock_market_window",
    "stock-market": "stock_market_window",
    news: "news_schedule",
  };
  const column = columnByGroup[normalizedGroup];
  if (!column) {
    return {
      handled: true,
      status: 409,
      body: {
        code: "settings_group_reset_not_configured",
        message: "That settings group does not have an authoritative reset profile.",
      },
    };
  }

  const result = await service
    .from("game_settings")
    .update({ [column]: {} })
    .eq("game_session_id", gameSessionId)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  return {
    handled: true,
    status: 200,
    body: {
      data: { reset: true, group: normalizedGroup, settings: result.data },
    },
  };
}

export async function handleCompatibilityOperation(
  service: any,
  input: {
    gameSessionId: string;
    staffUserId: string;
    path: string;
    method: string;
    body: Record<string, any>;
  },
): Promise<any> {
  const operation = text(input.body.adminOperation).toLowerCase();
  if (!operation) return { handled: false };

  if (operation === "archive-contract") {
    return archiveContract(
      service,
      input.gameSessionId,
      text(input.body.contractId),
      input.staffUserId,
    );
  }
  if (operation === "duplicate-contract") {
    return duplicateContract(
      service,
      input.gameSessionId,
      text(input.body.contractId),
      input.staffUserId,
    );
  }
  if (operation === "archive-player") {
    return archivePlayer(
      service,
      input.gameSessionId,
      text(input.body.playerId),
      input.staffUserId,
    );
  }
  if (operation === "restock-store-item") {
    return restockStoreItem(
      service,
      input.gameSessionId,
      text(input.body.itemId),
      input.staffUserId,
      input.body,
    );
  }
  if (operation === "rebalance-store-price") {
    return rebalanceStorePrice(
      service,
      input.gameSessionId,
      text(input.body.itemId),
      input.staffUserId,
      input.body,
    );
  }
  if (operation === "reset-settings-group") {
    return resetSettingsGroup(
      service,
      input.gameSessionId,
      text(input.body.group),
    );
  }

  return {
    handled: true,
    status: 400,
    body: {
      code: "unknown_admin_compatibility_operation",
      message: "The requested administrator operation is not recognized.",
    },
  };
}
