export type PlayerStorePublicRoute =
  | { readonly kind: "items" }
  | { readonly kind: "quotes" }
  | { readonly kind: "purchases" };

export function readPlayerStorePublicRoutePath(
  pathname: string,
): PlayerStorePublicRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const playersIndex = segments.lastIndexOf("players");
  if (playersIndex < 0 || segments[playersIndex + 1] !== "me") return null;
  if (segments[playersIndex + 2] !== "store") return null;

  const resource = segments[playersIndex + 3];
  if (playersIndex + 4 !== segments.length) return null;
  if (resource === "items") return { kind: "items" };
  if (resource === "quotes") return { kind: "quotes" };
  if (resource === "purchases") return { kind: "purchases" };
  return null;
}
