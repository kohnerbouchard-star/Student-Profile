import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { jsonResponse } from "../../../src/platform/supabase/edgeResponse.ts";
import {
  handleStockMarketPlayerReadRequest,
} from "../../../src/domains/stocks/api/stockMarketPlayerReadHttpHandler.ts";
import { requirePublishableRequest } from "../_shared/econovariaAuth.ts";

const createSupabaseClient = createClient as unknown as (
  url: string,
  key: string,
  options: unknown,
) => EdgeSupabaseClient;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(204, null);

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;
  return handleStockMarketPlayerReadRequest(request, { createServiceClient });
});

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
