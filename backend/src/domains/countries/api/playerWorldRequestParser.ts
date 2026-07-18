import {
  PlayerWorldReadError,
  type PlayerWorldNewsCursor,
  type PlayerWorldParsedRequest,
  type PlayerWorldRoute,
} from "../contracts/playerWorldReadContracts.ts";

const DEFAULT_NEWS_LIMIT = 25;
export const MAX_PLAYER_WORLD_NEWS_LIMIT = 50;
const COUNTRY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,31}$/;
const PUBLIC_NEWS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GAME_QUERY_FIELDS = ["gameSessionId", "game_session_id", "gameId", "game_id"] as const;
const GAME_HEADERS = ["x-econovaria-game-session-id", "x-econovaria-game-id"] as const;
const NEWS_QUERY_FIELDS = new Set(["limit", "category", "cursor"]);
const NEWS_CATEGORIES = new Set([
  "geopolitical",
  "war_conflict",
  "natural_disaster",
  "supply_chain",
  "resource_shock",
  "policy",
  "macro",
  "sector",
  "country",
  "company",
  "technology",
  "infrastructure",
  "energy",
  "agriculture",
  "finance",
]);

export function parsePlayerWorldReadRequest(
  request: Request,
  route: PlayerWorldRoute,
): PlayerWorldParsedRequest {
  const url = new URL(request.url);
  rejectClientGameSelection(url.searchParams, request.headers);

  if (route.kind === "countries") {
    rejectUnexpectedQuery(url.searchParams, new Set());
    return { kind: "countries" };
  }

  if (route.kind === "country") {
    rejectUnexpectedQuery(url.searchParams, new Set());
    return {
      kind: "country",
      countryCode: normalizeCountryCode(route.countryIdentifier),
    };
  }

  rejectUnexpectedQuery(url.searchParams, NEWS_QUERY_FIELDS);
  return {
    kind: "news",
    news: {
      limit: readLimit(url.searchParams),
      category: readCategory(url.searchParams),
      cursor: readCursor(url.searchParams),
    },
  };
}

export function encodePlayerWorldNewsCursor(cursor: PlayerWorldNewsCursor): string {
  return `v1.${cursor.createdTick}.${encodeURIComponent(cursor.publicId)}`;
}

export function decodePlayerWorldNewsCursor(value: string): PlayerWorldNewsCursor {
  const match = /^v1\.(\d+)\.(.+)$/.exec(value.trim());
  if (!match) throw invalidRequest("cursor is invalid.");

  const createdTick = Number(match[1]);
  let publicId = "";
  try {
    publicId = decodeURIComponent(match[2] ?? "");
  } catch {
    throw invalidRequest("cursor is invalid.");
  }

  if (!Number.isSafeInteger(createdTick) || createdTick < 0 || !PUBLIC_NEWS_ID_PATTERN.test(publicId)) {
    throw invalidRequest("cursor is invalid.");
  }

  return { createdTick, publicId };
}

function rejectClientGameSelection(searchParams: URLSearchParams, headers: Headers): void {
  if (GAME_QUERY_FIELDS.some((field) => searchParams.has(field)) || GAME_HEADERS.some((header) => headers.has(header))) {
    throw invalidRequest("World reads derive game scope from x-player-session-token.");
  }
}

function rejectUnexpectedQuery(searchParams: URLSearchParams, allowed: ReadonlySet<string>): void {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw invalidRequest(`Unsupported query parameter: ${key}.`);
  }
}

function normalizeCountryCode(value: string): string {
  const countryCode = value.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    throw invalidRequest("countryId must be a public country code.");
  }
  return countryCode;
}

function readLimit(searchParams: URLSearchParams): number {
  const values = searchParams.getAll("limit");
  if (values.length > 1) throw invalidRequest("At most one limit is allowed.");
  if (values.length === 0) return DEFAULT_NEWS_LIMIT;

  const limit = Number(values[0]);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PLAYER_WORLD_NEWS_LIMIT) {
    throw invalidRequest(`limit must be an integer between 1 and ${MAX_PLAYER_WORLD_NEWS_LIMIT}.`);
  }
  return limit;
}

function readCategory(searchParams: URLSearchParams): string | null {
  const values = searchParams.getAll("category");
  if (values.length > 1) throw invalidRequest("At most one category is allowed.");
  if (values.length === 0) return null;

  const category = values[0]?.trim().toLowerCase() ?? "";
  if (!NEWS_CATEGORIES.has(category)) throw invalidRequest("category is not supported.");
  return category;
}

function readCursor(searchParams: URLSearchParams): PlayerWorldNewsCursor | null {
  const values = searchParams.getAll("cursor");
  if (values.length > 1) throw invalidRequest("At most one cursor is allowed.");
  if (values.length === 0) return null;
  return decodePlayerWorldNewsCursor(values[0] ?? "");
}

function invalidRequest(message: string): PlayerWorldReadError {
  return new PlayerWorldReadError(
    "invalid_player_world_request",
    message,
    400,
    false,
  );
}
