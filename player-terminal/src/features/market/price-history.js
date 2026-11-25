const EMPTY_OBSERVATIONS = Object.freeze([]);
export const RECENT_MARKET_OBSERVATIONS = 24;

export function normalizeMarketObservations(value) {
  if (!Array.isArray(value) || !value.length || value.length > 500) return EMPTY_OBSERVATIONS;
  const seen = new Set();
  const observations = [];
  for (const point of value) {
    if (!Number.isSafeInteger(point?.tickIndex) || point.tickIndex < 0 || seen.has(point.tickIndex)
      || !Number.isFinite(point.price) || point.price < 0 || typeof point.createdAt !== "string") {
      return EMPTY_OBSERVATIONS;
    }
    const time = Date.parse(point.createdAt);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== point.createdAt) return EMPTY_OBSERVATIONS;
    seen.add(point.tickIndex);
    observations.push(Object.freeze({ tickIndex: point.tickIndex, price: point.price, createdAt: point.createdAt }));
  }
  return Object.freeze(observations.sort((left, right) => left.tickIndex - right.tickIndex));
}

function formatUtc(iso) {
  return `${iso.replace("T", " ").replace(/(?:\.000)?Z$/, "")} UTC`;
}

export function marketHistoryChart(observations, range = "all") {
  const selected = range === "recent" ? observations.slice(-RECENT_MARKET_OBSERVATIONS) : observations;
  if (!selected.length) return null;
  const ordered = selected.map((point) => ({ ...point, time: Date.parse(point.createdAt) }))
    .sort((left, right) => left.time - right.time || left.tickIndex - right.tickIndex);
  const first = ordered[0];
  const last = ordered.at(-1);
  const timeSpan = last.time - first.time;
  const minPrice = Math.min(...ordered.map((point) => point.price));
  const maxPrice = Math.max(...ordered.map((point) => point.price));
  const priceSpan = maxPrice - minPrice;
  const points = ordered.map((point) => [
    timeSpan ? 18 + ((point.time - first.time) / timeSpan) * 684 : 360,
    priceSpan ? 242 - ((point.price - minPrice) / priceSpan) * 224 : 130,
  ]);
  const [firstX, firstY] = points[0];
  const lastX = points.at(-1)[0];
  const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const rangeText = first.time === last.time ? formatUtc(first.createdAt) : `${formatUtc(first.createdAt)} to ${formatUtc(last.createdAt)}`;
  const count = selected.length;
  return {
    count,
    coverage: `${count} recorded observation${count === 1 ? "" : "s"} · ${rangeText}`,
    line: count > 1 ? path : "",
    area: count > 1 && timeSpan ? `${path} L${lastX.toFixed(2)},242 L${firstX.toFixed(2)},242 Z` : "",
    dot: count === 1 || (!timeSpan && !priceSpan) ? { x: firstX, y: firstY } : null,
    latestPrice: last.price,
  };
}
