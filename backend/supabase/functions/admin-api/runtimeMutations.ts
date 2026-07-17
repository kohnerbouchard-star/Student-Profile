import { json, proxyClassroom } from "./common.ts";
import { normalizeRuntimeMutation } from "./runtimeMutationNormalization.ts";
import { normalizeInventoryRedemptionReviewRequest } from "./inventoryRedemptionRequestNormalization.ts";
import { handleStaffInventoryRedemptionRequest } from "../../../src/domains/inventory/api/inventoryRedemptionHttpHandlers.ts";

export { normalizeRuntimeMutation } from "./runtimeMutationNormalization.ts";
export { normalizeInventoryRedemptionReviewRequest } from "./inventoryRedemptionRequestNormalization.ts";

export async function handleRuntimeMutation(
  request: Request,
  context: any,
  gameId: string,
  suffix: string,
): Promise<Response | null> {
  const redemptionMatch = suffix.match(/^\/inventory\/redemptions(?:\/([^/]+))?$/);
  if (redemptionMatch) {
    return handleStaffInventoryRedemptionRequest(
      await normalizeInventoryRedemptionReviewRequest(request),
      gameId,
      redemptionMatch[1] ? decodeURIComponent(redemptionMatch[1]) : null,
      {
        serviceClient: context.service,
        staffUserId: context.staff.id,
      },
    );
  }

  if (request.method !== "POST") return null;

  const value = await request.clone().json().catch(() => ({}));
  const normalized = normalizeRuntimeMutation(
    gameId,
    suffix,
    request.method,
    value,
  );

  if (!normalized) return null;
  if ("status" in normalized) {
    return json(request, normalized.status, {
      code: normalized.code,
      message: normalized.message,
    });
  }

  return proxyClassroom(
    request,
    context,
    normalized.mutation.classroomPath,
    "POST",
    normalized.mutation.body,
  );
}
