import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  type EdgeSupabaseClient,
  resolveStaffSessionForRequest,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { jsonError } from "../../../src/platform/supabase/edgeResponse.ts";

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function valuesFromJsonDictionary(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.values(parsed)
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function configuredPublishableKeys(): string[] {
  return unique([
    environmentValue("SUPABASE_PUBLISHABLE_KEY"),
    environmentValue("PUBLISHABLE_KEY"),
    ...valuesFromJsonDictionary(environmentValue("SUPABASE_PUBLISHABLE_KEYS")),
  ]).filter((value) => value.startsWith("sb_publishable_"));
}

export function configuredSecretKey(): string {
  return unique([
    environmentValue("SUPABASE_SECRET_KEY"),
    environmentValue("SECRET_KEY"),
    ...valuesFromJsonDictionary(environmentValue("SUPABASE_SECRET_KEYS")),
    environmentValue("SUPABASE_SERVICE_ROLE_KEY"),
  ]).find(Boolean) || "";
}

export function readEdgeSupabaseEnv():
  | { readonly ok: true; readonly value: SupabaseEnv }
  | { readonly ok: false } {
  const supabaseUrl = environmentValue("SUPABASE_URL");
  const publishableKeys = configuredPublishableKeys();
  const legacyAnonKey = environmentValue("SUPABASE_ANON_KEY");
  const backendSecret = configuredSecretKey();
  const authClientKey = publishableKeys[0] || legacyAnonKey;

  if (!supabaseUrl || !authClientKey || !backendSecret) return { ok: false };

  return {
    ok: true,
    value: {
      supabaseUrl,
      supabaseAnonKey: authClientKey,
      supabaseServiceRoleKey: backendSecret,
    },
  };
}

export async function requirePublishableRequest(
  request: Request,
): Promise<Response | null> {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (/^Bearer\s+sb_publishable_/i.test(authorization)) {
    return jsonError(401, {
      code: "publishable_key_bearer_prohibited",
      message: "The publishable key must be sent only in the apikey header.",
      retryable: false,
    });
  }

  const supplied = String(request.headers.get("apikey") || "").trim();
  if (!supplied.startsWith("sb_publishable_")) {
    return jsonError(401, {
      code: "invalid_publishable_key",
      message: "The request API key is invalid.",
      retryable: false,
    });
  }

  const configured = configuredPublishableKeys();
  if (configured.length && !configured.includes(supplied)) {
    return jsonError(401, {
      code: "invalid_publishable_key",
      message: "The request API key is invalid.",
      retryable: false,
    });
  }

  return null;
}

export function createAuthClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as EdgeSupabaseClient;
}

export function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as EdgeSupabaseClient;
}

export function resolveStaffForRequest(
  request: Request,
  env: SupabaseEnv,
  options: { readonly missingMessage: string },
) {
  return resolveStaffSessionForRequest(
    request,
    env,
    { createAuthClient, createServiceClient },
    options,
  );
}
