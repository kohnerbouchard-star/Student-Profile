import {
  createStoreCatalogItem,
  listStoreCatalogItems,
  type StoreCatalogDependencies,
  updateStoreCatalogItem,
} from "../application/storeCatalogService.ts";
import type {
  CreateStoreItemInput,
  StoreCatalogRouteErrorResult,
  StoreCatalogRouteRequest,
  StoreCatalogRouteResult,
  StoreCatalogRouteSuccessResult,
  UpdateStoreItemInput,
} from "../contracts/storeCatalogContracts.ts";
import {
  StoreCatalogValidationError,
} from "../domain/storeCatalogRules.ts";

export async function handleListStoreCatalogRoute(
  request: StoreCatalogRouteRequest,
  dependencies: StoreCatalogDependencies,
): Promise<StoreCatalogRouteResult> {
  try {
    const items = await listStoreCatalogItems(
      {
        gameSessionId: request.gameSessionId,
        audience: request.audience,
      },
      dependencies,
    );

    return successResult(200, {
      items,
    });
  } catch (error) {
    return mapStoreCatalogError(error);
  }
}

export async function handleCreateStoreCatalogItemRoute(
  request: StoreCatalogRouteRequest,
  dependencies: StoreCatalogDependencies,
): Promise<StoreCatalogRouteResult> {
  try {
    const body = readBodyObject(request.body);

    const item = await createStoreCatalogItem(
      {
        ...body,
        gameSessionId: request.gameSessionId,
      } as CreateStoreItemInput,
      dependencies,
    );

    return successResult(201, {
      item,
    });
  } catch (error) {
    return mapStoreCatalogError(error);
  }
}

export async function handleUpdateStoreCatalogItemRoute(
  request: StoreCatalogRouteRequest,
  dependencies: StoreCatalogDependencies,
): Promise<StoreCatalogRouteResult> {
  try {
    if (!request.itemId) {
      return errorResult(400, {
        code: "missing_store_item_id",
        message: "A store item id is required.",
      });
    }

    const body = readBodyObject(request.body);

    const item = await updateStoreCatalogItem(
      {
        ...body,
        gameSessionId: request.gameSessionId,
        itemId: request.itemId,
      } as UpdateStoreItemInput,
      dependencies,
    );

    if (!item) {
      return errorResult(404, {
        code: "store_item_not_found",
        message: "Store item was not found.",
      });
    }

    return successResult(200, {
      item,
    });
  } catch (error) {
    return mapStoreCatalogError(error);
  }
}

function readBodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StoreCatalogValidationError(
      "invalid_store_request_body",
      "Request body must be an object.",
    );
  }

  return body as Record<string, unknown>;
}

function mapStoreCatalogError(error: unknown): StoreCatalogRouteErrorResult {
  if (error instanceof StoreCatalogValidationError) {
    return errorResult(400, {
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }

  throw error;
}

function successResult(
  status: number,
  body: Record<string, unknown>,
): StoreCatalogRouteSuccessResult {
  return {
    ok: true,
    status,
    body,
  };
}

function errorResult(
  status: number,
  error: StoreCatalogRouteErrorResult["body"]["error"],
): StoreCatalogRouteErrorResult {
  return {
    ok: false,
    status,
    body: {
      error,
    },
  };
}
