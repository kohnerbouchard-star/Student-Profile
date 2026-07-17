import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  handleStockMarketPlayerReadRequest,
} from "../../../src/domains/stocks/api/stockMarketPlayerReadHttpHandler.ts";

const createSupabaseClient = createClient as unknown as (
  url: string,
  key: string,
  options: unknown,
) => EdgeSupabaseClient;

Deno.serve((request) =>
  handleStockMarketPlayerReadRequest(request, {
    createServiceClient,
  })
);

function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-client-info": "econovaria-stock-market-player-read-v1",
      },
    },
  }) as EdgeSupabaseClient;
}
