import {
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
  resolveStaffSessionForRequest,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  handleLicensingActivationRoute,
} from "./activationRouteHandler.ts";
import {
  createSupabaseLicensingActivationRepository,
  type SupabaseLicensingActivationRepositoryClient,
} from "../infrastructure/licensingRepository.ts";

interface LicensingActivationEdgeDependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

export async function handleLicensingActivationRequest(
  request: Request,
  dependencies: LicensingActivationEdgeDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST to activate licensing.",
        retryable: false,
      },
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonResponse(500, {
        ok: false,
        error: {
          code: "missing_edge_runtime_config",
          message: "Classroom API runtime configuration is incomplete.",
          retryable: false,
        },
      });
    }

    let body: unknown = undefined;

    const staffResult = await resolveStaffSessionForRequest(
      request,
      envResult.value,
      dependencies,
      {
        missingMessage: "A verified Supabase Auth user is required to activate licensing.",
        lookupFailureError: {
          code: "licensing_activation_failed",
          message: "Purchase-code activation failed.",
          retryable: false,
        },
        beforeStaffLookup: async () => {
          try {
            body = await request.json();

            return { ok: true };
          } catch {
            return {
              ok: false,
              status: 400,
              error: {
                code: "invalid_request_body",
                message: "Request body must be a JSON object.",
                retryable: false,
              },
            };
          }
        },
      },
    );

    if (!staffResult.ok) {
      return jsonResponse(staffResult.status, {
        ok: false,
        error: staffResult.error,
      });
    }

    const result = await handleLicensingActivationRoute(
      {
        body,
        supabaseAuthUser: {
          id: staffResult.authUser.id,
          email: staffResult.authUser.email ?? null,
        },
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
        source: "classroom_api_edge_licensing_activation",
      },
      {
        staffRepository: {
          findStaffUserBySupabaseAuthUserId: async (supabaseAuthUserId) =>
            supabaseAuthUserId === staffResult.staff.supabase_auth_user_id
              ? staffResult.staff
              : null,
        },
        activationRepository: createSupabaseLicensingActivationRepository(
          staffResult.serviceClient as unknown as SupabaseLicensingActivationRepositoryClient,
        ),
      },
    );

    return jsonResponse(result.status, result.body);
  } catch {
    return jsonResponse(500, {
      ok: false,
      error: {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      },
    });
  }
}
