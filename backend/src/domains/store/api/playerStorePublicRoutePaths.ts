import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

export type PlayerStorePublicRoute =
  | { readonly kind: "items" }
  | { readonly kind: "quotes" }
  | { readonly kind: "purchases" }
  | { readonly kind: "offerQuotes" }
  | { readonly kind: "offerPurchases" }
  | { readonly kind: "offerReceipt"; readonly receiptKey: string };

export type PlayerStorePublicEndpointKey =
  | "store"
  | "storeQuote"
  | "storePurchase";

export function readPlayerStorePublicRoutePath(
  pathname: string,
): PlayerStorePublicRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (
    !segments ||
    segments[0] !== "players" ||
    segments[1] !== "me" ||
    segments[2] !== "store"
  ) {
    return null;
  }

  const resource = segments[3];
  if (segments.length === 4 && resource === "items") return { kind: "items" };
  if (segments.length === 4 && resource === "quotes") return { kind: "quotes" };
  if (segments.length === 4 && resource === "purchases") {
    return { kind: "purchases" };
  }
  if (segments.length === 4 && resource === "offer-quotes") {
    return { kind: "offerQuotes" };
  }
  if (segments.length === 4 && resource === "offer-purchases") {
    return { kind: "offerPurchases" };
  }
  if (segments.length !== 5 || segments[3] !== "receipts") return null;

  const receiptKey = segments[4] ?? "";
  return /^spr_[0-9a-f]{32}$/u.test(receiptKey)
    ? { kind: "offerReceipt", receiptKey }
    : null;
}

export function playerStoreRouteRateLimitKey(
  route: PlayerStorePublicRoute,
): PlayerStorePublicEndpointKey {
  if (route.kind === "items") return "store";
  if (route.kind === "quotes" || route.kind === "offerQuotes") {
    return "storeQuote";
  }
  return "storePurchase";
}
