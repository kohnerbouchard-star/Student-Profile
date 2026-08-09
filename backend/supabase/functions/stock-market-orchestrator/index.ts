import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { calculateNextStockMarketTick } from "../../../src/domains/stocks/calculations/stockMarketEngine.ts";
import { SupabaseStockMarketRunnerRepository } from "../../../src/domains/stocks/infrastructure/supabaseStockMarketRunnerRepository.ts";
import { readStockMarketOpenState } from "../../../src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.ts";

const SCHEDULER_NAME = "econovaria-stock-runtime-scheduler-v1";
const SCHEDULER_HEADER = "x-econovaria-scheduler-token";

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
      headers: { "x-client-info": "econovaria-stock-market-orchestrator-v1" },
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
    try {
      const marketOpen = await readStockMarketOpenState(
        client as any,
        gameSessionId,
        new Date(),
      );
      if (!marketOpen) {
        closed += 1;
        results.push({ gameSessionId, outcome: "closed" });
        continue;
      }

      const repository = new SupabaseStockMarketRunnerRepository(client as any);
      const loaded = await repository.load({ gameSessionId });
      const result = calculateNextStockMarketTick({
        gameSessionId: loaded.gameSessionId,
        seed: `stock-market-runner-v1:${gameSessionId}`,
        tickIndex: loaded.tickIndex,
        assets: loaded.assets,
        macro: loaded.macro,
        countries: loaded.countries,
        sectors: loaded.sectors,
        shocks: loaded.shocks,
        regime: loaded.regime,
      });
      const applied = await repository.apply(buildPersistencePayload(loaded, result));
      ticked += 1;
      results.push({
        gameSessionId,
        outcome: "ticked",
        tickIndex: loaded.tickIndex,
        ticksInserted: applied.ticksInserted,
      });
    } catch (error) {
      failed += 1;
      console.error("stock_market_orchestrator_game_failed", {
        gameSessionId,
        message: error instanceof Error ? error.message : String(error),
      });
      results.push({ gameSessionId, outcome: "failed" });
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

function buildPersistencePayload(loaded: any, result: any) {
  const assetById = new Map(loaded.assets.map((asset: any) => [asset.assetId, asset]));
  const rowByTicker = new Map(result.rows.map((row: any) => [row.ticker, row]));
  const assetUpdates = result.ticks.map((tick: any) => {
    const row: any = rowByTicker.get(tick.ticker);
    const asset: any = assetById.get(tick.assetId);
    if (!row || !asset) throw new Error("stock_market_tick_apply_failed");
    return {
      game_session_id: loaded.gameSessionId,
      asset_id: tick.assetId,
      current_price: row.currentPrice,
      previous_close: row.previousClose,
      open_price: row.openPrice,
      day_high: row.dayHigh,
      day_low: row.dayLow,
      market_cap: row.marketCap,
      current_volatility: tick.currentVolatility,
      long_run_volatility: tick.longRunVolatility,
      recent_returns: [...(asset.recentReturns || []), tick.changePct / 100].slice(-30),
      chart_history: row.history.map((point: any) => ({
        tickIndex: point.tickIndex,
        timestamp: point.timestamp,
        label: point.label,
        price: point.price,
        gameSessionId: point.gameSessionId,
        volume: point.volume ?? null,
      })),
    };
  });
  const tickRows = result.ticks.map((tick: any) => ({
    game_session_id: loaded.gameSessionId,
    stock_asset_id: tick.assetId,
    tick_index: tick.tickIndex,
    ticker: tick.ticker,
    price: tick.price,
    previous_price: tick.previousPrice,
    log_return: tick.logReturn,
    change_pct: tick.changePct,
    volume: tick.volume,
    current_volatility: tick.currentVolatility,
    long_run_volatility: tick.longRunVolatility,
    explanation: {
      gameSessionId: tick.explanation.gameSessionId,
      tickIndex: tick.explanation.tickIndex,
      ticker: tick.explanation.ticker,
      headline: tick.explanation.headline,
      summary: tick.explanation.summary,
      studentText: tick.explanation.studentText,
      components: { ...tick.explanation.components },
      appliedShockIds: [...tick.explanation.appliedShockIds],
      regime: tick.explanation.regime,
    },
  }));
  return {
    gameSessionId: loaded.gameSessionId,
    tickIndex: loaded.tickIndex,
    assetUpdates,
    tickRows,
  };
}

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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
