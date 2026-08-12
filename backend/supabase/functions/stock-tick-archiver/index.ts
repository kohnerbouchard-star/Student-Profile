import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { parquetWriteBuffer } from "npm:hyparquet-writer@0.16.6/src/index.js";

const SCHEDULER_NAME = "econovaria-stock-runtime-scheduler-v1";
const SCHEDULER_HEADER = "x-econovaria-scheduler-token";
const PAGE_SIZE = 1000;
const MAX_BATCH_HOURS = 2;
const TICK_SELECT = [
  "id","game_session_id","stock_asset_id","tick_index","ticker","price",
  "previous_price","log_return","change_pct","volume","current_volatility",
  "long_run_volatility","explanation","created_at",
].join(",");

type SupabaseClient = ReturnType<typeof createClient<any>>;
type PreparedArchive = {
  game_session_id: string;
  range_start: string;
  range_end: string;
  min_tick_index: number;
  max_tick_index: number;
  row_count: number | string;
};
type TickRow = {
  id: string;
  game_session_id: string;
  stock_asset_id: string;
  tick_index: number | string;
  ticker: string;
  price: number | string;
  previous_price: number | string;
  log_return: number | string;
  change_pct: number | string;
  volume: number | string;
  current_volatility: number | string;
  long_run_volatility: number | string;
  explanation: Record<string, unknown>;
  created_at: string;
};
type ArchiveRuntime = {
  client: SupabaseClient;
  r2: AwsClient;
  r2Endpoint: string;
  r2Bucket: string;
  supabaseUrl: string;
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { ok: false, error: { code: "method_not_allowed", message: "Use POST." } });

  const supabaseUrl = environmentValue("SUPABASE_URL");
  const serviceRoleKey = environmentValue("SUPABASE_SERVICE_ROLE_KEY");
  const r2Endpoint = normalizeEndpoint(environmentValue("R2_ENDPOINT"));
  const r2AccessKeyId = environmentValue("R2_ACCESS_KEY_ID");
  const r2SecretAccessKey = environmentValue("R2_SECRET_ACCESS_KEY");
  const r2Bucket = environmentValue("R2_BUCKET");
  if (!supabaseUrl || !serviceRoleKey || !r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    return json(500, { ok: false, error: { code: "archive_runtime_config_missing", message: "Required archive runtime configuration is missing." } });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "econovaria-stock-tick-archiver-v2" } },
  });
  const schedulerToken = String(request.headers.get(SCHEDULER_HEADER) || "").trim();
  if (!/^[0-9a-f]{64}$/iu.test(schedulerToken)) return unauthorized();
  const schedulerTokenHash = await sha256Hex(new TextEncoder().encode(schedulerToken.toLowerCase()));
  const authorization = await client.rpc("verify_runtime_scheduler_token_v1", {
    p_scheduler_name: SCHEDULER_NAME,
    p_token_sha256: schedulerTokenHash,
  });
  if (authorization.error || authorization.data !== true) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json(400, { ok: false, error: { code: "invalid_json", message: "Request body must be JSON." } }); }

  const action = String(body.action || "archive_next_hour").trim();
  if (action !== "archive_next_hour" && action !== "archive_batch") {
    return json(400, { ok: false, error: { code: "unsupported_action", message: "Supported actions: archive_next_hour, archive_batch." } });
  }
  const gameSessionId = String(body.gameSessionId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(gameSessionId)) {
    return json(400, { ok: false, error: { code: "invalid_game_session_id", message: "A valid gameSessionId is required." } });
  }

  const purge = body.purge === true;
  const requestedHours = action === "archive_batch" ? Number(body.maxHours ?? 2) : 1;
  const maxHours = Math.max(1, Math.min(MAX_BATCH_HOURS, Number.isFinite(requestedHours) ? Math.trunc(requestedHours) : 1));
  const runtime: ArchiveRuntime = {
    client,
    r2: new AwsClient({ accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey, service: "s3", region: "auto", retries: 3 }),
    r2Endpoint,
    r2Bucket,
    supabaseUrl,
  };

  const results: Record<string, unknown>[] = [];
  let totalRows = 0;
  let totalCompressedBytes = 0;
  let totalPurgedRows = 0;
  try {
    for (let i = 0; i < maxHours; i += 1) {
      const result = await archiveOne(runtime, gameSessionId, purge);
      if (!result) break;
      results.push(result);
      totalRows += Number(result.rowCount || 0);
      totalCompressedBytes += Number(result.compressedBytes || 0);
      totalPurgedRows += Number(result.purgedRows || 0);
    }
    return json(200, {
      ok: true,
      gameSessionId,
      requestedHours: maxHours,
      archivedHours: results.length,
      purge,
      totalRows,
      totalCompressedBytes,
      totalPurgedRows,
      results,
      exhausted: results.length < maxHours,
    });
  } catch (error) {
    console.error("stock_tick_archive_failed", error instanceof Error ? error.message : String(error));
    return json(500, {
      ok: false,
      gameSessionId,
      completedHours: results.length,
      completedRows: totalRows,
      completedPurgedRows: totalPurgedRows,
      error: { code: "stock_tick_archive_failed", message: error instanceof Error ? error.message : "Stock tick archive failed." },
    });
  }
});

