import type { PlayerMessagingRoute } from "./playerMessagingRoutePaths.ts";
import type { InboxCursor } from "./playerMessagingResponseProjection.ts";
import {
  hasUnsafeText,
  parseInboxCursor,
  isRecord,
  messagingError,
} from "./playerMessagingResponseProjection.ts";

interface InboxLimits { readonly threadLimit: number; readonly messageLimit: number }

export type ReadRoute = Extract<PlayerMessagingRoute, { readonly kind: "list" | "search" | "thread" }>;

export function parseReadRequest(request: Request, route: ReadRoute):
  | {
    readonly ok: true;
    readonly limits: InboxLimits;
    readonly query: string;
    readonly cursor: InboxCursor | null;
  }
  | { readonly ok: false; readonly response: Response } {
  const url = new URL(request.url);
  if (route.kind === "thread") {
    const allowed = new Set(["messageLimit"]);
    for (const key of searchParameterKeys(url.searchParams)) {
      if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
        return invalidResult(`Unsupported or repeated query parameter: ${key}.`);
      }
    }
    const messageLimit = boundedInteger(url.searchParams.get("messageLimit"), 100, 1, 100);
    return messageLimit === null
      ? invalidResult("Message pagination is invalid.")
      : { ok: true, limits: { threadLimit: 1, messageLimit }, query: "", cursor: null };
  }
  const allowed = new Set(route.kind === "search"
    ? ["q", "threadLimit", "messageLimit", "cursor"]
    : ["threadLimit", "messageLimit", "cursor"]);
  for (const key of searchParameterKeys(url.searchParams)) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      return invalidResult(`Unsupported or repeated query parameter: ${key}.`);
    }
  }
  const threadLimit = boundedInteger(url.searchParams.get("threadLimit"), 25, 1, 50);
  const messageLimit = boundedInteger(url.searchParams.get("messageLimit"), 50, 1, 100);
  if (threadLimit === null || messageLimit === null) return invalidResult("Message pagination is invalid.");
  const query = route.kind === "search" ? String(url.searchParams.get("q") ?? "").trim() : "";
  if (route.kind === "search" && (!query || query.length > 100 || hasUnsafeText(query))) {
    return invalidResult("Message search requires 1 to 100 safe text characters.");
  }
  const cursor = parseInboxCursor(url.searchParams.get("cursor"));
  if (cursor === undefined) return invalidResult("Message cursor is invalid.");
  return { ok: true, limits: { threadLimit, messageLimit }, query, cursor };
}

function searchParameterKeys(parameters: URLSearchParams): readonly string[] {
  const keys = new Set<string>();
  parameters.forEach((_value, key) => keys.add(key));
  return [...keys];
}

export async function parseSendCommand(request: Request): Promise<
  | { readonly ok: true; readonly body: string; readonly idempotencyKey: string }
  | { readonly ok: false; readonly response: Response }
> {
  if (new URL(request.url).searchParams.size) return invalidResult("Message send does not accept query parameters.");
  const value = await request.clone().json().catch(() => null);
  if (!isRecord(value) || Object.keys(value).some((key) => !["body", "idempotencyKey"].includes(key))) {
    return invalidResult("Provide a valid message JSON object.");
  }
  const body = typeof value.body === "string" ? value.body.trim() : "";
  if (!body || body.length > 1000 || body.split(/\r?\n/).length > 50 || hasUnsafeText(body) || countHttpLinks(body) > 10) {
    return invalidResult("Message body must contain 1 to 1000 safe text characters, at most 50 lines, and no more than 10 links.");
  }
  const bodyKey = typeof value.idempotencyKey === "string" ? value.idempotencyKey.trim() : "";
  const headerKey = request.headers.get("idempotency-key")?.trim() ??
    request.headers.get("x-idempotency-key")?.trim() ??
    request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) return invalidResult("Request and header idempotency keys must match.");
  const idempotencyKey = bodyKey || headerKey;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)) return invalidResult("A safe idempotency key is required.");
  return { ok: true, body, idempotencyKey };
}

export function invalidResult(message: string) {
  return { ok: false as const, response: messagingError(400, "invalid_player_message_request", message) };
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number): number | null {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function countHttpLinks(value: string): number {
  return value.match(/https?:\/\/[^\s<>{}\[\]"']+/gi)?.length ?? 0;
}
