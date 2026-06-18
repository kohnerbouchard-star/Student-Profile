export interface StaffStoreCatalogRoute {
  readonly kind: "items" | "item";
  readonly gameSessionId: string;
  readonly itemId?: string;
}

export function readStaffStoreCatalogRoutePath(
  pathname: string,
): StaffStoreCatalogRoute | null {
  const itemsMatch = pathname.match(/\/games\/([^/]+)\/store\/items\/?$/);

  if (itemsMatch?.[1]) {
    return {
      kind: "items",
      gameSessionId: decodeURIComponent(itemsMatch[1]),
    };
  }

  const itemMatch = pathname.match(/\/games\/([^/]+)\/store\/items\/([^/]+)\/?$/);

  if (itemMatch?.[1] && itemMatch[2]) {
    return {
      kind: "item",
      gameSessionId: decodeURIComponent(itemMatch[1]),
      itemId: decodeURIComponent(itemMatch[2]),
    };
  }

  return null;
}
