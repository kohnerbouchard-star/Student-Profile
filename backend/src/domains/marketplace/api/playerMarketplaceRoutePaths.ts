import {
  MARKETPLACE_LISTING_KEY_PATTERN,
  MARKETPLACE_ORDER_KEY_PATTERN,
} from "../contracts/playerMarketplaceContracts.ts";

export type PlayerMarketplaceRoute =
  | { readonly kind: "collection" }
  | { readonly kind: "activate"; readonly listingKey: string }
  | { readonly kind: "purchase"; readonly listingKey: string }
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
  const marker = "/players/me/marketplace";
  const index = pathname.indexOf(marker);
  if (index < 0) return null;
  const path = pathname.slice(index + marker.length) || "/";
  if (path === "/" || path === "/listings") return { kind: "collection" };

  const listingAction = path.match(
    /^\/listings\/([^/]+)\/(activate|purchase|cancel)\/?$/u,
  );
  if (listingAction) {
    const listingKey = decoded(listingAction[1]);
    if (!MARKETPLACE_LISTING_KEY_PATTERN.test(listingKey)) {
      return { kind: "malformed" };
    }
    return { kind: listingAction[2] as "activate" | "purchase" | "cancel", listingKey };
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
