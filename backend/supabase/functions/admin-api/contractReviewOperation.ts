import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { classroomTrustedClientIp, corsHeaders, json } from "./common.ts";
import { issueContractRewardsAtomically } from "./contractRewards.ts";
import { normalizeContractReview } from "./mutationAdapters.ts";
import { readStaffContractRoutePath } from "../../../src/domains/contracts/api/contractRoutePaths.ts";
import {
  type ContractReviewReadRepository,
  SupabaseContractReviewReadRepository,
} from "../../../src/domains/contracts/infrastructure/contractReviewReadRepository.ts";
import { executeStaffContractReviewOperation } from "../../../src/domains/contracts/application/staffContractReviewOperation.ts";
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

export type ContractReviewAlias = "decision" | "submission" | "progress";

export interface AdminContractReviewCommand {
  readonly alias: ContractReviewAlias;
  readonly applicationContext: AdminRequestApplicationContext;
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly reviewPath: string;
  readonly method: "POST";
  readonly originalRequest: Request;
  readonly normalizedBody: Readonly<Record<string, unknown>>;
  readonly identity: {
    readonly requestId: string;
    readonly idempotencyKey: string | null;
  };
  readonly issueRewardAfterApproval: boolean;
}

export type PreparedAdminContractReview =
  | { readonly kind: "unhandled" }
  | { readonly kind: "response"; readonly response: Response }
  | { readonly kind: "command"; readonly command: AdminContractReviewCommand };

/** Preparation only: no review, reward, audit write or downstream request. */
export async function prepareAdminContractReview(
  request: Request,
  gameSessionId: string,
  suffix: string,
  context: AdminRequestApplicationContext,
  repository: ContractReviewReadRepository,
  dependencies: { readonly createRequestId?: () => string } = {},
): Promise<PreparedAdminContractReview> {
  const decision = suffix.match(/^\/contract-submissions\/([^/]+)\/decision$/);
  const submission = suffix.match(/^\/contracts\/([^/]+)\/submissions\/([^/]+)\/review$/);
  const progress = suffix.match(/^\/contracts\/([^/]+)\/progress\/([^/]+)\/review$/);
  const alias: ContractReviewAlias | null = decision ? "decision"
    : submission ? "submission" : progress ? "progress" : null;
  if (!alias || !(alias === "progress"
    ? request.method === "POST"
    : ["POST", "PATCH"].includes(request.method))) return { kind: "unhandled" };

  const requiredPermission = alias === "decision" ? "game.update" : "contracts.manage";
  if (!context || context.role !== "game_admin" || context.actor?.kind !== "staff" ||
    !context.actor.staffUserId || context.gameSessionId !== gameSessionId ||
    context.requiredPermission !== requiredPermission || !Array.isArray(context.permissions) ||
    !context.permissions.includes(requiredPermission)) {
    return { kind: "response", response: json(request, 403, {
      code: "staff_permission_denied",
      message: "Contract review requires the authorized Admin game context.",
    }) };
  }

  let contractId: string;
  let progressId: string;
  if (decision) {
    progressId = decodeURIComponent(decision[1]);
    const identity = await repository.findSubmissionIdentity({
      gameSessionId: context.gameSessionId, submissionId: progressId,
    });
    if (!identity) return { kind: "response", response: json(request, 404, {
      code: "contract_submission_not_found", message: "Contract submission was not found.",
    }) };
    contractId = identity.contractId;
  } else {
    const match = submission ?? progress!;
    contractId = decodeURIComponent(match[1]);
    progressId = decodeURIComponent(match[2]);
  }

  const reviewPath = `/staff/game-sessions/${encodeURIComponent(context.gameSessionId)}` +
    `/contracts/${encodeURIComponent(contractId)}/progress/${encodeURIComponent(progressId)}/review`;
  const normalizedBody = await normalizeContractReview(request.clone());
  const route = readStaffContractRoutePath(reviewPath);
  if (!route || route.kind !== "review") return { kind: "response", response: json(request, 404, {
    ok: false, error: { code: "route_not_found", message: "Classroom API route was not found.", retryable: false },
  }) };

  const idempotencyKey = request.headers.get("idempotency-key") ||
    request.headers.get("x-idempotency-key") || null;
  const requestId = request.headers.get("x-request-id") || idempotencyKey ||
    (dependencies.createRequestId ?? (() => crypto.randomUUID()))();
  return { kind: "command", command: {
    alias, applicationContext: context, gameSessionId: context.gameSessionId,
    staffUserId: context.actor.staffUserId, contractId: route.contractId,
    progressId: route.progressId, reviewPath, method: "POST", originalRequest: request,
    normalizedBody, identity: { requestId, idempotencyKey },
    issueRewardAfterApproval: alias === "decision" && normalizedBody.action === "approve",
  } };
}


export interface AdminContractReviewExecutionDependencies {
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly projectTrustedClientIp?: typeof classroomTrustedClientIp;
  readonly consumeRateLimit?: typeof enforceStaffRequestRateLimit;
  readonly readOwnedGame?: typeof readOwnedGameSession;
  readonly executeReview?: typeof executeStaffContractReviewOperation;
  readonly issueRewards?: typeof issueContractRewardsAtomically;
  readonly createReadRepository?: (serviceClient: EdgeSupabaseClient) => ContractReviewReadRepository;
  readonly now?: () => string;
  readonly createRequestId?: () => string;
}

