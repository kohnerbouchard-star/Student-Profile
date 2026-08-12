import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "npm:@aws-sdk/client-s3@3.864.0";

const SCHEDULER_NAME = "econovaria-game-data-purge-scheduler-v1";
const SCHEDULER_HEADER = "x-econovaria-purge-scheduler-token";
const EXPECTED_REGISTRY_SHA256 = "0967d19098bfcc7b013c5f1bed9fcb2918126fe432e779ad4c8465be6f87eaeb";
const EXPECTED_REGISTRY_TABLES = 133;
const EXPECTED_FK_GRAPH_SHA256 = "72aa93c5ab2a84f915a3e025879bb71db9b740256e17f295107e1039870eadb0";
const EXPECTED_FK_GRAPH_EDGES = 213;
const EXPECTED_DELETE_ORDER_SHA256 = "7c146263607baaf025a4153f5c2007d9e4c955e19e4532f5d530b7248741b8f3";
const EXPECTED_DELETE_ORDER_TABLES = 129;
const DB_BATCH_SIZE = 20;
const R2_BATCH_SIZE = 1000;

type SupabaseClient = ReturnType<typeof createClient>;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: "runtime_config_missing" });

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "econovaria-game-data-purger-v3" } },
  });

  const schedulerToken = String(request.headers.get(SCHEDULER_HEADER) || "").trim();
  if (!/^[0-9a-f]{64}$/iu.test(schedulerToken)) return unauthorized();
  const schedulerHash = await sha256Hex(new TextEncoder().encode(schedulerToken.toLowerCase()));
  const authorized = await client.rpc("verify_runtime_scheduler_token_v1", {
    p_scheduler_name: SCHEDULER_NAME,
    p_token_sha256: schedulerHash,
  });
  if (authorized.error || authorized.data !== true) return unauthorized();

  const claim = await client.rpc("claim_confirmed_game_data_purge_v1");
  if (claim.error) return json(500, { ok: false, error: `claim_failed:${claim.error.message}` });
  const claimed = (claim.data || [])[0] as { request_id?: string; game_session_id?: string; stage?: string } | undefined;
  if (!claimed?.request_id || !claimed.game_session_id || !claimed.stage) {
    return json(200, { ok: true, work: false, reason: "no_confirmed_armed_purge" });
  }

  const requestId = claimed.request_id;
  const gameSessionId = claimed.game_session_id;
  const stage = claimed.stage;

  try {
    const preflightResponse = await client.rpc("get_game_data_purge_preflight_v1", { p_request_id: requestId });
    if (preflightResponse.error) throw new Error(`preflight_failed:${preflightResponse.error.message}`);
    const preflight = preflightResponse.data as Record<string, unknown>;
    assertPreflight(preflight, gameSessionId);

    if (stage === "r2") return json(200, await purgeR2Stage(client, supabaseUrl, requestId, gameSessionId));
    if (stage === "db") return json(200, await purgeDbStage(client, requestId, gameSessionId));
    throw new Error(`unsupported_stage:${stage}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.rpc("record_game_data_purge_failure_v1", {
      p_request_id: requestId,
      p_stage: stage,
      p_error: message,
    });
    console.error("game_data_purge_failed", requestId, gameSessionId, stage, message);
    return json(500, { ok: false, requestId, gameSessionId, stage, error: message });
  }
});

function assertPreflight(preflight: Record<string, unknown>, gameSessionId: string) {
  if (String(preflight.gameSessionId || "") !== gameSessionId) throw new Error("preflight_game_mismatch");
  if (preflight.gameExists !== true) throw new Error("preflight_game_missing");
  if (preflight.purgeProtected === true) throw new Error("preflight_game_protected");
  if (preflight.entitlementExpired !== true) throw new Error("preflight_license_not_expired");
  if (preflight.leverArmed !== true || preflight.armMatches !== true) throw new Error("preflight_lever_not_armed_for_request");
  if (String(preflight.registrySha256 || "") !== EXPECTED_REGISTRY_SHA256) throw new Error("preflight_registry_digest_mismatch");
  if (Number(preflight.registryTableCount || 0) !== EXPECTED_REGISTRY_TABLES) throw new Error("preflight_registry_table_count_mismatch");
  if (String(preflight.fkGraphSha256 || "") !== EXPECTED_FK_GRAPH_SHA256) throw new Error("preflight_fk_graph_digest_mismatch");
  if (Number(preflight.fkGraphEdgeCount || 0) !== EXPECTED_FK_GRAPH_EDGES) throw new Error("preflight_fk_graph_edge_count_mismatch");
  if (String(preflight.deleteOrderSha256 || "") !== EXPECTED_DELETE_ORDER_SHA256) throw new Error("preflight_delete_order_digest_mismatch");
  if (Number(preflight.deleteOrderTableCount || 0) !== EXPECTED_DELETE_ORDER_TABLES) throw new Error("preflight_delete_order_table_count_mismatch");
  if (Number(preflight.crossGameBlockingReferences || 0) !== 0) throw new Error("preflight_cross_game_reference_blocked");
}

async function purgeR2Stage(client: SupabaseClient, supabaseUrl: string, requestId: string, gameSessionId: string) {
  const endpoint = env("R2_ENDPOINT").replace(/\/+$/u, "");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("r2_runtime_config_missing");

  const prefix = `${environmentName(supabaseUrl)}/game_session=${gameSessionId}/`;
  const s3 = new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: R2_BATCH_SIZE }));
  const objects = (listed.Contents || []).flatMap((object) => object.Key ? [{ Key: object.Key, Size: Number(object.Size || 0) }] : []);
  let deletedObjects = 0;
  let deletedBytes = 0;
  if (objects.length > 0) {
    const deleted = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Quiet: true, Objects: objects.map(({ Key }) => ({ Key })) } }));
    if ((deleted.Errors || []).length > 0) throw new Error(`r2_delete_objects_failed:${JSON.stringify(deleted.Errors).slice(0, 800)}`);
    deletedObjects = objects.length;
    deletedBytes = objects.reduce((sum, object) => sum + object.Size, 0);
  }

  const verify = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1 }));
  const complete = Number(verify.KeyCount || 0) === 0 && (verify.Contents || []).length === 0;
  const progress = await client.rpc("record_game_data_purge_r2_progress_v1", {
    p_request_id: requestId,
    p_r2_prefix: prefix,
    p_deleted_objects: deletedObjects,
    p_deleted_bytes: deletedBytes,
    p_complete: complete,
  });
  if (progress.error) throw new Error(`r2_progress_record_failed:${progress.error.message}`);
  return { ok: true, work: true, stage: "r2", requestId, gameSessionId, prefix, deletedObjects, deletedBytes, complete };
}

async function purgeDbStage(client: SupabaseClient, requestId: string, gameSessionId: string) {
  const batch = await client.rpc("execute_game_data_purge_db_batch_v2", { p_request_id: requestId, p_batch_size: DB_BATCH_SIZE });
  if (batch.error) throw new Error(`db_batch_failed:${batch.error.message}`);
  const result = (batch.data || {}) as Record<string, unknown>;
  const readyToFinalize = result.readyToFinalize === true || Number(result.cursor || 0) >= 130;
  if (readyToFinalize) {
    const finalized = await client.rpc("finalize_game_data_purge_v1", { p_request_id: requestId });
    if (finalized.error) throw new Error(`finalize_failed:${finalized.error.message}`);
    return { ok: true, work: true, stage: "db", requestId, gameSessionId, batch: result, finalized: true, result: finalized.data };
  }
  return { ok: true, work: true, stage: "db", requestId, gameSessionId, batch: result, finalized: false };
}

function environmentName(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0] || "unknown";
  if (ref === "eecvbssdvarfcykcfrny") return "staging";
  if (ref === "cgiukdjwicykrmtkhudh") return "production";
  return ref;
}
function env(name: string): string { return String(Deno.env.get(name) || "").trim(); }
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function unauthorized(): Response { return json(401, { ok: false, error: "unauthorized" }); }
function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
