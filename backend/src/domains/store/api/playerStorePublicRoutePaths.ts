import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

export type PlayerStorePublicRoute =
  | { readonly kind: "items" }
  | { readonly kind: "quotes" }
  | { readonly kind: "purchases" };

export function readPlayerStorePublicRoutePath(
  pathname: string,
): PlayerStorePublicRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (
    !segments ||
    segments.length !== 4 ||
    segments[0] !== "players" ||
    segments[1] !== "me" ||
    segments[2] !== "store"
  ) {
    return null;
  }

  const resource = segments[3];
  if (resource === "items") return { kind: "items" };
  if (resource === "quotes") return { kind: "quotes" };
  if (resource === "purchases") return { kind: "purchases" };
  return null;
}
