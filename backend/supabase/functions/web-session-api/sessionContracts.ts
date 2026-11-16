import {
  constantTimeTextEqual,
  createWebAdminSessionPayload,
  openWebAdminSession,
  parseCookieHeader,
  randomWebAdminCsrfToken,
  readWebAdminSessionKey,
  sealWebAdminSession,
  WEB_ADMIN_SESSION_ABSOLUTE_SECONDS,
  WEB_ADMIN_SESSION_COOKIE,
  WEB_ADMIN_SESSION_LOCAL_COOKIE,
  type WebAdminSessionPayload,
} from "../../../src/security/webAdminSession.ts";


export const MAX_BODY_BYTES = 1_048_576;

export const MAX_MFA_BODY_BYTES = 8_192;

export const MAX_PROXY_PATH_BYTES = 2_048;

export const CSRF_HEADER = "x-econovaria-csrf-token";

export const GAME_HEADER = "x-econovaria-game-id";

export const DEVICE_HEADER = "x-econovaria-device-id";

export const INTERNAL_TRUSTED_IP_HEADER = "x-real-ip" as const;

export const FORWARDED_REQUEST_HEADERS = new Map([
  ["content-type", "Content-Type"],
  ["idempotency-key", "Idempotency-Key"],
  ["x-request-id", "X-Request-Id"],
]);


export interface StaffLoginBody {
  readonly ok: true;
  readonly session: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly expiresAt: string | null;
    readonly assuranceLevel: string;
    readonly mfaRequired: boolean;
  };
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly role: "game_admin";
    readonly permissionVersion: number;
    readonly securityVersion: number;
  };
}


export interface StaffBootstrapBody {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly email: string | null;
    readonly displayName: string;
  };
  readonly activeGameSessions: readonly Record<string, unknown>[];
}


export interface RefreshBody {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly expires_at?: number;
}


export interface StaffMfaVerifyBody {
  readonly ok?: unknown;
  readonly session?: {
    readonly accessToken?: unknown;
    readonly refreshToken?: unknown;
    readonly assuranceLevel?: unknown;
    readonly expiresAt?: unknown;
  };
}


export interface CurrentSession {
  readonly ok: true;
  readonly payload: WebAdminSessionPayload;
  readonly refreshed: boolean;
}


export interface TrustedClientIp {
  readonly header: typeof INTERNAL_TRUSTED_IP_HEADER;
  readonly address: string;
}


export function readAdminServiceRoleKey(): string {
  try {
    return String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  } catch {
    return "";
  }
}