async function archiveOne(runtime: ArchiveRuntime, gameSessionId: string, purge: boolean): Promise<Record<string, unknown> | null> {
  const { client, r2, r2Endpoint, r2Bucket, supabaseUrl } = runtime;
  const preparedResponse = await client.rpc("prepare_next_stock_tick_archive", { p_game_session_id: gameSessionId });
  if (preparedResponse.error) throw new Error(`prepare_failed:${preparedResponse.error.message}`);
  const prepared = (preparedResponse.data || [])[0] as PreparedArchive | undefined;
  if (!prepared) return null;

  const expectedRows = Number(prepared.row_count);
  if (!Number.isSafeInteger(expectedRows) || expectedRows <= 0 || expectedRows > 250000) throw new Error("prepared_row_count_invalid");
  const rows = await readPreparedRows(client, prepared, expectedRows);
  if (rows.length !== expectedRows) throw new Error(`archive_row_count_mismatch:expected=${expectedRows}:actual=${rows.length}`);

  const parquetBuffer = parquetWriteBuffer({
    columnData: [
      { name: "id", data: rows.map((r) => r.id), type: "STRING" },
      { name: "game_session_id", data: rows.map((r) => r.game_session_id), type: "STRING" },
      { name: "stock_asset_id", data: rows.map((r) => r.stock_asset_id), type: "STRING" },
      { name: "tick_index", data: rows.map((r) => Number(r.tick_index)), type: "INT32" },
      { name: "ticker", data: rows.map((r) => r.ticker), type: "STRING" },
      { name: "price", data: rows.map((r) => String(r.price)), type: "STRING" },
      { name: "previous_price", data: rows.map((r) => String(r.previous_price)), type: "STRING" },
      { name: "log_return", data: rows.map((r) => String(r.log_return)), type: "STRING" },
      { name: "change_pct", data: rows.map((r) => String(r.change_pct)), type: "STRING" },
      { name: "volume", data: rows.map((r) => String(r.volume)), type: "STRING" },
      { name: "current_volatility", data: rows.map((r) => String(r.current_volatility)), type: "STRING" },
      { name: "long_run_volatility", data: rows.map((r) => String(r.long_run_volatility)), type: "STRING" },
      { name: "explanation", data: rows.map((r) => r.explanation), type: "JSON" },
      { name: "created_at", data: rows.map((r) => r.created_at), type: "STRING" },
    ],
    codec: "SNAPPY",
    rowGroupSize: 10000,
    kvMetadata: [
      { key: "econovaria_archive_schema", value: "stock_ticks_v1" },
      { key: "game_session_id", value: prepared.game_session_id },
      { key: "range_start", value: prepared.range_start },
      { key: "range_end", value: prepared.range_end },
    ],
  });
  const sha256 = await sha256Hex(new Uint8Array(parquetBuffer));
  const compressedBytes = parquetBuffer.byteLength;
  if (compressedBytes <= 0) throw new Error("parquet_empty");

  const objectKey = archiveObjectKey(supabaseUrl, prepared);
  const objectUrl = r2ObjectUrl(r2Endpoint, r2Bucket, objectKey);
  let head = await r2.fetch(objectUrl, { method: "HEAD" });
  if (head.status === 404) {
    const put = await r2.fetch(objectUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/vnd.apache.parquet", "If-None-Match": "*" },
      body: parquetBuffer,
    });
    if (!put.ok && put.status !== 412) throw new Error(`r2_put_failed:${put.status}:${await safeText(put)}`);
    head = await r2.fetch(objectUrl, { method: "HEAD" });
  }
  if (!head.ok) throw new Error(`r2_head_failed:${head.status}:${await safeText(head)}`);
  const remoteLength = Number(head.headers.get("content-length") || "0");
  if (remoteLength !== compressedBytes) throw new Error(`r2_length_mismatch:expected=${compressedBytes}:actual=${remoteLength}`);

  const verifyGet = await r2.fetch(objectUrl, { method: "GET" });
  if (!verifyGet.ok) throw new Error(`r2_get_verify_failed:${verifyGet.status}:${await safeText(verifyGet)}`);
  const remoteBuffer = await verifyGet.arrayBuffer();
  if (remoteBuffer.byteLength !== compressedBytes) throw new Error(`r2_verify_length_mismatch:expected=${compressedBytes}:actual=${remoteBuffer.byteLength}`);
  const remoteSha256 = await sha256Hex(new Uint8Array(remoteBuffer));
  if (remoteSha256 !== sha256) throw new Error("r2_sha256_mismatch");

  const etag = String(head.headers.get("etag") || "").replace(/^\"|\"$/g, "");
  const registration = await client.rpc("register_verified_stock_tick_archive", {
    p_game_session_id: prepared.game_session_id,
    p_range_start: prepared.range_start,
    p_range_end: prepared.range_end,
    p_min_tick_index: Number(prepared.min_tick_index),
    p_max_tick_index: Number(prepared.max_tick_index),
    p_row_count: expectedRows,
    p_object_key: objectKey,
    p_object_etag: etag,
    p_sha256: sha256,
    p_compressed_bytes: compressedBytes,
  });
  if (registration.error) throw new Error(`register_failed:${registration.error.message}`);
  const archiveId = String(registration.data || "");

  let purgedRows = 0;
  if (purge) {
    const purgeResponse = await client.rpc("purge_verified_stock_tick_archive", { p_archive_id: archiveId });
    if (purgeResponse.error) throw new Error(`purge_failed:${purgeResponse.error.message}`);
    purgedRows = Number(purgeResponse.data || 0);
    if (purgedRows !== expectedRows) throw new Error(`purge_count_mismatch:expected=${expectedRows}:actual=${purgedRows}`);
  }

  return {
    archiveId,
    gameSessionId: prepared.game_session_id,
    rangeStart: prepared.range_start,
    rangeEnd: prepared.range_end,
    minTickIndex: Number(prepared.min_tick_index),
    maxTickIndex: Number(prepared.max_tick_index),
    rowCount: expectedRows,
    objectKey,
    compressedBytes,
    sha256,
    etag,
    purgedRows,
  };
}

