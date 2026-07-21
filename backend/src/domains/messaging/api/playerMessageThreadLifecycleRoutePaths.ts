export type PlayerMessageThreadLifecycleRoute =
  | { readonly kind: "policy" }
  | { readonly kind: "createThread" }
  | { readonly kind: "malformed" };

export function readPlayerMessageThreadLifecycleRoutePath(
  pathname: string,
): PlayerMessageThreadLifecycleRoute | null {
  const segments = readRouteSegments(pathname.split("/").filter(Boolean));
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

  return null;
}

function readRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;
  const classroomApiIndex = segments.lastIndexOf("classroom-api");
  if (classroomApiIndex < 0) return null;
  return segments.slice(classroomApiIndex + 1);
}
