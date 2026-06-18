/// <reference lib="dom" />

import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readOwnedGameSession,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  handleCreateStoreCatalogItemRoute,
  handleListStoreCatalogRoute,
  handleUpdateStoreCatalogItemRoute,
} from "./storeCatalogRouteHandler.ts";
import { type StaffStoreCatalogRoute } from "./storeCatalogRoutePaths.ts";
import type {
  StoreCatalogRouteResult,
} from "../contracts/storeCatalogContracts.ts";
import {
  SupabaseStoreCatalogRepository,
} from "../infrastructure/supabaseStoreCatalogRepository.ts";

export interface StaffStoreCatalogHttpHandlerDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: { readonly missingMessage: string },
  ) => Promise<
    | {
        readonly ok: true;
        readonly staff: {
          readonly id: string;
          readonly supabase_auth_user_id: string;
          readonly email: string;
          readonly display_name: string;
        };
        readonly serviceClient: EdgeSupabaseClient;
      }
    | {
        readonly ok: false;
        readonly status: number;
        readonly error: EdgeErrorBody["error"];
      }
  >;
}

export async function handleStaffStoreCatalogRequest(
  request: Request,
  route: StaffStoreCatalogRoute,
  dependencies: StaffStoreCatalogHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "items" && request.method !== "GET" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or POST for store catalog items.",
      retryable: false,
    });
  }

  if (route.kind === "item" && request.method !== "PATCH") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use PATCH to update a store catalog item.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await dependencies.resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to manage store items.",
    });

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      route.gameSessionId,
      staffResult.staff.id,
    );

    if (!ownershipResult.ok) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    const storeCatalogRepository = new SupabaseStoreCatalogRepository(
      staffResult.serviceClient,
    );

    if (route.kind === "items" && request.method === "GET") {
      return storeCatalogRouteResultToResponse(
        await handleListStoreCatalogRoute(
          {
            gameSessionId: route.gameSessionId,
            audience: "staff",
          },
          { storeCatalogRepository },
        ),
      );
    }

    if (route.kind === "items" && request.method === "POST") {
      return storeCatalogRouteResultToResponse(
        await handleCreateStoreCatalogItemRoute(
          {
            gameSessionId: route.gameSessionId,
            audience: "staff",
            body: await readStoreCatalogJsonBody(request),
          },
          { storeCatalogRepository },
        ),
      );
    }

    if (route.kind === "item" && request.method === "PATCH") {
      return storeCatalogRouteResultToResponse(
        await handleUpdateStoreCatalogItemRoute(
          {
            gameSessionId: route.gameSessionId,
            itemId: route.itemId,
            audience: "staff",
            body: await readStoreCatalogJsonBody(request),
          },
          { storeCatalogRepository },
        ),
      );
    }

    return jsonError(405, {
      code: "method_not_allowed",
      message: "Store catalog method is not allowed.",
      retryable: false,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "store_catalog_request_failed",
      message: "Store catalog request failed.",
      retryable: false,
    });
  }
}

async function readStoreCatalogJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_store_request_body",
      "Request body must be valid JSON.",
      400,
      false,
    );
  }
}

function storeCatalogRouteResultToResponse(
  result: StoreCatalogRouteResult,
): Response {
  if (result.ok) {
    return jsonResponse(result.status, {
      ok: true,
      ...result.body,
    });
  }

  return jsonError(result.status, {
    code: result.body.error.code,
    message: result.body.error.message,
    retryable: false,
  });
}
