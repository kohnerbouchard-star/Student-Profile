export function nextMarketPage(market) {
  const page = market?.pagination;
  if (page?.hasMore !== true || !Number.isInteger(page.nextOffset) || page.nextOffset < 1 || page.nextOffset > 10_000
    || !Number.isInteger(page.offset) || page.nextOffset <= page.offset
    || !Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100) return null;
  return { offset: page.nextOffset, limit: page.limit };
}

export function appendMarketPage(current, page, request) {
  if (page?.pagination?.offset !== request.offset || page.pagination.limit !== request.limit
    || !Array.isArray(page.assets)) throw new Error("Invalid market page.");
  const assets = new Map((current.assets || []).map((asset) => [asset.id, asset]));
  // Retain the existing selected asset/detail and prices: a partial directory
  // page is not a full-resource refresh or an authoritative order quotation.
  for (const asset of page.assets) if (!assets.has(asset.id)) assets.set(asset.id, asset);
  return { ...current, assets: [...assets.values()],
    sectors: ["All", ...new Set([...assets.values()].map((asset) => asset.sector).filter(Boolean))],
    pagination: { ...page.pagination } };
}
