/// <reference lib="dom" />

import {
  handlePlayerMessageThreadLifecycleRequest,
} from "./playerMessageThreadLifecycleHttpHandler.ts";
import {
  readPlayerMessageThreadLifecycleRoutePath,
} from "./playerMessageThreadLifecycleRoutePaths.ts";
import {
  handlePlayerMessagingRequest,
} from "./playerMessagingHttpHandler.ts";
import {
  readPlayerMessagingRoutePath,
} from "./playerMessagingRoutePaths.ts";
import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  dispatchRateLimitedReviewedPlayerRequest,
} from "../../../security/playerRateLimitDispatch.ts";
import type {
  ReviewedPlayerRateLimitEndpointKey,
} from "../../../security/playerRateLimitDispatch.ts";

export interface ClassroomMessagingDispatchDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

export async function dispatchClassroomMessagingRequest(
  request: Request,
  dependencies: ClassroomMessagingDispatchDependencies,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const lifecycleRoute = readPlayerMessageThreadLifecycleRoutePath(pathname);

  if (lifecycleRoute) {
    const endpointKey: ReviewedPlayerRateLimitEndpointKey =
      lifecycleRoute.kind === "createThread"
        ? "messageThreadCreate"
        : "messagePolicy";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerMessageThreadLifecycleRequest(
          request,
          lifecycleRoute,
          dependencies,
        ),
      dependencies,
    );
  }

  const route = readPlayerMessagingRoutePath(pathname);
  if (!route) return null;

  const endpointKey: ReviewedPlayerRateLimitEndpointKey = route.kind === "list"
    ? "messages"
    : route.kind === "thread"
    ? "messageThread"
    : route.kind === "search"
    ? "messageSearch"
    : route.kind === "send"
    ? "messageSend"
    : "messageRead";

  return dispatchRateLimitedReviewedPlayerRequest(
    request,
    endpointKey,
    () => handlePlayerMessagingRequest(request, route, dependencies),
    dependencies,
  );
}
