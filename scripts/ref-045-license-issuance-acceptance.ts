import assert from "node:assert/strict";

const database = Deno.env.get("DATABASE_URL") || "", url = new URL(database);
assert.equal(Deno.env.get("REF045_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.port, "54322"); assert.equal(url.pathname, "/postgres");
assert.equal(url.username, "postgres"); assert.equal(url.search + url.hash, "");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const checks: Record<string, unknown> = {};
const evidence = { task: "REF-045a", sourceSha, status: "running", productionTouched: false, checks };
const q = (v: unknown) => v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
const ident = (v: string) => { assert.match(v, /^[a-z_][a-z0-9_]*$/); return `"${v}"`; };
const decoder = new TextDecoder(), encoder = new TextEncoder();
function command(s: string, app = "ref045-fixture") {
  return new Deno.Command("psql", { args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", s],
    env: { PGAPPNAME: app, PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000" }, stdout: "piped", stderr: "piped" });
}
async function sql(s: string, app?: string) {
  const r = await command(s, app).output();
  if (r.code) throw new Error(decoder.decode(r.stderr).trim());
  return decoder.decode(r.stdout).trim();
}
const json = async (s: string) => JSON.parse(await sql(s));
const rpcNames = ["verify_runtime_scheduler_token_v1", "enqueue_paid_license_v1", "claim_license_materialization_jobs_v2",
  "materialize_license_and_enqueue_email_v2", "retry_license_issuance_job_v1"];
async function rpc(name: string, args: Record<string, unknown>, app = "ref045-rpc") {
  assert.ok(rpcNames.includes(name));
  const call = `public.${ident(name)}(${Object.entries(args).map(([k, v]) => `${ident(k)} => ${q(v)}`).join(",")})`;
  const select = name === "claim_license_materialization_jobs_v2"
    ? `select coalesce(jsonb_agg(r),'[]')::text from ${call} r` : `select to_jsonb(${call})::text`;
  return JSON.parse(await sql(`begin; set local role service_role; ${select}; commit;`, app));
}
// Only synthetic constants enter the real worker. No socket, provider or email transport is available.
const scheduler = "a".repeat(64), calls: string[] = [], errors: string[] = [];
let beforeMaterialize: (() => Promise<void>) | undefined;
const originalFetch = globalThis.fetch, originalServe = Deno.serve;
const environment = { SUPABASE_URL: "https://ref045.invalid", SUPABASE_SERVICE_ROLE_KEY: "ref045-local-placeholder", // secret-scan: allow -- non-secret intercepted fixture; network denied
  ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET: "ref045-synthetic-derivation-material-only",
  ECONOVARIA_PURCHASE_CODE_HMAC_SECRET: "ref045-synthetic-verifier-material-only" };
const previous = Object.fromEntries(Object.keys(environment).map(k => [k, Deno.env.get(k)]));
for (const [k, v] of Object.entries(environment)) Deno.env.set(k, v);
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init), target = new URL(request.url);
  assert.equal(target.origin, "https://ref045.invalid"); assert.equal(request.method, "POST");
  assert.match(target.pathname, /^\/rest\/v1\/rpc\/[a-z_0-9]+$/);
  const name = target.pathname.split("/").at(-1)!; calls.push(name);
  if (name === "materialize_license_and_enqueue_email_v2" && beforeMaterialize) {
    const hook = beforeMaterialize; beforeMaterialize = undefined; await hook();
  }
  try { return Response.json(await rpc(name, await request.json(), "ref045-worker")); }
  catch (error) {
    errors.push(String(error));
    return Response.json({ code: String(error).match(/ERROR:\s+(\w{5}):/)?.[1], message: String(error) }, { status: 400 });
  }
};
let handler: (request: Request) => Promise<Response>;
Deno.serve = ((fn: typeof handler) => { handler = fn; return {} as Deno.HttpServer; }) as typeof Deno.serve;
const claim = () => rpc("claim_license_materialization_jobs_v2", { p_batch_size: 10, p_lease_seconds: 90 });
async function worker(token = scheduler, method = "POST") {
  const response = await handler(new Request("https://ref045.invalid/worker", { method,
    headers: { "x-econovaria-scheduler-token": token } }));
  return { status: response.status, body: await response.json() };
}
const provider = "ref045", price = "ref045-synthetic-price";
async function seed() {
  const id = crypto.randomUUID();
  const args = { p_provider: provider, p_provider_event_id: `event-${id}`, p_provider_payment_id: `payment-${id}`,
    p_provider_price_ref: price, p_recipient_email: `${id}@example.test`, p_amount_minor: 100,
    p_currency: "USD", p_occurred_at: "2026-01-01T00:00:00Z", p_payload_sha256: "b".repeat(64) };
  return { args, receipt: await rpc("enqueue_paid_license_v1", args) };
}
async function state() {
  return json(`select jsonb_build_object(
    'codes',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.purchase_codes r),
    'outbox',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from private.license_email_outbox r),
    'payments',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from private.license_payment_events r),
    'jobs',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from private.license_issuance_jobs r),
    'entitlements',(select count(*) from public.entitlements))::text`);
}
function issued(s: any, jobId: string) {
  const job = s.jobs.find((r: any) => r.id === jobId), outbox = s.outbox.filter((r: any) => r.issuance_job_id === jobId);
  assert.equal(job.status, "issued"); assert.equal(job.lease_token, null); assert.ok(job.issued_at);
  assert.equal(outbox.length, 1); assert.equal(outbox[0].status, "pending"); assert.equal(outbox[0].attempt_count, 0);
  assert.equal(outbox[0].idempotency_key, `license-issuance/${jobId}/delivery-v1`);
  const payment = s.payments.find((r: any) => r.id === job.payment_event_id);
  assert.equal(outbox[0].payment_event_id, payment.id); assert.equal(outbox[0].recipient_email, payment.recipient_email);
  assert.equal(payment.license_duration_days_snapshot, 30);
  const code = s.codes.find((r: any) => r.id === job.purchase_code_id);
  assert.equal(outbox[0].purchase_code_id, code.id); assert.equal(code.license_duration_days, 30);
  assert.equal(code.max_redemptions, 1); assert.equal(code.redeemed_count, 0);
  assert.equal(code.code_hash_version, "hmac-sha256-v2"); assert.match(code.code_hash, /^[a-f0-9]{64}$/);
  return job;
}
async function failInsert(table: string) {
  // A failure inside the real command, after earlier writes, must roll back the whole issuance transaction.
  await sql(`create or replace function ref045_test.fail_insert() returns trigger language plpgsql as $$
    begin raise exception 'REF045_IN_COMMAND_FAILURE'; end $$;
    create trigger ref045_fail before insert on ${table} for each row execute function ref045_test.fail_insert();`);
}
let blocker: Deno.ChildProcess | undefined;
try {
  await import("../backend/supabase/functions/license-issuance-worker/index.ts");
  assert.equal(typeof handler!, "function");
  assert.equal(await sql("select count(*) from private.license_issuance_jobs"), "0", "Disposable queue must start empty");
  await sql(`create schema ref045_test;
    insert into private.license_products(provider,provider_price_ref,product_sku,currency,amount_minor,license_duration_days,purchase_code_expires_after_days)
    values('${provider}','${price}','ref045-synthetic','USD',100,30,7);
    insert into private.runtime_scheduler_tokens(scheduler_name,token_sha256)
    values('econovaria-license-issuance-scheduler-v1',encode(extensions.digest(${q(scheduler)},'sha256'),'hex'))
    on conflict(scheduler_name) do update set token_sha256=excluded.token_sha256;`);
  const baseline = await state();
  assert.equal((await worker(scheduler, "GET")).status, 405); assert.deepEqual(calls, []);
  assert.equal((await worker("malformed")).status, 401); assert.deepEqual(calls, []);
  assert.equal((await worker("c".repeat(64))).status, 401);
  assert.deepEqual(calls, ["verify_runtime_scheduler_token_v1"]); checks.denialBeforeClaim = true;

  calls.length = 0; Deno.env.delete("ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET");
  assert.equal((await worker()).status, 503); assert.deepEqual(calls, ["verify_runtime_scheduler_token_v1"]);
  Deno.env.set("ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET", environment.ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET);
  checks.runtimeConfigBeforeClaim = true;

  const first = await seed(), duplicate = await rpc("enqueue_paid_license_v1", first.args);
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.jobId, first.receipt.jobId);
  const alternate = await rpc("enqueue_paid_license_v1", { ...first.args, p_provider_event_id: crypto.randomUUID() });
  assert.equal(alternate.duplicateSource, "payment"); assert.equal(alternate.jobId, first.receipt.jobId);
  await assert.rejects(rpc("enqueue_paid_license_v1", { ...first.args, p_payload_sha256: "c".repeat(64) }), /PAYMENT_EVENT_REPLAY_MISMATCH/);
  calls.length = 0;
  assert.deepEqual(await worker(), { status: 200, body: { ok: true, claimed: 1, issued: 1, retryScheduled: 0, deadLettered: 0 } });
  assert.deepEqual(calls, ["verify_runtime_scheduler_token_v1", "claim_license_materialization_jobs_v2", "materialize_license_and_enqueue_email_v2"]);
  const success = await state(); issued(success, first.receipt.jobId);
  assert.equal(success.codes.length, baseline.codes.length + 1); assert.equal(success.outbox.length, baseline.outbox.length + 1);
  assert.equal(success.entitlements, baseline.entitlements); assert.equal((await worker()).body.claimed, 0);
  assert.deepEqual(await state(), success); checks.duplicatePaymentAndJob = true;

  // A legacy materialized job can be reclaimed; its existing verifier and outbox remain the only effects.
  await sql(`update private.license_issuance_jobs set status='retry',next_attempt_at=clock_timestamp() where id=${q(first.receipt.jobId)}`);
  assert.equal((await worker()).body.issued, 1);
  const replay = await state(); assert.equal(issued(replay, first.receipt.jobId).attempt_count, 2);
  assert.deepEqual(replay.codes, success.codes); assert.deepEqual(replay.outbox, success.outbox); checks.materializedReplay = true;

  const expired = await seed(), oldClaim = (await claim())[0];
  assert.equal(oldClaim.job_id, expired.receipt.jobId);
  await sql(`update private.license_issuance_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=${q(oldClaim.job_id)}`);
  assert.equal((await worker()).body.issued, 1); assert.equal(issued(await state(), oldClaim.job_id).attempt_count, 2);
  await assert.rejects(rpc("materialize_license_and_enqueue_email_v2", { p_job_id: oldClaim.job_id, p_lease_token: oldClaim.lease_token,
    p_code_hash: "d".repeat(64), p_code_hash_version: "hmac-sha256-v2", p_code_generation_nonce: 0, p_template_version: "license-issued-v1" }), /LICENSE_ISSUANCE_LEASE_INVALID/);
  checks.expiredClaimReclaimedAndOldLeaseDenied = true;

  for (const denial of ["cancelled-payment", "expired-lease"]) {
    const f = await seed(), before = await state();
    beforeMaterialize = () => sql(denial === "cancelled-payment"
      ? `update private.license_payment_events set status='cancelled' where id=${q(f.receipt.paymentEventId)}`
      : `update private.license_issuance_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=${q(f.receipt.jobId)}`).then(() => {});
    assert.equal((await worker()).body.retryScheduled, 1);
    assert.match(errors.at(-1)!, denial === "cancelled-payment" ? /LICENSE_PAYMENT_NOT_ACCEPTED/ : /LICENSE_ISSUANCE_LEASE_INVALID/);
    const after = await state(); assert.deepEqual(after.codes, before.codes); assert.deepEqual(after.outbox, before.outbox);
    assert.equal(after.jobs.find((j: any) => j.id === f.receipt.jobId).status, "retry");
    await sql(`update private.license_issuance_jobs set status='cancelled' where id=${q(f.receipt.jobId)}`);
    checks[denial] = true;
  }
  for (const table of ["public.purchase_codes", "private.license_email_outbox"]) {
    const f = await seed(), before = await state(); await failInsert(table);
    assert.equal((await worker()).body.retryScheduled, 1); assert.match(errors.at(-1)!, /REF045_IN_COMMAND_FAILURE/);
    const after = await state(); assert.deepEqual(after.codes, before.codes); assert.deepEqual(after.outbox, before.outbox);
    const job = after.jobs.find((j: any) => j.id === f.receipt.jobId);
    assert.equal(job.status, "retry"); assert.equal(job.purchase_code_id, null); assert.equal(job.lease_token, null);
    assert.equal(job.last_error_code, "license_code_and_outbox_materialization_failed");
    assert.ok(Date.parse(job.next_attempt_at) > Date.parse(job.updated_at));
    await sql(`drop trigger ref045_fail on ${table}; update private.license_issuance_jobs set next_attempt_at=clock_timestamp() where id=${q(f.receipt.jobId)}`);
    assert.equal((await worker()).body.issued, 1); issued(await state(), f.receipt.jobId); checks[table + "RollbackAndRetry"] = true;
  }

  const race = await seed();
  await sql(`create function ref045_test.hold_claim() returns trigger language plpgsql as $$ begin
    if new.id=${q(race.receipt.jobId)}::uuid and new.status='processing' then perform pg_advisory_xact_lock(450045); end if;
    return new; end $$; create trigger ref045_hold before update on private.license_issuance_jobs
    for each row execute function ref045_test.hold_claim();`);
  blocker = new Deno.Command("psql", { args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], stdin: "piped", stdout: "piped", stderr: "piped",
    env: { PGAPPNAME: "ref045-blocker" } }).spawn();
  const writer = blocker.stdin.getWriter(); await writer.write(encoder.encode("select pg_advisory_lock(450045);\n"));
  async function waitFor(predicate: string) {
    for (let n = 0; n < 100; n++) {
      if (await sql(`select exists(${predicate})`) === "t") return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Expected real PostgreSQL claim contention was not observed");
  }
  await waitFor("select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='ref045-blocker' and l.locktype='advisory' and l.granted");
  const winner = worker();
  await waitFor("select 1 from pg_stat_activity where application_name='ref045-worker' and wait_event_type='Lock'");
  const loser = await worker(); assert.equal(loser.body.claimed, 0);
  await writer.write(encoder.encode("select pg_advisory_unlock(450045);\n\\q\n")); await writer.close();
  assert.equal((await blocker.output()).code, 0); blocker = undefined;
  assert.equal((await winner).body.issued, 1); assert.equal(issued(await state(), race.receipt.jobId).attempt_count, 1);
  await sql("drop trigger ref045_hold on private.license_issuance_jobs"); checks.observedSkipLockedWorkerRace = true;
  const final = await state(); assert.equal(final.codes.length, baseline.codes.length + 5);
  assert.equal(final.outbox.length, baseline.outbox.length + 5); assert.equal(final.entitlements, baseline.entitlements);
  assert.equal(final.jobs.length, 7); assert.equal(final.payments.length, baseline.payments.length + 7);
  checks.effects = { acceptedSyntheticPayments: 7, issuanceJobs: 7, newVerifiers: 5, newOutboxJobs: 5, newEntitlements: 0, emailRequests: 0 };
  evidence.status = "passed";
} finally {
  if (blocker) { blocker.kill("SIGTERM"); await blocker.status; }
  await sql("drop trigger if exists ref045_fail on public.purchase_codes; drop trigger if exists ref045_fail on private.license_email_outbox; drop trigger if exists ref045_hold on private.license_issuance_jobs; drop schema if exists ref045_test cascade;");
  globalThis.fetch = originalFetch; Deno.serve = originalServe;
  for (const [k, v] of Object.entries(previous)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  await Deno.writeTextFile("/tmp/ref018/ref045-acceptance.json", JSON.stringify(evidence, null, 2) + "\n");
}
console.log(JSON.stringify(evidence));
