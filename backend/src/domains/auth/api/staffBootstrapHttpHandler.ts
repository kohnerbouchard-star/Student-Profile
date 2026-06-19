import {
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
  resolveStaffSessionForRequest,
} from "../../../platform/supabase/edgeStaffSession.ts";

interface StaffBootstrapDependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

interface StaffBootstrapBody {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly supabaseAuthUserId: string;
    readonly email: string | null;
    readonly displayName: string;
  };
  readonly activeGameSessions: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

interface StaffBootstrapSessionRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export async function handleStaffBootstrapRequest(
  request: Request,
  dependencies: StaffBootstrapDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load staff bootstrap data.",
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

    const staffResult = await resolveStaffSessionForRequest(
      request,
      envResult.value,
      dependencies,
      {
        missingMessage: "A verified Supabase Auth user is required to load staff data.",
        lookupFailureError: {
          code: "staff_bootstrap_failed",
          message: "Staff bootstrap failed.",
          retryable: false,
        },
      },
    );

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const { serviceClient, staff } = staffResult;

    const sessionsResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,created_at,updated_at")
      .eq("owner_staff_user_id", staff.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (sessionsResponse.error) {
      return jsonError(500, {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      });
    }

    return jsonResponse<StaffBootstrapBody>(200, {
      ok: true,
      staff: {
        id: staff.id,
        supabaseAuthUserId: staff.supabase_auth_user_id,
        email: staff.email,
        displayName: staff.display_name,
      },
      activeGameSessions: ((sessionsResponse.data ?? []) as readonly StaffBootstrapSessionRow[]).map((session) => ({
        id: session.id,
        name: session.name,
        status: session.status,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      })),
    });
  } catch {
    return jsonError(500, {
      code: "staff_bootstrap_failed",
      message: "Staff bootstrap failed.",
      retryable: false,
    });
  }
}
