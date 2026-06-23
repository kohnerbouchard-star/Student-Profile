import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  handleStockMarketRunnerRequest,
} from "../../../src/domains/stocks/api/stockMarketRunnerHttpHandler.ts";

Deno.serve((request) =>
  handleStockMarketRunnerRequest(request, {
    createServiceClient,
  })
);

function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-client-info": "econovaria-stock-market-runner-v1",
      },
    },
  }) as EdgeSupabaseClient;
}
