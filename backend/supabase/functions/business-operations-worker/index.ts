import {
  authorizeInternalRunnerRequest,
} from "../../../src/security/internalRunnerAuth.ts";
import {
  BUSINESS_OPERATIONS_WORKER_INTERNAL_HEADER,
  businessOperationsWorkerBrowserRequestFailure,
  handleBusinessOperationsWorkerRequest,
} from "../../../src/domains/business/api/businessOperationsWorkerHttpHandler.ts";
import {
  SupabaseBusinessOperationsRepository,
} from "../../../src/domains/business/infrastructure/supabaseBusinessOperationsRepository.ts";
import {
  createServiceRoleClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import { jsonError } from "../../../src/platform/supabase/edgeResponse.ts";

Deno.serve(async (request) => {
  const browserFailure = businessOperationsWorkerBrowserRequestFailure(request);
  if (browserFailure) return browserFailure;

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;

  const envResult = readEdgeSupabaseEnv();
  if (!envResult.ok) {
    return jsonError(500, {
      code: "missing_edge_runtime_config",
      message: "Supabase Edge runtime configuration is missing.",
      retryable: false,
    });
  }

  const serviceClient = createServiceRoleClient(
    envResult.value.supabaseUrl,
    envResult.value.supabaseServiceRoleKey,
    "econovaria-business-operations-worker-v1",
  );
  const authorization = await authorizeInternalRunnerRequest(request, {
    runnerName: "business-operations-worker",
    internalSecretHeader: BUSINESS_OPERATIONS_WORKER_INTERNAL_HEADER,
    dependencies: {
      readSecret: () => Deno.env.get("STOCK_MARKET_RUNNER_SECRET"),
      claimNonce: async (claim) => {
        const { data, error } = await serviceClient.rpc<boolean>(
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

  return handleBusinessOperationsWorkerRequest(authorization.request, {
    createRepository: () =>
      new SupabaseBusinessOperationsRepository(serviceClient),
  });
});