async function readPreparedRows(client: SupabaseClient, prepared: PreparedArchive, expectedRows: number): Promise<TickRow[]> {
  const rows: TickRow[] = [];
  for (let offset = 0; offset < expectedRows; offset += PAGE_SIZE) {
    const end = Math.min(offset + PAGE_SIZE - 1, expectedRows - 1);
    const response = await client.from("stock_price_ticks").select(TICK_SELECT)
      .eq("game_session_id", prepared.game_session_id)
      .gte("tick_index", Number(prepared.min_tick_index)).lte("tick_index", Number(prepared.max_tick_index))
      .gte("created_at", prepared.range_start).lt("created_at", prepared.range_end)
      .order("tick_index", { ascending: true }).order("stock_asset_id", { ascending: true }).range(offset, end);
    if (response.error) throw new Error(`tick_fetch_failed:${response.error.message}`);
    const page = (response.data || []) as TickRow[];
    rows.push(...page);
    if (page.length < end - offset + 1) break;
  }
  rows.sort((a, b) => Number(a.tick_index) - Number(b.tick_index) || a.stock_asset_id.localeCompare(b.stock_asset_id));
  return rows;
}

function archiveObjectKey(supabaseUrl: string, prepared: PreparedArchive): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0] || "unknown";
  const environment = ref === "eecvbssdvarfcykcfrny" ? "staging" : ref === "cgiukdjwicykrmtkhudh" ? "production" : ref;
  const date = new Date(prepared.range_start);
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hour = date.getUTCHours().toString().padStart(2, "0");
  return `${environment}/game_session=${prepared.game_session_id}/year=${year}/month=${month}/day=${day}/hour=${hour}/ticks.parquet`;
}
function r2ObjectUrl(endpoint: string, bucket: string, key: string): string {
  return `${endpoint}/${encodeURIComponent(bucket)}/${key.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}
function normalizeEndpoint(value: string): string { return String(value || "").trim().replace(/\/+$/u, ""); }
function environmentValue(name: string): string { return String(Deno.env.get(name) || "").trim(); }
function unauthorized(): Response { return json(401, { ok: false, error: { code: "unauthorized", message: "Unauthorized." } }); }
async function safeText(response: Response): Promise<string> { try { return (await response.text()).slice(0, 400); } catch { return ""; } }
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestBytes = new Uint8Array(bytes.byteLength);
  digestBytes.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestBytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
