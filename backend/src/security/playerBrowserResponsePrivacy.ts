import { sha256Hex } from "../platform/supabase/edgeCrypto.ts";
import { jsonError } from "../platform/supabase/edgeResponse.ts";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const JSON_CONTENT_TYPE = /(?:^|;)\s*application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i;
const PUBLIC_ID_PREFIX = "pub_";

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
  const aliases = new Map<string, string>();
  return sanitizeValue(value, aliases, 0);
}

export function unsafePlayerBrowserResponse(): Response {
  return jsonError(500, {
    code: "unsafe_player_browser_response",
    message: "Player data could not be returned safely.",
    retryable: false,
  });
}

async function sanitizeValue(
  value: unknown,
  aliases: Map<string, string>,
  depth: number,
): Promise<{ readonly value: unknown; readonly changed: boolean }> {
  if (depth > 24) return { value: null, changed: true };
  if (typeof value === "string") return sanitizeString(value, aliases);
  if (value === null || typeof value !== "object") {
    return { value, changed: false };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const output = [];
    for (const entry of value) {
      const sanitized = await sanitizeValue(entry, aliases, depth + 1);
      output.push(sanitized.value);
      changed ||= sanitized.changed;
    }
    return { value: output, changed };
  }

  let changed = false;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = await sanitizeValue(child, aliases, depth + 1);
    output[key] = sanitized.value;
    changed ||= sanitized.changed;
  }
  return { value: output, changed };
}

async function sanitizeString(
  value: string,
  aliases: Map<string, string>,
): Promise<{ readonly value: string; readonly changed: boolean }> {
  const matches = [...value.matchAll(UUID_PATTERN)].map((match) => match[0]);
  UUID_PATTERN.lastIndex = 0;
  if (matches.length === 0) return { value, changed: false };

  let output = value;
  for (const rawUuid of new Set(matches)) {
    const normalized = rawUuid.toLowerCase();
    let alias = aliases.get(normalized);
    if (!alias) {
      const digest = await sha256Hex(`player-browser-public-id:v1:${normalized}`);
      alias = `${PUBLIC_ID_PREFIX}${digest.slice(0, 24)}`;
      aliases.set(normalized, alias);
    }
    output = output.replaceAll(new RegExp(escapeRegExp(rawUuid), "gi"), alias);
  }
  return { value: output, changed: true };
}

function isJsonResponse(response: Response): boolean {
  return JSON_CONTENT_TYPE.test(response.headers.get("content-type") ?? "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
