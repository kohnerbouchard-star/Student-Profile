export type DbRow = Record<string, any>;

export type DbService = any;


export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export const RECENT_WINDOW_MS = 60 * 60 * 1000;

export const DEFAULT_HISTORY_PAGE_SIZE = 50;

export const MAX_HISTORY_PAGE_SIZE = 200;


export function pushByKey(
  map: Map<string, DbRow[]>,
  key: unknown,
  value: DbRow,
): void {
  const normalizedKey = String(key || "");
  if (!normalizedKey) return;
  const values = map.get(normalizedKey) || [];
  values.push(value);
  map.set(normalizedKey, values);
}


export function newestByKey(
  rows: DbRow[],
  keyName: string,
  timestampName: string,
): Map<string, DbRow> {
  const result = new Map<string, DbRow>();
  for (const row of rows || []) {
    const key = String(row?.[keyName] || "");
    if (!key) continue;
    const current = result.get(key);
    if (
      !current ||
      Date.parse(row?.[timestampName] || "") >
        Date.parse(current?.[timestampName] || "")
    ) {
      result.set(key, row);
    }
  }
  return result;
}


export function presenceForSession(session: DbRow | null | undefined, nowMs: number): any {
  if (!session || session.status !== "active") {
    return {
      sessionStatus: "offline",
      online: false,
      lastActiveAt: session?.updated_at || null,
    };
  }

  const expiresAtMs = Date.parse(session.expires_at || "");
  const lastActiveMs = Date.parse(session.updated_at || session.created_at || "");
  if (
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= nowMs ||
    !Number.isFinite(lastActiveMs)
  ) {
    return {
      sessionStatus: "offline",
      online: false,
      lastActiveAt: session.updated_at || null,
    };
  }

  const ageMs = Math.max(0, nowMs - lastActiveMs);
  if (ageMs <= ONLINE_WINDOW_MS) {
    return {
      sessionStatus: "online",
      online: true,
      lastActiveAt: session.updated_at || null,
    };
  }
  if (ageMs <= RECENT_WINDOW_MS) {
    return {
      sessionStatus: "recently_active",
      online: false,
      lastActiveAt: session.updated_at || null,
    };
  }
  return {
    sessionStatus: "offline",
    online: false,
    lastActiveAt: session.updated_at || null,
  };
}
