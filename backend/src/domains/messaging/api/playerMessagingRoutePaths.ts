import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

export type PlayerMessagingRoute =
  | { readonly kind: "list" }
  | { readonly kind: "search" }
  | { readonly kind: "thread"; readonly threadId: string }
  | { readonly kind: "send"; readonly threadId: string }
  | { readonly kind: "markRead"; readonly threadId: string | null }
  | { readonly kind: "malformed" };

const THREAD_ID_PATTERN = /^thr_[0-9a-f]{32}$/;

export function readPlayerMessagingRoutePath(
  pathname: string,
): PlayerMessagingRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (!segments) return null;

  if (
    segments.length === 3 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages"
  ) {
    return { kind: "list" };
  }

  if (
    segments.length === 4 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages" &&
    segments[3] === "search"
  ) {
    return { kind: "search" };
  }

  if (
    segments.length === 4 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages" &&
    segments[3] === "read"
  ) {
    return { kind: "markRead", threadId: null };
  }

  if (
    segments.length === 5 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages" &&
    segments[3] === "threads" &&
    THREAD_ID_PATTERN.test(segments[4])
  ) {
    return { kind: "thread", threadId: segments[4] };
  }

  if (
    segments.length === 6 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages" &&
    segments[3] === "threads" &&
    THREAD_ID_PATTERN.test(segments[4]) &&
    segments[5] === "messages"
  ) {
    return { kind: "send", threadId: segments[4] };
  }

  if (
    segments.length === 6 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages" &&
    segments[3] === "threads" &&
    THREAD_ID_PATTERN.test(segments[4]) &&
    segments[5] === "read"
  ) {
    return { kind: "markRead", threadId: segments[4] };
  }

  if (
    segments.length >= 3 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages"
  ) {
    return { kind: "malformed" };
  }

  return null;
}
