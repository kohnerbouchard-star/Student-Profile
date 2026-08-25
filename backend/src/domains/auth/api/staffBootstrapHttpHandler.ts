import {
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  resolveStaffSessionForRequest,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  overwriteTrustedClientIpHeaders,
  type TrustedIpHeader,
} from "../../../security/rateLimitKeying.ts";
import {
  discoverStaffGameSessionIds,
  hydrateStaffGameSessionBootstrap,
  type StaffGameSessionBootstrapRepository,
} from "../application/staffGameSessionBootstrap.ts";
import { createSupabaseStaffGameSessionBootstrapRepository } from "../infrastructure/supabaseStaffGameSessionBootstrapRepository.ts";
import {
  createStaffRequestApplicationContext,
  type CreateStaffRequestApplicationContextInput,
} from "../../../shared/staffRequestApplicationContextFactory.ts";

interface StaffBootstrapDependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveStaffSession?: typeof resolveStaffSessionForRequest;
  readonly createBootstrapRepository?: (
    client: EdgeSupabaseClient,
  ) => StaffGameSessionBootstrapRepository;
  readonly createApplicationContext?: (
    input: CreateStaffRequestApplicationContextInput,
  ) => ReturnType<typeof createStaffRequestApplicationContext>;
  readonly createRequestId?: () => string;
}

interface StaffBootstrapBody {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly supabaseAuthUserId: string;
    readonly email: string | null;
    readonly displayName: string;
    readonly status: "active" | "onboarding";
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

interface OptionalDenoEnvironment {
  readonly env?: {
    readonly get?: (name: string) => string | undefined;
  };
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
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const protectedRequest = internalWebSessionRequest(request);
    const resolveStaffSession = dependencies.resolveStaffSession ??
      resolveStaffSessionForRequest;
    const staffResult = await resolveStaffSession(
      protectedRequest,
      envResult.value,
      dependencies,
      {
        missingMessage:
          "A verified Supabase Auth user is required to load staff data.",
        lookupFailureError: {
          code: "staff_bootstrap_failed",
          message: "Staff bootstrap failed.",
          retryable: false,
        },
        allowedStatuses: ["active", "onboarding"],
      },
    );

    if (staffResult.ok === false) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const { serviceClient, staff } = staffResult;
    const repository = (dependencies.createBootstrapRepository ??
      createSupabaseStaffGameSessionBootstrapRepository)(serviceClient);
    const gameSessionIds = await discoverStaffGameSessionIds(repository, {
      staffUserId: staff.id,
      visibility: "active",
    });
    const requestId = (dependencies.createRequestId ?? (() =>
      crypto.randomUUID()))();
    const createApplicationContext = dependencies.createApplicationContext ??
      createStaffRequestApplicationContext;
    const applicationContexts = gameSessionIds.map((gameSessionId) =>
      createApplicationContext({
        ownedGame: { id: gameSessionId },
        staff: { id: staff.id, role: staff.role },
        assuranceLevel: staffResult.assuranceLevel,
        requestId,
      })
    );
    const sessions = await hydrateStaffGameSessionBootstrap(repository, {
      applicationContexts,
      visibility: "active",
    });

    return jsonResponse<StaffBootstrapBody>(200, {
      ok: true,
      staff: {
        id: staff.id,
        supabaseAuthUserId: staff.supabase_auth_user_id,
        email: staff.email,
        displayName: staff.display_name,
        status: staff.status,
      },
      activeGameSessions: sessions.map(({ gameSession }) => ({
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
        joinCode: gameSession.gameJoinCode,
        gameCode: gameSession.gameJoinCode,
        joinCodeStatus: gameSession.gameJoinCodeStatus,
        createdAt: gameSession.createdAt,
        updatedAt: gameSession.updatedAt,
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

  return new Request(request, {
    headers: overwriteTrustedClientIpHeaders(
      request.headers,
      configuredTrustedIpHeader(),
      INTERNAL_WEB_SESSION_RATE_LIMIT_IP,
    ),
  });
}

function configuredTrustedIpHeader(): TrustedIpHeader {
  const deno =
    (globalThis as typeof globalThis & { Deno?: OptionalDenoEnvironment }).Deno;
  const configured = String(
    deno?.env?.get?.("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") ?? "",
  ).trim().toLowerCase();
  return configured === "cf-connecting-ip" || configured === "x-real-ip"
    ? configured
    : DEFAULT_TRUSTED_IP_HEADER;
}
