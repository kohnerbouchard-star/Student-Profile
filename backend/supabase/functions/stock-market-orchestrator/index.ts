import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  handleStockMarketRunnerRequest,
} from "../../../src/domains/stocks/api/stockMarketRunnerHttpHandler.ts";
import {
  createStorylineRunnerAfterTick,
} from "../stock-market-runner/storylineRunnerAfterTick.ts";

const SCHEDULER_NAME = "econovaria-stock-runtime-scheduler-v1";
const SCHEDULER_HEADER = "x-econovaria-scheduler-token";
const INTERNAL_RUNNER_HEADER = "x-stock-market-runner-secret";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST." },
    });
  }

  const supabaseUrl = environmentValue("SUPABASE_URL");
  const serviceRoleKey = environmentValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, {
      ok: false,
      error: {
        code: "scheduler_runtime_config_missing",
        message: "Required scheduler runtime configuration is missing.",
      },
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { "x-client-info": "econovaria-stock-market-orchestrator-v2" },
    },
  });

  const schedulerToken = String(request.headers.get(SCHEDULER_HEADER) || "").trim();
  if (!/^[0-9a-f]{64}$/iu.test(schedulerToken)) return unauthorized();

  const schedulerTokenHash = await sha256Hex(schedulerToken.toLowerCase());
  const authorization = await client.rpc("verify_runtime_scheduler_token_v1", {
    p_scheduler_name: SCHEDULER_NAME,
    p_token_sha256: schedulerTokenHash,
  });
  if (authorization.error || authorization.data !== true) return unauthorized();

  const games = await client
    .from("game_sessions")
    .select("id")
    .eq("status", "active")
    .eq("lifecycle_state", "active")
    .eq("provisioning_status", "ready")
    .order("id", { ascending: true });

  if (games.error) {
    return json(500, {
      ok: false,
      error: {
        code: "active_game_discovery_failed",
        message: "Could not enumerate active provisioned games.",
      },
    });
  }

  const gameSessionIds = (games.data || [])
    .map((row: { id?: string }) => String(row.id || ""))
    .filter(Boolean);
  const results: Array<Record<string, unknown>> = [];
  let ticked = 0;
  let closed = 0;
  let failed = 0;

  for (const gameSessionId of gameSessionIds) {
    const internalSecret = crypto.randomUUID();
    const storylineFailures: Array<Record<string, unknown>> = [];
    try {
      const runnerRequest = new Request(
        "https://scheduler.internal/stock-market-runner",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [INTERNAL_RUNNER_HEADER]: internalSecret,
          },
          body: JSON.stringify({ action: "run_tick", gameSessionId }),
        },
      );

      const runnerResponse = await handleStockMarketRunnerRequest(runnerRequest, {
        createServiceClient: (env) => createClient(
          env.supabaseUrl,
          env.supabaseServiceRoleKey,
          {
            auth: { autoRefreshToken: false, persistSession: false },
            global: {
              headers: {
                "x-client-info": "econovaria-stock-market-orchestrator-runner-v2",
              },
            },
          },
        ) as any,
        readRunnerSecret: () => internalSecret,
        createStorylineRunnerAfterTick,
        logStorylineRunnerFailure: (failure) => {
          storylineFailures.push({
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable,
          });
          console.warn("stock_market_orchestrator_storyline_after_tick_failed", {
            gameSessionId,
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable,
          });
        },
      });
      const payload = await readJson(runnerResponse);

      if (
        runnerResponse.status === 409 &&
        payload?.error?.code === "stock_market_closed"
      ) {
        closed += 1;
        results.push({ gameSessionId, outcome: "closed" });
        continue;
      }

      if (!runnerResponse.ok || payload?.ok !== true) {
        failed += 1;
        console.error("stock_market_orchestrator_game_failed", {
          gameSessionId,
          code: payload?.error?.code || `http_${runnerResponse.status}`,
        });
        results.push({ gameSessionId, outcome: "failed", storylineFailures });
        continue;
      }

      ticked += 1;
      results.push({
        gameSessionId,
        outcome: "ticked",
        tickIndex: Number(payload.tickIndex || 0),
        ticksInserted: Number(payload.ticksInserted || 0),
        storylineFailures,
      });
    } catch (error) {
      failed += 1;
      console.error("stock_market_orchestrator_game_failed", {
        gameSessionId,
        message: error instanceof Error ? error.message : String(error),
      });
      results.push({ gameSessionId, outcome: "failed", storylineFailures });
    }
  }

  return json(failed === 0 ? 200 : 500, {
    ok: failed === 0,
    candidateGames: gameSessionIds.length,
    ticked,
    closed,
    failed,
    results,
  });
});

function unauthorized(): Response {
  return json(401, {
    ok: false,
    error: {
      code: "invalid_scheduler_token",
      message: "Scheduler authentication failed.",
    },
  });
}

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
