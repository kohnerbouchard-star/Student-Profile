import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  handleStockMarketSeedCopyRequest,
} from "../../../src/domains/stocks/api/stockMarketSeedCopyHttpHandler.ts";
import { requirePublishableRequest } from "../_shared/econovariaAuth.ts";

const createSupabaseClient = createClient as unknown as (
  url: string,
  key: string,
  options: unknown,
) => EdgeSupabaseClient;

Deno.serve(async (request) => {
  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;
  return handleStockMarketSeedCopyRequest(request, { createServiceClient });
});

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
