import { ApiRequestError } from "./errors.js";
export const BUSINESS_IPO_BACKEND_ROUTE_KEYS = Object.freeze(["businessIpos", "businessIpoPropose", "businessIpoVote", "businessIpoSubscribe"]);
export const hasBusinessIpoBackendRoute = (key) => BUSINESS_IPO_BACKEND_ROUTE_KEYS.includes(key);
function invalid(endpointKey) { throw new ApiRequestError("Check the offering terms and try again.", { code: "INVALID_BUSINESS_IPO_REQUEST", endpointKey }); }
export function ipoWhole(value) { return typeof value === "string" && /^[1-9][0-9]{0,6}$/u.test(value) && BigInt(value) <= 1000000n; }
export function ipoPrice(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/u.test(value)) return false;
  const [whole, fraction = ""] = value.split("."); const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents > 0n && cents <= 100000000n;
}
export function ipoTotal(price, shares) {
  if (!ipoPrice(price) || !ipoWhole(shares)) return null;
  const [whole, fraction = ""] = price.split("."); const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * BigInt(shares);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function resolveBusinessIpoBackendRequest({ endpointKey, params = {}, payload = {} }) {
  if (!hasBusinessIpoBackendRoute(endpointKey)) return null;
  const base = "/players/me/business/ipos";
  if (endpointKey === "businessIpos") return { method: "GET", path: base };
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u.test(payload.idempotencyKey || "")) invalid(endpointKey);
  const body = { idempotencyKey: payload.idempotencyKey };
  if (endpointKey === "businessIpoPropose") {
    if (!ipoPrice(payload.unitPrice) || !ipoWhole(payload.offeredShares)) invalid(endpointKey);
    return { method: "POST", path: `${base}/proposals`, payload: { ...body, unitPrice: payload.unitPrice, offeredShares: payload.offeredShares } };
  }
  const ipoKey = params.ipoKey || payload.ipoKey;
  if (!/^bgp_[0-9a-f]{32}$/u.test(ipoKey || "")) invalid(endpointKey);
  if (endpointKey === "businessIpoVote") {
    if (!["approve", "reject"].includes(payload.decision)) invalid(endpointKey);
    return { method: "POST", path: `${base}/${ipoKey}/votes`, payload: { ...body, decision: payload.decision } };
  }
  if (!ipoWhole(payload.shares)) invalid(endpointKey);
  return { method: "POST", path: `${base}/${ipoKey}/subscriptions`, payload: { ...body, shares: payload.shares } };
}
