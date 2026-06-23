import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  handleStockMarketSeedCopyRequest,
} from "../../../src/domains/stocks/api/stockMarketSeedCopyHttpHandler.ts";

const createSupabaseClient = createClient as unknown as (
  url: string,
  key: string,
  options: unknown,
) => EdgeSupabaseClient;

Deno.serve((request) =>
  handleStockMarketSeedCopyRequest(request, {
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
        "x-client-info": "econovaria-stock-market-seed-copy-v1",
      },
    },
  }) as EdgeSupabaseClient;
}
