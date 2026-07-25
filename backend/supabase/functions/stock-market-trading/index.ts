import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  handleStockMarketTradingRequest,
} from "../../../src/domains/stocks/api/stockMarketTradingHttpHandler.ts";
import { requirePublishableRequest } from "../_shared/econovariaAuth.ts";

const createSupabaseClient = createClient as unknown as (
  url: string,
  key: string,
  options: unknown,
) => EdgeSupabaseClient;

Deno.serve(async (request) => {
  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;
  return handleStockMarketTradingRequest(request, { createServiceClient });
});

function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-client-info": "econovaria-stock-market-trading-v1",
      },
    },
  }) as EdgeSupabaseClient;
}
