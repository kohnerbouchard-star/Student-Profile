import { json, proxyClassroom } from "./common.ts";
import { normalizeRuntimeMutation } from "./runtimeMutationNormalization.ts";
import { handleStaffInventoryRedemptionRequest } from "../../../src/domains/inventory/api/inventoryRedemptionHttpHandlers.ts";

export { normalizeRuntimeMutation } from "./runtimeMutationNormalization.ts";

export async function normalizeInventoryRedemptionReviewRequest(
  request: Request,
): Promise<Request> {
  if (request.method !== "PATCH") return request;

  const value = await request.clone().json().catch(() => ({}));
  if (!value || typeof value !== "object" || Array.isArray(value)) return request;

  const source = value as Record<string, unknown>;
  const note = source.note ?? source.resolutionNote;
  if (note === undefined || source.note !== undefined) return request;

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify({ ...source, note }),
  });
}

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
