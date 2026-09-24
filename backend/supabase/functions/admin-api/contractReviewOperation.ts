import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { json } from "./common.ts";
import { normalizeContractReview } from "./mutationAdapters.ts";
import { readStaffContractRoutePath } from "../../../src/domains/contracts/api/contractRoutePaths.ts";
import type { ContractReviewReadRepository } from "../../../src/domains/contracts/infrastructure/contractReviewReadRepository.ts";

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
