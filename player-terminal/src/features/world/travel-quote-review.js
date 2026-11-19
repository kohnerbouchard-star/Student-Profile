// Conservative browser review only. The server owns expiry, prices and execution.
const locationId = value => typeof value === "string" && /^loc_[a-z0-9_]+$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function reviewTravelQuote(quote, model, now = Date.now()) {
  let valid = false;
  const fail = message => ({ valid, usable: false, message: `${message} Get a new travel quote before confirming.` });
  if (!quote || typeof quote !== "object" || !/^trq_[0-9a-f]{32}$/.test(quote.publicQuoteId || "") ||
      !locationId(quote.fromLocationId) || !locationId(quote.toLocationId) ||
      typeof quote.currencyCode !== "string" || !/^[A-Z]{3}$/.test(quote.currencyCode) ||
      !integer(quote.totalCostMinor) || !integer(quote.totalDurationMinutes) || quote.totalDurationMinutes === 0 ||
      !integer(quote.routeStateRevision) || !Array.isArray(quote.legs) || !quote.legs.length ||
      quote.legs.some(leg => !leg || !/^rte_[a-z0-9_]+$/.test(leg.publicRouteId || "") ||
        !locationId(leg.fromLocationId) || !locationId(leg.toLocationId) ||
        !["land", "sea", "air", "meridian"].includes(leg.mode) || !integer(leg.costMinor) ||
        !integer(leg.durationMinutes) || !integer(leg.routeRevision))) return fail("The quote is incomplete or unavailable.");
  if (quote.legs[0].fromLocationId !== quote.fromLocationId || quote.legs.at(-1).toLocationId !== quote.toLocationId ||
      quote.legs.some((leg, index) => index > 0 && quote.legs[index - 1].toLocationId !== leg.fromLocationId)) return fail("The quoted route is inconsistent.");
  const expires = typeof quote.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(quote.expiresAt) ? Date.parse(quote.expiresAt) : NaN;
  const day = typeof quote.expiresAt === "string" ? quote.expiresAt.slice(0, 10) : "";
  const calendar = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(expires) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return fail("The quote expiry is unavailable.");
  valid = true;
  if (quote.status !== "created") return fail("This quote is no longer available for confirmation.");
  if (expires <= now) return fail("This quote has expired according to this device's clock.");
  if (model?.travel?.state?.status !== "available" || model.travel.state.currentLocationId !== quote.fromLocationId) return fail("Your loaded travel state no longer matches this quote.");
  const locations = Array.isArray(model?.world?.locations) ? model.world.locations : [];
  const routes = Array.isArray(model?.world?.routes) ? model.world.routes : [];
  if ([quote.fromLocationId, ...quote.legs.map(leg => leg.toLocationId)].some(id => locations.filter(row => row?.publicLocationId === id).length !== 1 || locations.find(row => row?.publicLocationId === id)?.availability === "closed")) return fail("The quoted locations are unavailable in the loaded World view.");
  if (quote.legs.some(leg => routes.filter(row => row?.publicRouteId === leg.publicRouteId).length !== 1 || routes.find(row => row?.publicRouteId === leg.publicRouteId)?.status === "closed" || routes.find(row => row?.publicRouteId === leg.publicRouteId)?.revision !== leg.routeRevision)) return fail("A quoted route changed or is unavailable in the loaded World view.");
  return { valid: true, usable: true, message: "Review the quoted route and expiry. The server rechecks availability, price and eligibility when you confirm." };
}