export async function handleAdminContractReviewOperation(
  request: Request,
  serviceClient: EdgeSupabaseClient,
  input: {
    readonly applicationContext: AdminRequestApplicationContext;
    readonly gameSessionId: string;
    readonly suffix: string;
  },
  dependencies: AdminContractReviewExecutionDependencies = {},
): Promise<Response | null> {
  const readRepository = dependencies.createReadRepository
    ? dependencies.createReadRepository(serviceClient)
    : new SupabaseContractReviewReadRepository(serviceClient);
  const prepared = await prepareAdminContractReview(
    request,
    input.gameSessionId,
    input.suffix,
    input.applicationContext,
    readRepository,
    { createRequestId: dependencies.createRequestId },
  );
  if (prepared.kind === "unhandled") return null;
  if (prepared.kind === "response") return prepared.response;
  return executePreparedAdminContractReview(serviceClient, prepared.command, dependencies);
}

export async function executePreparedAdminContractReview(
  serviceClient: EdgeSupabaseClient,
  command: AdminContractReviewCommand,
  dependencies: AdminContractReviewExecutionDependencies = {},
): Promise<Response> {
  const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
  if (!environment.ok) {
    return outerContractResponse(command.originalRequest, jsonError(500, {
      code: "missing_edge_runtime_config",
      message: "Classroom API runtime configuration is incomplete.",
      retryable: false,
    }));
  }

  const headers = new Headers({ "content-type": "application/json" });
  headers.set("x-request-id", command.identity.requestId);
  if (command.identity.idempotencyKey) headers.set("idempotency-key", command.identity.idempotencyKey);
  const trustedIp = (dependencies.projectTrustedClientIp ?? classroomTrustedClientIp)(command.originalRequest);
  if (trustedIp) headers.set(trustedIp.header, trustedIp.value);

  const limiterRequest = new Request(
    `${environment.value.supabaseUrl}/functions/v1/internal-contract-review${command.reviewPath}`,
    { method: "POST", headers },
  );
  try {
    const decision = await (dependencies.consumeRateLimit ?? enforceStaffRequestRateLimit)({
      request: limiterRequest,
      action: normalizedStaffAction("POST", new URL(limiterRequest.url).pathname),
      profile: "sensitive",
      gameId: command.staffUserId,
      staffUserId: command.staffUserId,
    }, serviceClient);
    if (!decision.allowed) {
      return outerContractResponse(command.originalRequest, jsonError(429, {
        code: "staff_rate_limit_exceeded",
        message: "Too many staff requests. Try again later.",
        retryable: true,
      }));
    }
  } catch {
    return outerContractResponse(command.originalRequest, jsonError(503, {
      code: "staff_rate_limit_unavailable",
      message: "Staff request protection is unavailable.",
      retryable: true,
    }));
  }

  const ownership = await (dependencies.readOwnedGame ?? readOwnedGameSession)(
    serviceClient, command.gameSessionId, command.staffUserId,
  );
  if (ownership.ok !== true) {
    return outerContractResponse(command.originalRequest, jsonError(ownership.status, ownership.error));
  }

  const reviewRequest = new Request(
    `${environment.value.supabaseUrl}/functions/v1/internal-contract-review${command.reviewPath}`,
    { method: "POST", headers, body: JSON.stringify(command.normalizedBody) },
  );
  const reviewResponse = await (dependencies.executeReview ?? executeStaffContractReviewOperation)(
    serviceClient,
    {
      request: reviewRequest,
      gameSessionId: command.gameSessionId,
      contractId: command.contractId,
      progressId: command.progressId,
      reviewedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
    },
  );

  if (!reviewResponse.ok || !command.issueRewardAfterApproval) {
    return outerContractResponse(command.originalRequest, reviewResponse);
  }

  const reward = await (dependencies.issueRewards ?? issueContractRewardsAtomically)(serviceClient, {
    gameSessionId: command.gameSessionId,
    contractId: command.contractId,
    progressId: command.progressId,
    staffUserId: command.staffUserId,
    requestId: command.identity.requestId,
  });
  if (!reward.ok) return json(command.originalRequest, reward.status, { error: reward.error });

  const reviewBody = await responseObject(reviewResponse.clone());
  const rewardBody = asObject(reward.body);
  return json(command.originalRequest, 200, {
    data: {
      reviewed: true,
      rewardIssued: rewardBody.rewardIssued === true,
      alreadyIssued: rewardBody.alreadyIssued === true,
      progress: rewardBody.progress || reviewBody.progress || null,
      rewardResult: rewardBody.rewardResult || {},
    },
    review: reviewBody,
    reward: rewardBody,
  });
}

async function outerContractResponse(request: Request, response: Response): Promise<Response> {
  return new Response(await response.text(), {
    status: response.status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function responseObject(response: Response): Promise<Record<string, unknown>> {
  try { return asObject(await response.json()); } catch { return {}; }
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
