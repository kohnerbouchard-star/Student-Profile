export const MAX_BODY_BYTES = 1_048_576;

export const MAX_LOGIN_BODY_BYTES = 4_096;

export const MAX_PROXY_PATH_BYTES = 2_048;

export const CSRF_HEADER = "x-econovaria-csrf-token";

export const DEVICE_HEADER = "x-econovaria-device-id";

export const GAME_HEADER = "x-econovaria-game-id";

export const TRUSTED_IP_HEADER = "x-real-ip";

export const FORWARDED_REQUEST_HEADERS = new Map([
  ["content-type", "Content-Type"],
  ["x-idempotency-key", "X-Idempotency-Key"],
  ["idempotency-key", "Idempotency-Key"],
  ["x-request-id", "X-Request-Id"],
  [GAME_HEADER, "X-Econovaria-Game-Id"],
]);


export interface PlayerLoginBody {
  readonly ok?: unknown;
  readonly gameSession?: unknown;
  readonly player?: unknown;
  readonly session?: {
    readonly token?: unknown;
    readonly status?: unknown;
    readonly expiresAt?: unknown;
  };
}


export interface PlayerBootstrapBody {
  readonly ok?: unknown;
  readonly gameSession?: unknown;
  readonly player?: unknown;
  readonly session?: {
    readonly status?: unknown;
    readonly expiresAt?: unknown;
  };
  readonly balances?: unknown;
  readonly attendance?: unknown;
  readonly availableActions?: unknown;
}
