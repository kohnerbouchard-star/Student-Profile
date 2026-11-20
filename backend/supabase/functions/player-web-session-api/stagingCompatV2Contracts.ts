export const MAX_BODY_BYTES = 1_048_576;

export const MAX_LOGIN_BODY_BYTES = 4_096;

export const MAX_PROXY_PATH_BYTES = 2_048;

export const MAX_COOKIE_BYTES = 4_096;

export const MAX_SESSION_SECONDS = 4 * 60 * 60;

export const SESSION_CONTEXT = "econovaria-player-web-session-v1";

export const COOKIE_LOCAL = "econovaria_player_session";

export const COOKIE_HOST = "__Host-econovaria_player_session";

export const CSRF_HEADER = "x-econovaria-csrf-token";

export const encoder = new TextEncoder();

export const decoder = new TextDecoder("utf-8", { fatal: true });


export interface SafePlayer {
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly playerIdentifier: string;
  readonly status: string;
}


export interface SafeGame {
  readonly name: string;
  readonly status: string;
}


export interface SessionPayload {
  readonly schemaVersion: "econovaria-player-web-session-v1";
  readonly sessionToken: string;
  readonly sessionExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly issuedAt: number;
  readonly csrfToken: string;
  readonly player: SafePlayer;
  readonly gameSession: SafeGame;
}


export type JsonObject = Record<string, unknown>;
