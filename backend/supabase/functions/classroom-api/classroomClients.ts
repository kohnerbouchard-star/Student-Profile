import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  resolveStaffSessionForRequest,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";


export function createAuthClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
  ) as unknown as EdgeSupabaseClient;
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
