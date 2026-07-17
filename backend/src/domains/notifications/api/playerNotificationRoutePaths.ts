export type PlayerNotificationRoute =
  | { readonly kind: "list" }
  | { readonly kind: "markRead" };

export function readPlayerNotificationRoutePath(
  pathname: string,
): PlayerNotificationRoute | null {
  const segments = pathname.split("/").filter(Boolean);

  if (matchesRoute(segments, ["players", "me", "notifications"])) {
    return { kind: "list" };
  }

  if (matchesRoute(segments, ["players", "me", "notifications", "read"])) {
    return { kind: "markRead" };
  }

  return null;
}

function matchesRoute(
  segments: readonly string[],
  expectedTail: readonly string[],
): boolean {
  if (segments.length < expectedTail.length) {
    return false;
  }

  const tailStart = segments.length - expectedTail.length;

  if (
    expectedTail.some((segment, index) =>
      segments[tailStart + index] !== segment
    )
  ) {
    return false;
  }

  return tailStart === 0 || segments[tailStart - 1] === "classroom-api";
}
