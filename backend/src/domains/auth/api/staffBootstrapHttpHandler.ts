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
import {
  overwriteTrustedClientIpHeaders,
  type TrustedIpHeader,
} from "../../../security/rateLimitKeying.ts";

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
    readonly joinCode: string | null;
    readonly gameCode: string | null;
    readonly joinCodeStatus: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

interface StaffBootstrapSessionRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly game_join_code: string | null;
  readonly game_join_code_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

const INTERNAL_WEB_SESSION_ORIGIN = "https://web-session.internal";
const INTERNAL_WEB_SESSION_RATE_LIMIT_IP = "192.0.2.1";
const DEFAULT_TRUSTED_IP_HEADER: TrustedIpHeader = "x-real-ip";

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

    const protectedRequest = internalWebSessionRequest(request);
    const staffResult = await resolveStaffSessionForRequest(
      protectedRequest,
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
      .select("id,name,status,game_join_code,game_join_code_status,created_at,updated_at")
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
        joinCode: session.game_join_code,
        gameCode: session.game_join_code,
        joinCodeStatus: session.game_join_code_status,
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

function internalWebSessionRequest(request: Request): Request {
  const url = new URL(request.url);
  if (url.origin !== INTERNAL_WEB_SESSION_ORIGIN) return request;

  // The web-session handler has already authenticated the browser request and
  // is the only owner of this synthetic internal origin. Preserve universal
  // Staff limiting without accepting a browser-supplied network header. The
  // internal request must use the same trusted header selected by runtime
  // configuration; otherwise the shared limiter fails before consuming.
  return new Request(request, {
    headers: overwriteTrustedClientIpHeaders(
      request.headers,
      configuredTrustedIpHeader(),
      INTERNAL_WEB_SESSION_RATE_LIMIT_IP,
    ),
  });
}

function configuredTrustedIpHeader(): TrustedIpHeader {
  const configured = String(
    Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") || "",
  ).trim().toLowerCase();
  return configured === "cf-connecting-ip" || configured === "x-real-ip"
    ? configured
    : DEFAULT_TRUSTED_IP_HEADER;
}
