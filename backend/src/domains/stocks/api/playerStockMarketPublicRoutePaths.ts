export type PlayerStockMarketPublicRoute =
  | { readonly kind: "portfolio" }
  | { readonly kind: "orders" }
  | { readonly kind: "malformed" };

const PORTFOLIO_PATH = "/players/me/stocks/portfolio";
const ORDERS_PATH = "/players/me/stocks/orders";

export function readPlayerStockMarketPublicRoutePath(
  pathname: string,
): PlayerStockMarketPublicRoute | null {
  const normalized = normalizePath(pathname);

  if (normalized === PORTFOLIO_PATH) {
    return { kind: "portfolio" };
  }

  if (normalized === ORDERS_PATH) {
    return { kind: "orders" };
  }

  if (
    normalized.startsWith(`${PORTFOLIO_PATH}/`) ||
    normalized.startsWith(`${ORDERS_PATH}/`)
  ) {
    return { kind: "malformed" };
  }

  return null;
}

function normalizePath(pathname: string): string {
  const text = String(pathname || "").trim();
  if (!text) return "";
  const queryIndex = text.indexOf("?");
  const withoutQuery = queryIndex >= 0 ? text.slice(0, queryIndex) : text;
  return withoutQuery.length > 1 && withoutQuery.endsWith("/")
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}
