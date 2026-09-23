import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { classroomTrustedClientIp, corsHeaders } from "./common.ts";
import {
  contractErrorToResponse,
  listStaffContractProgress,
} from "../../../src/domains/contracts/api/staffContractHttpHandler.ts";
import { readStaffContractRoutePath } from "../../../src/domains/contracts/api/contractRoutePaths.ts";
import type { ContractRepository } from "../../../src/domains/contracts/contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "../../../src/domains/contracts/infrastructure/supabaseContractRepository.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { jsonError } from "../../../src/platform/supabase/edgeResponse.ts";
import {
  enforceStaffRequestRateLimit,
  normalizedStaffAction,
} from "../../../src/security/staffRequestRateLimit.ts";

interface ContractProgressReadInput {
  readonly applicationContext: AdminRequestApplicationContext;
  readonly gameSessionId: string;
  readonly contractId: string;
}

interface ContractProgressReadDependencies {
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly projectTrustedClientIp?: typeof classroomTrustedClientIp;
  readonly consumeRateLimit?: typeof enforceStaffRequestRateLimit;
  readonly createRepository?: (service: EdgeSupabaseClient) => ContractRepository;
}

/** Uses only the post-guard Admin authority and the existing Contracts reader. */
export async function handleContractProgressReadOperation(
  request: Request,
  service: EdgeSupabaseClient,
  input: ContractProgressReadInput,
  dependencies: ContractProgressReadDependencies = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await readProgress(request, service, input, dependencies);
  } catch (error) {
    response = contractErrorToResponse(error);
  }
  // Keep the previous proxy's outer response contract, not the Edge headers.
  return new Response(await response.text(), {
    status: response.status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function readProgress(
  request: Request,
  service: EdgeSupabaseClient,
  input: ContractProgressReadInput,
  dependencies: ContractProgressReadDependencies,
): Promise<Response> {
  const context = input.applicationContext;
  if (
    !context || context.role !== "game_admin" ||
    context.actor?.kind !== "staff" || !context.actor.staffUserId ||
    context.requiredPermission !== "contracts.manage" ||
    !Array.isArray(context.permissions) ||
    !context.permissions.includes("contracts.manage") ||
    context.gameSessionId !== input.gameSessionId
  ) {
    return jsonError(403, {
      code: "staff_permission_denied",
      message: "Contract progress requires the authorized Admin game context.",
      retryable: false,
    });
  }

  const path = `/staff/game-sessions/${encodeURIComponent(context.gameSessionId)}` +
    `/contracts/${encodeURIComponent(input.contractId)}/progress`;
  const route = readStaffContractRoutePath(path);
  if (!route || route.kind !== "progress") {
    return jsonError(404, {
      code: "route_not_found",
      message: "Classroom API route was not found.",
      retryable: false,
    });
  }
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to list contract progress.",
      retryable: false,
    });
  }

  const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
  if (!environment.ok) {
    return jsonError(500, {
      code: "missing_edge_runtime_config",
      message: "Classroom API runtime configuration is incomplete.",
      retryable: false,
    });
  }

  // The old Admin hop omits query parameters and forwards only validated IP data.
  const headers = new Headers();
  const trustedIp = (dependencies.projectTrustedClientIp ?? classroomTrustedClientIp)(request);
  if (trustedIp) headers.set(trustedIp.header, trustedIp.value);
  const readRequest = new Request(
    `${environment.value.supabaseUrl}/functions/v1/classroom-api${path}`,
    { method: "GET", headers },
  );
  try {
    const decision = await (dependencies.consumeRateLimit ?? enforceStaffRequestRateLimit)({
      request: readRequest,
      action: normalizedStaffAction("GET", new URL(readRequest.url).pathname),
      profile: "read",
      // The existing Staff resolver uses this fallback for /staff/game-sessions.
      gameId: context.actor.staffUserId,
      staffUserId: context.actor.staffUserId,
    }, service);
    if (!decision.allowed) {
      return jsonError(429, {
        code: "staff_rate_limit_exceeded",
        message: "Too many staff requests. Try again later.",
        retryable: true,
      });
    }
  } catch {
    return jsonError(503, {
      code: "staff_rate_limit_unavailable",
      message: "Staff request protection is unavailable.",
      retryable: true,
    });
  }

  const ownership = await readOwnedGameSession(
    service, context.gameSessionId, context.actor.staffUserId,
  );
  if (!ownership.ok) return jsonError(ownership.status, ownership.error);
  const repository = dependencies.createRepository
    ? dependencies.createRepository(service)
    : new SupabaseContractRepository(service);
  return await listStaffContractProgress(
    readRequest, context.gameSessionId, route.contractId, repository,
  );
}
