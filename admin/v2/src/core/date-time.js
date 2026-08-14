export const ADMIN_DEFAULT_TIME_ZONE = "Asia/Seoul";

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function validTimeZone(value) {
  const candidate = String(value || "").trim() || ADMIN_DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return ADMIN_DEFAULT_TIME_ZONE;
  }
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function zoneOffsetMilliseconds(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const wallTimeAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wallTimeAsUtc - date.getTime();
}

export function formatAdminDateTime(value, {
  timeZone = ADMIN_DEFAULT_TIME_ZONE,
  fallback = "Not available",
  includeTimeZone = true,
  seconds = false,
} = {}) {
  const date = validDate(value);
  if (!date) return fallback;
  const zone = validTimeZone(timeZone);
  const formatted = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  }).format(date);
  return includeTimeZone ? `${formatted} · ${zone}` : formatted;
}

export function formatAdminRelativeTime(value, { now = Date.now() } = {}) {
  const date = validDate(value);
  if (!date) return "";
  const deltaSeconds = Math.round((date.getTime() - Number(now)) / 1000);
  const absolute = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 60) return formatter.format(deltaSeconds, "second");
  const minutes = Math.round(deltaSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function toAdminDateTimeLocalValue(value, { timeZone = ADMIN_DEFAULT_TIME_ZONE } = {}) {
  const date = validDate(value);
  if (!date) return "";
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function fromAdminDateTimeLocalValue(value, { timeZone = ADMIN_DEFAULT_TIME_ZONE } = {}) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return "";
  const [, year, month, day, hour, minute, second = "00"] = match;
  const wallUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (!Number.isFinite(wallUtc)) return "";
  const zone = validTimeZone(timeZone);
  let candidate = new Date(wallUtc);
  let offset = zoneOffsetMilliseconds(candidate, zone);
  candidate = new Date(wallUtc - offset);
  const correctedOffset = zoneOffsetMilliseconds(candidate, zone);
  if (correctedOffset !== offset) candidate = new Date(wallUtc - correctedOffset);

  const check = toAdminDateTimeLocalValue(candidate, { timeZone: zone });
  if (check !== `${year}-${month}-${day}T${hour}:${minute}`) return "";
  return candidate.toISOString();
}
