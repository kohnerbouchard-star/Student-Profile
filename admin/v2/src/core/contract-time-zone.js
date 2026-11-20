import { formatAdminDateTime, fromAdminDateTimeLocalValue, toAdminDateTimeLocalValue } from "./date-time.js";

/** Missing or invalid game timezone must never silently become Seoul. */
export function normalizeContractTimeZone(value) {
  if (typeof value !== "string") return null;
  const timeZone = value.trim();
  if (!timeZone || timeZone.length > 80) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch (_error) {
    return null;
  }
}

export function formatContractDateTime(value, timeZone) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "—";
  const zone = normalizeContractTimeZone(timeZone);
  const text = formatAdminDateTime(date, { timeZone: zone || "UTC", includeTimeZone: true });
  return zone ? text : `${text} (game timezone unavailable)`;
}

/** Reject gaps and overlaps instead of guessing which instant a new wall time means. */
export function resolveContractLocalDateTime(value, timeZone) {
  const local = String(value || "").trim();
  if (!local) return { instant: "", problem: null };
  const zone = normalizeContractTimeZone(timeZone);
  if (!zone) return { instant: "", problem: "timezone-unavailable" };
  const instant = fromAdminDateTimeLocalValue(local, { timeZone: zone });
  if (!instant) return { instant: "", problem: "invalid" };
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  const [, year, month, day, hour, minute, second = "00"] = match;
  const wall = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const anchor = Date.parse(instant);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const offsets = new Set();
  // Collect offsets around both sides of a transition, including non-hour folds.
  for (let hours = -36; hours <= 36; hours += 1) {
    const sampled = anchor + hours * 3_600_000;
    const parts = Object.fromEntries(formatter.formatToParts(new Date(sampled)).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    offsets.add(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - sampled);
  }
  const candidates = new Set();
  for (const offset of offsets) {
    const candidate = new Date(wall - offset);
    if (toAdminDateTimeLocalValue(candidate, { timeZone: zone }) === local.slice(0, 16)) candidates.add(candidate.toISOString());
  }
  if (candidates.size > 1) return { instant: "", problem: "ambiguous" };
  return { instant, problem: null };
}
