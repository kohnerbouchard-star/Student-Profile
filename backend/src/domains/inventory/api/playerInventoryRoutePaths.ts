import type { PlayerInventoryRoute } from "../contracts/playerInventoryReadContracts.ts";

export function readPlayerInventoryRoutePath(
  pathname: string,
): PlayerInventoryRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const playersIndex = segments.lastIndexOf("players");

  if (
    playersIndex < 0 ||
    segments[playersIndex + 1] !== "me" ||
    segments[playersIndex + 2] !== "inventory"
  ) {
    return null;
  }

  return playersIndex + 3 === segments.length
    ? { kind: "inventory" }
    : { kind: "malformed" };
}
