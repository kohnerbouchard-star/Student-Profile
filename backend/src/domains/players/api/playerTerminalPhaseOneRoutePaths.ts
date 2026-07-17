export type PlayerTerminalPhaseOneRoute =
  | { readonly kind: "inventory" }
  | { readonly kind: "logout" };

export function readPlayerTerminalPhaseOneRoutePath(
  pathname: string,
): PlayerTerminalPhaseOneRoute | null {
  const segments = pathname.split("/").filter(Boolean);

  if (matchesRoute(segments, ["players", "me", "inventory"])) {
    return { kind: "inventory" };
  }

  if (matchesRoute(segments, ["players", "me", "session", "logout"])) {
    return { kind: "logout" };
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
