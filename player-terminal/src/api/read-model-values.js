// Value readers shared only by terminal API read-model projections.
export function list(value) {
  return Array.isArray(value) ? value : [];
}

export function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function text(value, defaultValue = "") {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}

export function number(value, defaultValue = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function shortDate(value, defaultValue = "No deadline") {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return defaultValue;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

// Missing readings are not measured zero. Accept the same finite numeric strings
// as number(), but reject absent, blank and nonnumeric scalar values.
export function optionalNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
