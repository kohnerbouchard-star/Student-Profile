export function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}


export function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}


export function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}


export function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}


export async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    return object(await request.json());
  } catch {
    return {};
  }
}


export function firstDefined(
  record: Record<string, any>,
  keys: readonly string[],
): any {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}


export function optionalText(
  record: Record<string, any>,
  keys: readonly string[],
): string | undefined {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null) return undefined;
  const normalized = text(value);
  return normalized || undefined;
}


export function optionalNumber(
  record: Record<string, any>,
  keys: readonly string[],
): number | undefined {
  const value = firstDefined(record, keys);
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = number(value, Number.NaN);
  return Number.isFinite(normalized) ? normalized : undefined;
}


export function optionalInteger(
  record: Record<string, any>,
  keys: readonly string[],
): number | undefined {
  const value = optionalNumber(record, keys);
  return value === undefined ? undefined : Math.max(0, Math.trunc(value));
}


export function compactObject(record: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}


export function slug(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
