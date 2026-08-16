import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  authorizeInternalRunnerRequest,
} from "../../../src/security/internalRunnerAuth.ts";
import {
  handleStockMarketRunnerRequest,
} from "../../../src/domains/stocks/api/stockMarketRunnerHttpHandler.ts";
import {
  RuntimeCursorStockMarketNewsRepository,
  RuntimeCursorStockMarketRunnerRepository,
} from "../../../src/domains/stocks/infrastructure/runtimeCursorStockMarketRepositories.ts";
import { requirePublishableRequest } from "../_shared/econovariaAuth.ts";
import { createStorylineRunnerAfterTick } from "./storylineRunnerAfterTick.ts";

const createSupabaseClient = createClient as unknown as (
  url: string,
  key: string,
  options: unknown,
) => EdgeSupabaseClient;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(204, null);

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;

  const envResult = readSupabaseEnv();
  if (!envResult.ok) {
    return jsonError(500, {
      code: "missing_edge_runtime_config",
      message: "Supabase Edge runtime configuration is missing.",
      retryable: false,
    });
  }

  const replayClient = createServiceClient(envResult.value);
  const authorization = await authorizeInternalRunnerRequest(request, {
    runnerName: "stock-market-runner",
    internalSecretHeader: "x-stock-market-runner-secret",
    dependencies: {
      readSecret: () => Deno.env.get("STOCK_MARKET_RUNNER_SECRET"),
      claimNonce: async (claim) => {
        const { data, error } = await replayClient.rpc<boolean>(
          "claim_internal_runner_nonce_v2",
          {
            p_runner_name: claim.runnerName,
            p_nonce_hash: claim.nonceHash,
            p_timestamp_seconds: claim.timestampSeconds,
            p_expires_at: claim.expiresAt,
          },
        );
        if (error) throw new Error("INTERNAL_RUNNER_NONCE_CLAIM_FAILED");
        return data === true;
      },
    },
  });
  if (!authorization.ok) return authorization.response;

  return handleStockMarketRunnerRequest(authorization.request, {
    createServiceClient,
    createRepository: (client) =>
      new RuntimeCursorStockMarketRunnerRepository(client as any),
    createNewsRepository: (client) =>
      new RuntimeCursorStockMarketNewsRepository(client as any),
    createStorylineRunnerAfterTick,
  });
});

function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-client-info": "econovaria-stock-market-runner-v2",
      },
    },
  }) as EdgeSupabaseClient;
}
