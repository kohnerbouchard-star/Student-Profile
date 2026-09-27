import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { json } from "./common.ts";
import { issueContractRewardsAtomically } from "./contractRewards.ts";
import type { EdgeSupabaseClient } from "../../../src/platform/supabase/edgeStaffSession.ts";

export interface AdminContractRewardIssueDependencies {
  readonly issueRewards?: typeof issueContractRewardsAtomically;
  readonly createRequestId?: () => string;
}

export async function handleAdminContractRewardIssueOperation(
  request: Request,
  serviceClient: EdgeSupabaseClient,
  input: {
    readonly applicationContext: AdminRequestApplicationContext;
    readonly gameSessionId: string;
    readonly suffix: string;
  },
  dependencies: AdminContractRewardIssueDependencies = {},
): Promise<Response | null> {
  const match = input.suffix.match(
    /^\/contracts\/([^/]+)\/progress\/([^/]+)\/rewards\/issue$/,
  );
  if (!match || request.method !== "POST") return null;

  const context = input.applicationContext;
  if (
    !context || context.role !== "game_admin" ||
    context.actor?.kind !== "staff" || !context.actor.staffUserId ||
    context.gameSessionId !== input.gameSessionId ||
    context.requiredPermission !== "contracts.manage" ||
    !Array.isArray(context.permissions) ||
    !context.permissions.includes("contracts.manage")
  ) {
    return json(request, 403, {
      code: "staff_permission_denied",
      message: "Contract reward issuance requires the authorized Admin game context.",
    });
  }

  const contractId = decodeURIComponent(match[1]);
  const progressId = decodeURIComponent(match[2]);
  const idempotencyKey = request.headers.get("idempotency-key") ||
    request.headers.get("x-idempotency-key");
  // Preserve the legacy audit-ID fallback; supplied retry identities are never replaced.
  const requestId = request.headers.get("x-request-id") || idempotencyKey ||
    (dependencies.createRequestId ?? (() => crypto.randomUUID()))();

  const reward = await (dependencies.issueRewards ?? issueContractRewardsAtomically)(
    serviceClient,
    {
      gameSessionId: context.gameSessionId,
      contractId,
      progressId,
      staffUserId: context.actor.staffUserId,
      requestId,
    },
  );
  if (!reward.ok) {
    return json(request, reward.status, { error: reward.error });
  }
  return json(request, reward.status, reward.body);
}
