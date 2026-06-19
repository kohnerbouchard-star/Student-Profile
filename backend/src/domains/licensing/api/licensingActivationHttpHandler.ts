import {
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { extractBearerToken } from "../../../platform/supabase/edgeAuth.ts";
import type {
  StaffAccessRepository,
} from "../../../auth/staffAccess.ts";
import type {
  StaffUserRecord,
  SupabaseAuthUser,
} from "../../../auth/types.ts";
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

interface StaffUserRow {
  readonly id: string;
  readonly supabase_auth_user_id: string;
  readonly email: string;
  readonly display_name: string;
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

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return jsonResponse(401, {
        ok: false,
        error: {
          code: "missing_staff_auth_user",
          message: "A verified Supabase Auth user is required to activate licensing.",
          retryable: false,
        },
      });
    }

    const authClient = dependencies.createAuthClient(envResult.value);
    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonResponse(401, {
        ok: false,
        error: {
          code: "missing_staff_auth_user",
          message: "A verified Supabase Auth user is required to activate licensing.",
          retryable: false,
        },
      });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, {
        ok: false,
        error: {
          code: "invalid_request_body",
          message: "Request body must be a JSON object.",
          retryable: false,
        },
      });
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const supabaseAuthUser: SupabaseAuthUser = {
      id: authUser.id,
      email: authUser.email ?? null,
    };

    const result = await handleLicensingActivationRoute(
      {
        body,
        supabaseAuthUser,
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
        source: "classroom_api_edge_licensing_activation",
      },
      {
        staffRepository: createStaffRepository(serviceClient),
        activationRepository: createSupabaseLicensingActivationRepository(
          serviceClient as unknown as SupabaseLicensingActivationRepositoryClient,
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

function createStaffRepository(
  serviceClient: EdgeSupabaseClient,
): Pick<StaffAccessRepository, "findStaffUserBySupabaseAuthUserId"> {
  return {
    findStaffUserBySupabaseAuthUserId: async (supabaseAuthUserId) => {
      const response = await serviceClient
        .from("staff_users")
        .select("id,supabase_auth_user_id,email,display_name")
        .eq("supabase_auth_user_id", supabaseAuthUserId)
        .maybeSingle();

      if (response.error) {
        throw response.error;
      }

      const row = response.data as StaffUserRow | null;

      return row ? mapStaffUserRow(row) : null;
    },
  };
}

function mapStaffUserRow(row: StaffUserRow): StaffUserRecord {
  return {
    id: row.id,
    supabase_auth_user_id: row.supabase_auth_user_id,
    email: row.email,
    display_name: row.display_name,
  };
}
