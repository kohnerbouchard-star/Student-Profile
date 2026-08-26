import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

export function createServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string,
  clientInfo: string,
) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": clientInfo } },
  });
}
