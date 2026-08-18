import {
  createSupabaseCampaignProgramProvider,
  createVersionedCampaignSchedulePolicy,
  type CampaignProgramSupabaseClient,
} from "../../../src/domains/campaign/infrastructure/supabaseCampaignProgramProvider.ts";
import {
  createSupabaseCampaignEffectPorts,
  type CampaignEffectSupabaseClient,
} from "../../../src/domains/campaign/infrastructure/supabaseCampaignEffectPorts.ts";
import {
  createSupabaseCampaignEffectWorkerRepository,
  createSupabaseCampaignSchedulerRepository,
  type CampaignRuntimeSupabaseClient,
} from "../../../src/domains/campaign/infrastructure/supabaseCampaignRuntimeRepository.ts";
import { runCampaignEffectWorker } from "../../../src/domains/campaign/services/campaignEffectWorker.ts";
import { runCampaignScheduler } from "../../../src/domains/campaign/services/campaignScheduler.ts";
import {
  campaignRuntimeClient,
  verifySchedulerToken,
} from "./infrastructure/client.ts";

const MAX_CAMPAIGNS_PER_RUN = 25;
const MAX_EFFECTS_PER_RUN = 100;

type AnyRecord = Record<string, unknown>;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }

  const token = request.headers.get("x-econovaria-scheduler-token")?.trim() ?? "";
  if (!(await verifySchedulerToken(token))) {
    return json({ code: "campaign_scheduler_unauthorized" }, 401);
  }

  const now = new Date().toISOString();
  const runId =
    `campaign-run:${now.replace(/[^0-9]/g, "")}:${crypto.randomUUID().replaceAll("-", "")}`;

  try {
    const runtimeClient = campaignRuntimeClient as unknown as CampaignRuntimeSupabaseClient;
    const scheduler = await runCampaignScheduler({
      repository: createSupabaseCampaignSchedulerRepository(
        runtimeClient,
        createVersionedCampaignSchedulePolicy(),
      ),
      programs: createSupabaseCampaignProgramProvider(
        campaignRuntimeClient as unknown as CampaignProgramSupabaseClient,
      ),
      dueAt: now,
      runId,
      limit: MAX_CAMPAIGNS_PER_RUN,
    });

    const effects = await runCampaignEffectWorker({
      repository: createSupabaseCampaignEffectWorkerRepository(runtimeClient),
      ports: createSupabaseCampaignEffectPorts(
        campaignRuntimeClient as unknown as CampaignEffectSupabaseClient,
        now,
      ),
      claimedAt: now,
      limit: MAX_EFFECTS_PER_RUN,
    });

    return json({ ok: true, runId, scheduler, effects });
  } catch (error) {
    console.error("campaign-orchestrator failed", safeError(error));
    return json(
      {
        ok: false,
        code: readCode(error, "campaign_orchestrator_failed"),
      },
      500,
    );
  }
});

function readCode(error: unknown, defaultCode: string): string {
  if (
    isRecord(error) &&
    typeof error.code === "string" &&
    /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(error.code)
  ) {
    return error.code;
  }
  return defaultCode;
}

function safeError(error: unknown): AnyRecord {
  return {
    code: readCode(error, "campaign_orchestrator_failed"),
    message: error instanceof Error
      ? error.message
      : "Unknown campaign orchestrator failure.",
  };
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
