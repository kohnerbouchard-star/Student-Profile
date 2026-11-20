import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  json,
  environmentValue,
  unauthorized,
  normalizeClaimedJob,
} from "./emailWorkerValidation.ts";
import {
  schedulerRequestIsAuthorized,
  readWorkerRuntime,
} from "./emailWorkerAuthorization.ts";
import {
  CLAIM_BATCH_SIZE,
  CLAIM_LEASE_SECONDS,
  type ClaimedEmailJob,
  DELIVERY_CONCURRENCY,
} from "./emailWorkerContracts.ts";
import {
  processClaimedJob,
} from "./emailDelivery.ts";


Deno.serve(handleLicenseEmailWorkerRequest);


export async function handleLicenseEmailWorkerRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST." },
    }, { Allow: "POST" });
  }

  const supabaseUrl = environmentValue("SUPABASE_URL");
  const serviceRoleKey = environmentValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, {
      ok: false,
      error: {
        code: "license_email_worker_base_config_missing",
        message: "Required worker database configuration is missing.",
      },
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        "x-client-info": "econovaria-license-email-worker-v1",
      },
    },
  });

  if (!(await schedulerRequestIsAuthorized(client, request))) {
    return unauthorized();
  }

  const runtime = readWorkerRuntime();
  if (!runtime) {
    return json(503, {
      ok: false,
      error: {
        code: "license_email_worker_delivery_config_missing",
        message: "License email delivery configuration is incomplete.",
      },
    }, { "Retry-After": "60" });
  }

  const claim = await client.rpc(
    "claim_license_email_jobs_v1",
    {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    },
  );
  if (claim.error || !Array.isArray(claim.data)) {
    console.error("license_email_claim_failed");
    return json(500, {
      ok: false,
      error: {
        code: "license_email_queue_claim_failed",
        message: "Could not claim license email work.",
      },
    });
  }

  const jobs = claim.data
    .map(normalizeClaimedJob)
    .filter((job): job is ClaimedEmailJob => job !== null);

  let delivered = 0;
  let retryScheduled = 0;
  let deadLettered = 0;

  for (
    let offset = 0;
    offset < jobs.length;
    offset += DELIVERY_CONCURRENCY
  ) {
    const outcomes = await Promise.all(
      jobs
        .slice(offset, offset + DELIVERY_CONCURRENCY)
        .map((job) => processClaimedJob(client, runtime, job)),
    );
    for (const outcome of outcomes) {
      if (outcome.delivered) delivered += 1;
      else if (outcome.deadLettered) deadLettered += 1;
      else retryScheduled += 1;
    }
  }

  return json(200, {
    ok: true,
    claimed: jobs.length,
    delivered,
    retryScheduled,
    deadLettered,
  });
}
