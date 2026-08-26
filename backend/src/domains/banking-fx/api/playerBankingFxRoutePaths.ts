import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerCapabilityEndpointKey } from "../../players/contracts/playerCapabilityManifestContracts.ts";
import {
  PLAYER_FX_ORDER_KEY_PATTERN,
  type PlayerBankingFxRoute,
} from "../contracts/playerBankingFxContracts.ts";

export function readPlayerBankingFxRoutePath(
  pathname: string,
): PlayerBankingFxRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (
    !segments ||
    segments[0] !== "players" ||
    segments[1] !== "me" ||
    segments[2] !== "banking" ||
    segments[3] !== "fx"
  ) {
    return null;
  }

  const tail = segments.slice(4);
  if (tail.length === 0) return { kind: "overview" };
  if (tail.length === 1 && tail[0] === "history") return { kind: "history" };
  if (tail.length === 1 && tail[0] === "orders") return { kind: "orders" };
  if (tail.length === 1 && tail[0] === "quotes") return { kind: "quote" };
  if (tail.length === 2 && tail[0] === "orders" && tail[1] === "standard") {
    return { kind: "standard" };
  }
  if (tail.length === 2 && tail[0] === "orders" && tail[1] === "instant") {
    return { kind: "instant" };
  }
  if (tail.length === 3 && tail[0] === "orders" && tail[2] === "cancel") {
    const orderKey = decodePublicKey(tail[1]);
    return PLAYER_FX_ORDER_KEY_PATTERN.test(orderKey)
      ? { kind: "cancel", orderKey }
      : { kind: "malformed" };
  }
  return { kind: "malformed" };
}

export function playerBankingFxRateLimitKey(
  route: PlayerBankingFxRoute,
  method: string,
): PlayerCapabilityEndpointKey {
  switch (route.kind) {
    case "overview":
      return "bankingFx";
    case "history":
      return "bankingFxHistory";
    case "orders":
      return "bankingFxOrders";
    case "quote":
      return "bankingFxQuote";
    case "standard":
      return "bankingFxStandard";
    case "instant":
      return "bankingFxInstant";
    case "cancel":
      return "bankingFxCancel";
    case "malformed":
      return method.toUpperCase() === "GET" ? "bankingFx" : "bankingFxStandard";
  }
}

function decodePublicKey(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}
