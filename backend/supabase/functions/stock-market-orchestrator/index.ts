import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const RUNNER_NAME = "stock-market-runner";
const TIMESTAMP_HEADER = "x-econovaria-runner-timestamp";
const NONCE_HEADER = "x-econovaria-runner-nonce";
const SIGNATURE_HEADER = "x-econovaria-runner-signature";
const CLOSED_MARKET_CODE = "stock_market_closed";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST." },
    });
  }

  if (!isServiceRoleRequest(request)) {
    return json(403, {
      ok: false,
      error: {
        code: "service_role_required",
        message: "The stock runtime orchestrator is service-role only.",
      },
    });
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = requiredPublishableKey();
  const runnerSecret = requiredEnv("STOCK_MARKET_RUNNER_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !publishableKey || !runnerSecret) {
    return json(500, {
      ok: false,
      error: {
        code: "scheduler_runtime_config_missing",
        message: "Required stock scheduler runtime configuration is missing.",
      },
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "econovaria-stock-market-orchestrator-v1" } },
  });

  const { data: games, error: gamesError } = await client
    .from("game_sessions")
    .select("id")
    .eq("status", "active")
    .eq("lifecycle_state", "active")
    .eq("provisioning_status", "ready")
    .order("id", { ascending: true });

  if (gamesError) {
    return json(500, {
      ok: false,
      error: {
        code: "active_game_discovery_failed",
        message: "Could not enumerate active provisioned games.",
      },
    });
  }

  const candidateIds = (games || [])
    .map((row: { id?: string }) => String(row.id || ""))
    .filter(Boolean);

  if (!candidateIds.length) {
    return json(200, {
      ok: true,
      candidateGames: 0,
      initializedGames: 0,
      ticked: 0,
      closed: 0,
      failed: 0,
      results: [],
    });
  }

  const { data: assets, error: assetsError } = await client
    .from("game_session_stock_assets")
    .select("game_session_id")
    .eq("is_active", true)
    .in("game_session_id", candidateIds);

  if (assetsError) {
    return json(500, {
      ok: false,
      error: {
        code: "stock_initialization_discovery_failed",
        message: "Could not identify initialized stock games.",
      },
    });
  }

  const initializedIds = [...new Set(
    (assets || [])
      .map((row: { game_session_id?: string }) => String(row.game_session_id || ""))
      .filter(Boolean),
  )].sort();

  const results: Array<Record<string, unknown>> = [];
  let ticked = 0;
  let closed = 0;
  let failed = 0;

  for (const gameSessionId of initializedIds) {
    try {
      const result = await triggerRunner({
        supabaseUrl,
        publishableKey,
        runnerSecret,
        gameSessionId,
      });
      if (result.kind === "closed") {
        closed += 1;
        results.push({ gameSessionId, outcome: "closed" });
        continue;
      }
      ticked += 1;
      results.push({
        gameSessionId,
        outcome: "ticked",
        tickIndex: result.tickIndex,
        ticksInserted: result.ticksInserted,
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
    candidateGames: candidateIds.length,
    initializedGames: initializedIds.length,
    ticked,
    closed,
    failed,
    results,
  });
});

async function triggerRunner(input: {
  supabaseUrl: string;
  publishableKey: string;
  runnerSecret: string;
  gameSessionId: string;
}): Promise<
  | { kind: "closed" }
  | { kind: "ticked"; tickIndex: number; ticksInserted: number }
> {
  const url = new URL("/functions/v1/stock-market-runner", input.supabaseUrl).toString();
  const bodyText = JSON.stringify({
    action: "run_tick",
    gameSessionId: input.gameSessionId,
  });
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(bodyText);
  const canonicalPayload = [
    "econovaria-internal-runner-v1",
    `runner:${RUNNER_NAME}`,
    `timestamp:${timestampSeconds}`,
    `nonce:${nonce.toLowerCase()}`,
    "method:POST",
    `origin:${new URL(url).origin}`,
    `path:${new URL(url).pathname}${new URL(url).search}`,
    `body-sha256:${bodyHash}`,
  ].join("\n");
  const signature = await hmacSha256Base64Url(input.runnerSecret, canonicalPayload);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: input.publishableKey,
      "content-type": "application/json",
      [TIMESTAMP_HEADER]: String(timestampSeconds),
      [NONCE_HEADER]: nonce,
      [SIGNATURE_HEADER]: `v1=${signature}`,
    },
    body: bodyText,
  });

  const payload = await readJson(response);
  if (response.status === 409 && payload?.error?.code === CLOSED_MARKET_CODE) {
    return { kind: "closed" };
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(String(payload?.error?.code || `http_${response.status}`));
  }

  return {
    kind: "ticked",
    tickIndex: Number(payload.tickIndex || 0),
    ticksInserted: Number(payload.ticksInserted || 0),
  };
}

function isServiceRoleRequest(request: Request): boolean {
  const authorization = String(request.headers.get("authorization") || "").trim();
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return false;
  const payload = decodeJwtPayload(match[1]);
  return payload?.role === "service_role";
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(parts[1].length / 4) * 4,
      "=",
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function requiredPublishableKey(): string {
  for (const name of ["SUPABASE_PUBLISHABLE_KEY", "PUBLISHABLE_KEY"]) {
    const value = requiredEnv(name);
    if (value.startsWith("sb_publishable_")) return value;
  }
  return "";
}

function requiredEnv(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Base64Url(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
