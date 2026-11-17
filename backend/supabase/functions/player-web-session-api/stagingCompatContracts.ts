export const MAX_BODY_BYTES = 1_048_576;

export const MAX_LOGIN_BODY_BYTES = 4_096;

export const MAX_PROXY_PATH_BYTES = 2_048;

export const MAX_SESSION_ENVELOPE_BYTES = 2_048;

export const MAX_SESSION_TOKEN_LENGTH = 512;

export const SESSION_ABSOLUTE_SECONDS = 4 * 60 * 60;

export const SESSION_CONTEXT = "econovaria-player-web-session-v1";

export const LOCAL_COOKIE = "econovaria_player_session";

export const HOST_COOKIE = "__Host-econovaria_player_session";

export const CSRF_HEADER = "x-econovaria-csrf-token";

export const INTERNAL_ORIGINS = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

export const FORWARDED_HEADERS = new Map([
  ["content-type", "Content-Type"],
  ["x-econovaria-device-id", "X-Econovaria-Device-Id"],
  ["x-econovaria-game-id", "X-Econovaria-Game-Id"],
  ["x-idempotency-key", "X-Idempotency-Key"],
  ["idempotency-key", "Idempotency-Key"],
  ["x-request-id", "X-Request-Id"],
]);

export const encoder = new TextEncoder();

export const decoder = new TextDecoder("utf-8", { fatal: true });


export type JsonRecord = Record<string, unknown>;


export type SessionPayload = {
  readonly schemaVersion: "econovaria-player-web-session-v1";
  readonly sessionToken: string;
  readonly sessionExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly issuedAt: number;
  readonly csrfToken: string;
  readonly player: {
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string;
    readonly status: string;
  };
  readonly gameSession: {
    readonly name: string;
    readonly status: string;
  };
};
