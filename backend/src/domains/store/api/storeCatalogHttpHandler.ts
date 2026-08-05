/// <reference lib="dom" />

import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  AdminMutationError,
  readAdminMutationIdentity,
} from "../../../platform/supabase/adminMutation.ts";
import { mutateAdminStoreItem } from "../application/adminStoreItemMutation.ts";
import { StoreCatalogValidationError } from "../domain/storeCatalogRules.ts";
import { handleListStoreCatalogRoute } from "./storeCatalogRouteHandler.ts";
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
  if (
    route.kind === "items" && request.method !== "GET" &&
    request.method !== "POST"
  ) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or POST for store catalog items.",
      retryable: false,
    });
  }

  if (
    route.kind === "item" &&
    request.method !== "PATCH" &&
    request.method !== "PUT" &&
    request.method !== "DELETE"
  ) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use PATCH, PUT, or DELETE for a store catalog item.",
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

    const staffResult = await dependencies.resolveStaffForRequest(
      request,
      envResult.value,
      {
        missingMessage:
          "A verified Supabase Auth user is required to manage store items.",
      },
    );

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
      const body = await readStoreCatalogJsonBody(request);
      const result = await mutateAdminStoreItem(staffResult.serviceClient, {
        gameSessionId: route.gameSessionId,
        staffUserId: staffResult.staff.id,
        operation: "create",
        body,
        identity: readAdminMutationIdentity(request, body),
      });

      return jsonResponse(result.status, {
        ok: true,
        item: result.item,
      });
    }

    if (
      route.kind === "item" &&
      (request.method === "PATCH" || request.method === "PUT")
    ) {
      const body = await readStoreCatalogJsonBody(request);
      const result = await mutateAdminStoreItem(staffResult.serviceClient, {
        gameSessionId: route.gameSessionId,
        staffUserId: staffResult.staff.id,
        operation: "update",
        itemId: route.itemId,
        body,
        identity: readAdminMutationIdentity(request, body),
      });

      return jsonResponse(result.status, {
        ok: true,
        item: result.item,
      });
    }

    if (route.kind === "item" && request.method === "DELETE") {
      const body = await readStoreCatalogJsonBody(request, true);
      const result = await mutateAdminStoreItem(staffResult.serviceClient, {
        gameSessionId: route.gameSessionId,
        staffUserId: staffResult.staff.id,
        operation: "archive",
        itemId: route.itemId,
        body,
        identity: readAdminMutationIdentity(request, body),
      });

      return jsonResponse(result.status, {
        ok: true,
        item: result.item,
      });
    }

    return jsonError(405, {
      code: "method_not_allowed",
      message: "Store catalog method is not allowed.",
      retryable: false,
    });
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    if (error instanceof StoreCatalogValidationError) {
      return jsonError(400, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

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

async function readStoreCatalogJsonBody(
  request: Request,
  optional = false,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim() && optional) {
    return {};
  }

  try {
    const body: unknown = JSON.parse(text);
    if (!isRecord(body)) {
      throw new Error("not an object");
    }
    return body;
  } catch {
    throw new EdgeActivationError(
      "invalid_store_request_body",
      "Request body must be a JSON object.",
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
