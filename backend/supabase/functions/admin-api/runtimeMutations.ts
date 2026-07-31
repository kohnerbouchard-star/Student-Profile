import { json, proxyClassroom } from "./common.ts";
import { normalizeRuntimeMutation } from "./runtimeMutationNormalization.ts";

export { normalizeRuntimeMutation } from "./runtimeMutationNormalization.ts";

const NORMALIZED_RUNTIME_SUFFIXES = new Set([
  "/players",
  "/attendance/scans",
  "/attendance/scan",
]);

export function runtimeMutationDispatch(
  gameId: string,
  suffix: string,
  method: string,
):
  | { readonly kind: "direct"; readonly classroomPath: string }
  | { readonly kind: "normalized" }
  | null {
  if (method !== "POST") return null;
  if (suffix === "/join-code/reset") {
    return {
      kind: "direct",
      classroomPath: `/games/${encodeURIComponent(gameId)}/join-code/reset`,
    };
  }
  return NORMALIZED_RUNTIME_SUFFIXES.has(suffix)
    ? { kind: "normalized" }
    : null;
}

export async function handleRuntimeMutation(
  request: Request,
  context: any,
  gameId: string,
  suffix: string,
): Promise<Response | null> {
  const dispatch = runtimeMutationDispatch(
    gameId,
    suffix,
    request.method,
  );
  if (!dispatch) return null;

  if (dispatch.kind === "direct") {
    return proxyClassroom(
      request,
      context,
      dispatch.classroomPath,
      "POST",
      {},
    );
  }

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
