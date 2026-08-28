import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import {
  MARKETPLACE_LISTING_KEY_PATTERN,
  MARKETPLACE_ORDER_KEY_PATTERN,
  MARKETPLACE_RESERVATION_KEY_PATTERN,
} from "../contracts/playerMarketplaceContracts.ts";

export type PlayerMarketplaceRoute =
  | { readonly kind: "collection" }
  | { readonly kind: "activate"; readonly listingKey: string }
  | {
    readonly kind: "purchase";
    readonly action: "retired" | "quote";
    readonly listingKey: string;
  }
  | {
    readonly kind: "purchase";
    readonly action: "settlement";
    readonly reservationKey: string;
  }
  | { readonly kind: "cancel"; readonly listingKey: string }
  | { readonly kind: "dispute"; readonly orderKey: string }
  | { readonly kind: "malformed" };

function decoded(value: string): string {
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return "";
  }
}

export function readPlayerMarketplaceRoutePath(
  pathname: string,
): PlayerMarketplaceRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (
    !segments ||
    segments[0] !== "players" ||
    segments[1] !== "me" ||
    segments[2] !== "marketplace"
  ) {
    return null;
  }

  const path = `/${segments.slice(3).join("/")}`;
  if (path === "/" || path === "/listings") return { kind: "collection" };

  const listingAction = path.match(
    /^\/listings\/([^/]+)\/(activate|purchase|cancel|quotes)\/?$/u,
  );
  if (listingAction) {
    const listingKey = decoded(listingAction[1]);
    if (!MARKETPLACE_LISTING_KEY_PATTERN.test(listingKey)) {
      return { kind: "malformed" };
    }
    const action = listingAction[2];
    if (action === "quotes") {
      return { kind: "purchase", action: "quote", listingKey };
    }
    if (action === "purchase") {
      return { kind: "purchase", action: "retired", listingKey };
    }
    return {
      kind: action as "activate" | "cancel",
      listingKey,
    };
  }

  const settlement = path.match(
    /^\/reservations\/([^/]+)\/settlements\/?$/u,
  );
  if (settlement) {
    const reservationKey = decoded(settlement[1]);
    return MARKETPLACE_RESERVATION_KEY_PATTERN.test(reservationKey)
      ? { kind: "purchase", action: "settlement", reservationKey }
      : { kind: "malformed" };
  }

  const dispute = path.match(/^\/orders\/([^/]+)\/disputes\/?$/u);
  if (dispute) {
    const orderKey = decoded(dispute[1]);
    return MARKETPLACE_ORDER_KEY_PATTERN.test(orderKey)
      ? { kind: "dispute", orderKey }
      : { kind: "malformed" };
  }
  return { kind: "malformed" };
}
