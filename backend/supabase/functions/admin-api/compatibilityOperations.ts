import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
} from "../../../src/platform/supabase/adminMutation.ts";
import {
  type AdminContractMutationResult,
  mutateAdminContract,
} from "../../../src/domains/contracts/application/adminContractMutation.ts";
import {
  type AdminStoreItemMutationResult,
  mutateAdminStoreItem,
} from "../../../src/domains/store/application/adminStoreItemMutation.ts";
import { archivePlayerForAuthorizedStaff } from "../../../src/domains/players/application/archivePlayerForAuthorizedStaff.ts";
import { resetGameSettingsGroup } from "../../../src/domains/game-sessions/application/updateGameSettings.ts";
import { createSupabaseGameSessionMutationRepository } from "../../../src/domains/game-sessions/infrastructure/supabaseGameSessionMutationRepository.ts";
import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";

function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function legacyContractDto(
  contract: AdminContractMutationResult["contract"],
): Record<string, unknown> {
  return {
    id: contract.contractId,
    contractId: contract.contractId,
    contractKey: contract.contractKey,
    key: contract.contractKey,
    title: contract.title,
    description: contract.description,
    instructions: contract.instructions,
    category: contract.category,
    status: contract.status,
    visibility: contract.visibility,
    targetingPayload: contract.targetingPayload,
    requirementsPayload: contract.requirementsPayload,
    rewardPayload: contract.rewardPayload,
    completionMode: contract.completionMode,
    publishedAt: contract.publishedAt,
    deadlineAt: contract.deadlineAt,
    expiresAt: contract.expiresAt,
    metadata: contract.metadata,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

function legacyStoreItemDto(
  item: AdminStoreItemMutationResult["item"],
): Record<string, unknown> {
  return {
    id: item.id,
    game_session_id: item.gameSessionId,
    item_key: item.itemKey,
    name: item.name,
    description: item.description,
    category: item.category,
    price: item.price,
    currency_code: item.currencyCode,
    stock_quantity: item.stockQuantity,
    status: item.status,
    visibility: item.visibility,
    sort_order: item.sortOrder,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export async function handleCompatibilityOperation(
  service: AdminMutationRpcClient,
  input: {
    applicationContext: AdminRequestApplicationContext;
    path: string;
    method: string;
    body: Record<string, any>;
    identity?: AdminMutationIdentity;
  },
): Promise<any> {
  const gameSessionId = input.applicationContext.gameSessionId;
  const staffUserId = input.applicationContext.actor.staffUserId;
  const requestedOperation = text(input.body.adminOperation).toLowerCase();
  const operationResolution = resolveCompatibilityOperation(
    input.path,
    input.method,
    requestedOperation,
  );
  if (operationResolution.mismatch) return compatibilityRouteMismatch();
  const operation = operationResolution.operation;
  if (!operation) return { handled: false };

  const pathContract = input.path.match(
    /\/contracts\/([^/]+)\/(?:archive|duplicate)$/,
  );
  const pathPlayer = input.path.match(/\/players\/([^/]+)(?:\/archive)?$/);
  const pathStoreItem = input.path.match(/\/store\/items\/([^/]+)(?:\/(?:restock|rebalance-price))?$/);
  const pathSettingsGroup = input.path.match(/\/settings\/([^/]+)\/reset$/);
  const contractId = pathContract
    ? decodeURIComponent(pathContract[1])
    : text(input.body.contractId);
  const playerId = pathPlayer
    ? decodeURIComponent(pathPlayer[1])
    : text(input.body.playerId);
  const itemId = pathStoreItem
    ? decodeURIComponent(pathStoreItem[1])
    : text(input.body.itemId);
  const settingsGroup = pathSettingsGroup
    ? decodeURIComponent(pathSettingsGroup[1])
    : text(input.body.group);

  try {
    if (operation === "archive-contract") {
      if (!input.identity) return mutationIdentityRequired();
      const result = await mutateAdminContract(service, {
        gameSessionId,
        staffUserId,
        operation: "archive",
        contractId,
        body: input.body,
        identity: input.identity,
      });
      return {
        handled: true,
        status: result.status,
        body: {
          data: {
            archived: true,
            alreadyArchived: result.alreadyArchived,
            contract: legacyContractDto(result.contract),
          },
        },
      };
    }
    if (operation === "duplicate-contract") {
      if (!input.identity) return mutationIdentityRequired();
      const result = await mutateAdminContract(service, {
        gameSessionId,
        staffUserId,
        operation: "duplicate",
        contractId,
        body: input.body,
        identity: input.identity,
      });
      return {
        handled: true,
        status: result.status,
        body: {
          data: {
            duplicated: true,
            sourceContractId: result.sourceContractId,
            contract: legacyContractDto(result.contract),
          },
        },
      };
    }
    if (operation === "restock-store-item") {
      if (!input.identity) return mutationIdentityRequired();
      const result = await mutateAdminStoreItem(service, {
        gameSessionId,
        staffUserId,
        operation: "restock",
        itemId,
        body: input.body,
        identity: input.identity,
      });
      return {
        handled: true,
        status: result.status,
        body: {
          data: {
            restocked: true,
            quantityAdded: result.quantityAdded,
            item: legacyStoreItemDto(result.item),
          },
        },
      };
    }
    if (operation === "rebalance-store-price") {
      if (!input.identity) return mutationIdentityRequired();
      const result = await mutateAdminStoreItem(service, {
        gameSessionId,
        staffUserId,
        operation: "rebalance",
        itemId,
        body: input.body,
        identity: input.identity,
      });
      return {
        handled: true,
        status: result.status,
        body: {
          data: {
            rebalanced: true,
            item: legacyStoreItemDto(result.item),
          },
        },
      };
    }
    if (operation === "archive-player") {
      if (!input.identity) return mutationIdentityRequired();
      const result = await archivePlayerForAuthorizedStaff(service, {
        gameSessionId,
        staffUserId,
        playerId,
        identity: input.identity,
      });
      return {
        handled: true,
        status: result.status,
        body: {
          data: {
            archived: result.archived,
            destructiveDelete: result.destructiveDelete,
            alreadyArchived: result.alreadyArchived,
            player: result.player,
          },
        },
      };
    }
    if (operation === "reset-settings-group") {
      if (!input.identity) return mutationIdentityRequired();
      const result = await resetGameSettingsGroup(
        createSupabaseGameSessionMutationRepository(service),
        {
          applicationContext: input.applicationContext,
          group: settingsGroup,
          mutation: input.identity,
        },
      );
      return {
        handled: true,
        status: result.status,
        body: {
          data: {
            reset: true,
            group: result.group,
            difficultyPolicy: result.difficultyPolicy,
            settings: {
              difficulty_preset: result.settings.difficultyPreset,
              attendance_window: result.settings.attendanceWindow,
              business_market_window: result.settings.businessMarketWindow,
              stock_market_window: result.settings.stockMarketWindow,
              news_schedule: result.settings.newsSchedule,
              updated_at: result.settings.updatedAt,
            },
          },
        },
      };
    }
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return {
        handled: true,
        status: error.status,
        body: {
          code: error.code,
          message: error.message,
          ...(error.retryable ? { retryable: true } : {}),
        },
      };
    }
    throw error;
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

type CompatibilityOperation =
  | "archive-contract"
  | "duplicate-contract"
  | "restock-store-item"
  | "rebalance-store-price"
  | "archive-player"
  | "reset-settings-group";

function resolveCompatibilityOperation(
  path: string,
  method: string,
  requestedOperation: string,
): {
  readonly operation: CompatibilityOperation | "";
  readonly mismatch: boolean;
} {
  const normalizedMethod = method.toUpperCase();
  let routeOperation: CompatibilityOperation | "" = "";

  if (
    normalizedMethod === "POST" && /\/contracts\/[^/]+\/archive$/.test(path)
  ) {
    routeOperation = "archive-contract";
  } else if (
    normalizedMethod === "POST" &&
    /\/contracts\/[^/]+\/duplicate$/.test(path)
  ) {
    routeOperation = "duplicate-contract";
  } else if (
    (normalizedMethod === "DELETE" && /\/players\/[^/]+$/.test(path)) ||
    (normalizedMethod === "POST" && /\/players\/[^/]+\/archive$/.test(path))
  ) {
    routeOperation = "archive-player";
  } else if (
    normalizedMethod === "POST" && /\/store\/items\/[^/]+\/restock$/.test(path)
  ) {
    routeOperation = "restock-store-item";
  } else if (
    normalizedMethod === "POST" &&
    /\/store\/items\/[^/]+\/rebalance-price$/.test(path)
  ) {
    routeOperation = "rebalance-store-price";
  } else if (
    normalizedMethod === "POST" && /\/settings\/[^/]+\/reset$/.test(path)
  ) {
    routeOperation = "reset-settings-group";
  }

  if (routeOperation) {
    return {
      operation: routeOperation,
      mismatch: Boolean(requestedOperation) && requestedOperation !== routeOperation,
    };
  }
  if (!requestedOperation) return { operation: "", mismatch: false };

  const allowedOperations = compatibilityOperationsForCanonicalRoute(
    path,
    normalizedMethod,
  );
  const operation = requestedOperation as CompatibilityOperation;
  return allowedOperations.has(operation)
    ? { operation, mismatch: false }
    : { operation: "", mismatch: true };
}

function compatibilityOperationsForCanonicalRoute(
  path: string,
  method: string,
): ReadonlySet<CompatibilityOperation> {
  if (method === "POST" && /\/contracts$/.test(path)) {
    return new Set(["archive-contract", "duplicate-contract"]);
  }
  if (method === "PATCH" && /\/store\/items\/[^/]+$/.test(path)) {
    return new Set(["restock-store-item", "rebalance-store-price"]);
  }
  if (method === "POST" && /\/players$/.test(path)) {
    return new Set(["archive-player"]);
  }
  if (method === "PATCH" && /\/settings$/.test(path)) {
    return new Set(["reset-settings-group"]);
  }
  return new Set();
}

function compatibilityRouteMismatch(): {
  readonly handled: true;
  readonly status: 400;
  readonly body: { readonly code: string; readonly message: string };
} {
  return {
    handled: true,
    status: 400,
    body: {
      code: "admin_compatibility_operation_route_mismatch",
      message:
        "The requested administrator compatibility operation does not match this route and method.",
    },
  };
}

function mutationIdentityRequired(): {
  readonly handled: true;
  readonly status: 400;
  readonly body: { readonly code: string; readonly message: string };
} {
  return {
    handled: true,
    status: 400,
    body: {
      code: "idempotency_key_required",
      message: "A stable Idempotency-Key is required.",
    },
  };
}
