import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

export type PlayerMessageThreadLifecycleRoute =
  | { readonly kind: "policy" }
  | { readonly kind: "createThread" }
  | { readonly kind: "malformed" };

export function readPlayerMessageThreadLifecycleRoutePath(
  pathname: string,
): PlayerMessageThreadLifecycleRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (!segments) return null;

  if (
    segments.length === 4 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages" &&
    segments[3] === "policy"
  ) {
    return { kind: "policy" };
  }

  if (
    segments.length === 4 &&
    segments[0] === "players" &&
    segments[1] === "me" &&
    segments[2] === "messages" &&
    segments[3] === "threads"
  ) {
    return { kind: "createThread" };
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
