import { sha256Hex } from "../platform/supabase/edgeCrypto.ts";
import { jsonError } from "../platform/supabase/edgeResponse.ts";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const JSON_CONTENT_TYPE = /(?:^|;)\s*application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i;
const PUBLIC_ID_PREFIX = "pub_";
const MAX_DEPTH = 24;
const HASH_BATCH_SIZE = 32;

export async function enforcePlayerBrowserResponsePrivacy(
  response: Response,
): Promise<Response> {
  if (response.status === 204 || !isJsonResponse(response)) return response;

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }

  const sanitized = await sanitizePlayerBrowserPayload(body);
  if (!sanitized.changed) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");

  return new Response(JSON.stringify(sanitized.value), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function sanitizePlayerBrowserPayload(
  value: unknown,
): Promise<{ readonly value: unknown; readonly changed: boolean }> {
  const rawUuids = new Set<string>();
  collectUuids(value, rawUuids, 0);
  const aliases = await buildAliases(rawUuids);
  return sanitizeValue(value, aliases, 0);
}

export function unsafePlayerBrowserResponse(): Response {
  return jsonError(500, {
    code: "unsafe_player_browser_response",
    message: "Player data could not be returned safely.",
    retryable: false,
  });
}

function collectUuids(
  value: unknown,
  output: Set<string>,
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;
  if (typeof value === "string") {
    for (const rawUuid of uuidMatches(value)) output.add(rawUuid.toLowerCase());
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectUuids(entry, output, depth + 1);
    return;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    collectUuids(child, output, depth + 1);
  }
}

async function buildAliases(
  rawUuids: ReadonlySet<string>,
): Promise<ReadonlyMap<string, string>> {
  const aliases = new Map<string, string>();
  const values = [...rawUuids];
  for (let index = 0; index < values.length; index += HASH_BATCH_SIZE) {
    const batch = values.slice(index, index + HASH_BATCH_SIZE);
    const entries = await Promise.all(batch.map(async (normalized) => {
      const digest = await sha256Hex(`player-browser-public-id:v1:${normalized}`);
      return [normalized, `${PUBLIC_ID_PREFIX}${digest.slice(0, 24)}`] as const;
    }));
    for (const [normalized, alias] of entries) aliases.set(normalized, alias);
  }
  return aliases;
}

function sanitizeValue(
  value: unknown,
  aliases: ReadonlyMap<string, string>,
  depth: number,
): { readonly value: unknown; readonly changed: boolean } {
  if (depth > MAX_DEPTH) return { value: null, changed: true };
  if (typeof value === "string") return sanitizeString(value, aliases);
  if (value === null || typeof value !== "object") {
    return { value, changed: false };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const output = [];
    for (const entry of value) {
      const sanitized = sanitizeValue(entry, aliases, depth + 1);
      output.push(sanitized.value);
      changed ||= sanitized.changed;
    }
    return { value: output, changed };
  }

  let changed = false;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = sanitizeValue(child, aliases, depth + 1);
    output[key] = sanitized.value;
    changed ||= sanitized.changed;
  }
  return { value: output, changed };
}

function sanitizeString(
  value: string,
  aliases: ReadonlyMap<string, string>,
): { readonly value: string; readonly changed: boolean } {
  let changed = false;
  UUID_PATTERN.lastIndex = 0;
  const output = value.replace(UUID_PATTERN, (rawUuid) => {
    const alias = aliases.get(rawUuid.toLowerCase());
    if (!alias) return rawUuid;
    changed = true;
    return alias;
  });
  UUID_PATTERN.lastIndex = 0;
  return { value: output, changed };
}

function uuidMatches(value: string): readonly string[] {
  UUID_PATTERN.lastIndex = 0;
  const matches = [...value.matchAll(UUID_PATTERN)].map((match) => match[0]);
  UUID_PATTERN.lastIndex = 0;
  return matches;
}

function isJsonResponse(response: Response): boolean {
  return JSON_CONTENT_TYPE.test(response.headers.get("content-type") ?? "");
}
