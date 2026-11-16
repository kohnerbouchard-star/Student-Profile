import assert from "node:assert/strict";

// The fixture may mutate only the REF-018 job's disposable loopback stack.
assert.equal(Deno.env.get("PR889_DISPOSABLE_DATABASE"), "1");
const database = Deno.env.get("DATABASE_URL") || "";
const databaseUrl = new URL(database);
assert.ok(
  ["postgres:", "postgresql:"].includes(databaseUrl.protocol) &&
    databaseUrl.hostname === "127.0.0.1" && databaseUrl.port === "54322" &&
    databaseUrl.pathname === "/postgres" &&
    databaseUrl.username === "postgres" &&
    databaseUrl.search === "" && databaseUrl.hash === "",
  "Campaign proof requires the disposable local database",
);
const apiUrl = new URL(Deno.env.get("SUPABASE_URL") || "");
assert.ok(
  apiUrl.origin === "http://127.0.0.1:54321" && apiUrl.pathname === "/" &&
    !apiUrl.username && !apiUrl.password && !apiUrl.search && !apiUrl.hash,
  "Campaign proof requires the disposable local API",
);
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
assert.ok(serviceKey, "Local service key is required");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);

const scheduler = "econovaria-campaign-runtime-scheduler-v1";
const token = Array.from(
  crypto.getRandomValues(new Uint8Array(32)),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");
const tokenHash = Array.from(
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  ),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");
const staff = crypto.randomUUID();
const authUser = crypto.randomUUID();
const games = [crypto.randomUUID(), crypto.randomUUID()];
const campaignIds = [
  crypto.randomUUID(),
  crypto.randomUUID(),
  crypto.randomUUID(),
];
const publicIds = campaignIds.map((id) => `cmp_${id.replaceAll("-", "")}`);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const staffEmail = `${staff}@example.test`;
const gameList = games.map(literal).join(",");
const campaignList = campaignIds.map(literal).join(",");
const ownedStaff = `id=${literal(staff)} and supabase_auth_user_id=${
  literal(authUser)
} and email=${literal(staffEmail)} and display_name='PR889 synthetic'`;
const ownedGames = `owner_staff_user_id=${literal(staff)} and
  ((id=${literal(games[0])} and name='PR889 game A') or
   (id=${literal(games[1])} and name='PR889 game B')) and
  exists(select 1 from public.staff_users where ${ownedStaff})`;
const ownedCampaigns = campaignIds.map((id, index) =>
  `(id=${literal(id)} and public_id=${
    literal(publicIds[index])
  } and game_session_id=${literal(games[index === 2 ? 1 : 0])})`
).join(" or ");
const checks: Record<string, boolean> = {};
const evidence: Record<string, unknown> = {
  task: "PR889-campaign-postgrest",
  sourceSha,
  status: "running",
  productionTouched: false,
  transport: "Real SDK to loopback PostgREST",
  checks,
};
async function sql(statement: string): Promise<void> {
  const result = await new Deno.Command("psql", {
    args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
    clearEnv: true,
    env: {
      PATH: "/usr/bin:/bin",
      PGAPPNAME: "pr889-campaign-proof",
      PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000",
    },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (result.code !== 0) {
    const diagnostic = new TextDecoder().decode(result.stderr)
      .replace(/postgres(?:ql)?:\/\/\S+/giu, "[database-url]")
      .replace(/[0-9a-f]{64}/giu, "[digest]")
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, "[uuid]")
      .slice(0, 1000);
    throw new Error(`Disposable Campaign fixture SQL failed: ${diagnostic}`);
  }
}

type Call = {
  method: string;
  path: string;
  query: URLSearchParams;
  authorized: boolean;
  body: unknown;
  status: number;
};
const calls: Call[] = [];
const originalFetch = globalThis.fetch;
let seedAttempted = false;
let failed = false;
let failure: unknown;
try {
  // INSERT, never replace, the sole synthetic token. A pre-existing row fails closed.
  seedAttempted = true;
  await sql(`begin;
    insert into private.runtime_scheduler_tokens(scheduler_name,token_sha256)
      values(${literal(scheduler)},${literal(tokenHash)});
    insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
      values(${literal(staff)},${literal(authUser)},${
    literal(staffEmail)
  },'PR889 synthetic');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status)
      values(${literal(games[0])},${
    literal(staff)
  },'PR889 game A','active','active','pending'),
            (${literal(games[1])},${
    literal(staff)
  },'PR889 game B','active','active','pending');
    insert into public.campaign_instances(id,public_id,game_session_id,pack_id,pack_version,definition_id,definition_digest,status,outcome,completed_at)
      values(${literal(campaignIds[0])},${literal(publicIds[0])},${
    literal(games[0])
  },'pr889-pack','v1','pr889-shared',repeat('a',64),'active',null,null),
            (${literal(campaignIds[1])},${literal(publicIds[1])},${
    literal(games[0])
  },'pr889-pack','v1','pr889-only-a',repeat('a',64),'completed','reconstruction',clock_timestamp()),
            (${literal(campaignIds[2])},${literal(publicIds[2])},${
    literal(games[1])
  },'pr889-pack','v1','pr889-shared',repeat('a',64),'active',null,null);
    commit;`);
  // Observe headers and bodies, but forward every request to the real local API.
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    assert.equal(
      target.origin,
      apiUrl.origin,
      "SDK must stay on the local API",
    );
    const authorized = request.headers.get("apikey") === serviceKey &&
      request.headers.get("authorization") === `Bearer ${serviceKey}`;
    const body = request.method === "POST"
      ? await request.clone().json()
      : null;
    const call: Call = {
      method: request.method,
      path: target.pathname,
      query: target.searchParams,
      authorized,
      body,
      status: 0,
    };
    calls.push(call);
    const response = await originalFetch(request, { redirect: "error" });
    call.status = response.status;
    return response;
  };
  const { campaignRuntimeClient, verifySchedulerToken } = await import(
    "../backend/supabase/functions/campaign-orchestrator/infrastructure/client.ts"
  );

  const first = await campaignRuntimeClient.from("campaign_instances")
    .select("public_id,game_session_id,definition_id")
    .eq("game_session_id", games[0]).eq("definition_id", "pr889-shared")
    .maybeSingle();
  assert.equal(first.error, null);
  assert.deepEqual(first.data, {
    public_id: publicIds[0],
    game_session_id: games[0],
    definition_id: "pr889-shared",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.get("game_session_id"), `eq.${games[0]}`);
  assert.equal(calls[0].query.get("definition_id"), "eq.pr889-shared");

  const other = await campaignRuntimeClient.from("campaign_instances")
    .select("public_id,game_session_id,definition_id")
    .eq("game_session_id", games[1]).eq("definition_id", "pr889-shared")
    .maybeSingle();
  assert.equal(other.error, null);
  assert.deepEqual(other.data, {
    public_id: publicIds[2],
    game_session_id: games[1],
    definition_id: "pr889-shared",
  });
  const absent = await campaignRuntimeClient.from("campaign_instances").select(
    "public_id",
  )
    .eq("game_session_id", games[0]).eq("public_id", publicIds[2])
    .maybeSingle();
  assert.equal(absent.error, null);
  assert.equal(absent.data, null);
  const multiple = await campaignRuntimeClient.from("campaign_instances")
    .select("public_id")
    .eq("game_session_id", games[0]).maybeSingle();
  assert.equal(multiple.data, null);
  assert.equal(multiple.error?.code, "PGRST116");
  const limited = await campaignRuntimeClient.from("campaign_instances").select(
    "public_id,definition_id",
  )
    .eq("game_session_id", games[0]).order("definition_id").limit(1);
  assert.equal(limited.error, null);
  assert.deepEqual(limited.data, [{
    public_id: publicIds[1],
    definition_id: "pr889-only-a",
  }]);
  assert.equal(calls.length, 5, "Each scoped read must use one HTTP request");
  assert.ok(
    calls.every((call) =>
      call.method === "GET" && call.path === "/rest/v1/campaign_instances" &&
      call.authorized
    ),
    "Campaign reads must preserve service authentication",
  );
  checks.scopedReadsAndMaybeSingle = true;

  const args = { p_scheduler_name: scheduler, p_token_sha256: tokenHash };
  const rpc = await campaignRuntimeClient.rpc(
    "verify_runtime_scheduler_token_v1",
    args,
  );
  assert.equal(rpc.error, null);
  assert.equal(rpc.data, true);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[5].body, args);
  assert.ok(
    calls[5].method === "POST" &&
      calls[5].path === "/rest/v1/rpc/verify_runtime_scheduler_token_v1" &&
      calls[5].authorized && calls[5].status === 200,
    "Campaign RPC must preserve service authentication",
  );
  const unauthorized = await originalFetch(
    `${apiUrl.origin}/rest/v1/rpc/verify_runtime_scheduler_token_v1`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
      redirect: "error",
    },
  );
  assert.ok(
    [401, 403].includes(unauthorized.status),
    "Unauthenticated RPC must be rejected",
  );
  checks.rpcForwardingAndHeaders = true;

  assert.equal(await verifySchedulerToken("malformed"), false);
  assert.equal(calls.length, 6, "Malformed token must not issue an RPC");
  assert.equal(await verifySchedulerToken(token), true);
  assert.equal(calls.length, 7);
  assert.deepEqual(calls[6].body, args);
  assert.ok(
    calls[6].authorized && calls[6].status === 200 &&
      calls[6].path === "/rest/v1/rpc/verify_runtime_scheduler_token_v1",
    "Token verification must preserve service authentication",
  );
  const wrongToken = (token.startsWith("0") ? "1" : "0").repeat(64);
  assert.equal(await verifySchedulerToken(wrongToken), false);
  assert.equal(calls.length, 8);
  assert.ok(
    calls[7].authorized && calls[7].status === 200 &&
      calls[7].path === "/rest/v1/rpc/verify_runtime_scheduler_token_v1",
    "Rejected token verification must preserve service authentication",
  );
  const rejected = calls[7].body as Record<string, unknown>;
  assert.equal(rejected.p_scheduler_name, scheduler);
  assert.notEqual(rejected.p_token_sha256, tokenHash);
  assert.match(String(rejected.p_token_sha256), /^[0-9a-f]{64}$/);
  checks.campaignTokenAuthorization = true;
  evidence.status = "pass";
} catch (error) {
  evidence.status = "fail";
  evidence.error = error instanceof Error ? error.name : "UnknownError";
  failed = true;
  failure = error;
} finally {
  globalThis.fetch = originalFetch;
  try {
    if (seedAttempted) {
      await sql(`begin;
        delete from public.campaign_instances
          where (${ownedCampaigns}) and pack_id='pr889-pack' and pack_version='v1'
          and game_session_id in (select id from public.game_sessions where ${ownedGames});
        delete from public.currency_exchange_rates
          where game_session_id in (select id from public.game_sessions where ${ownedGames});
        delete from public.game_sessions where ${ownedGames};
        delete from private.runtime_scheduler_tokens where scheduler_name=${
        literal(scheduler)
      } and token_sha256=${literal(tokenHash)}
          and exists(select 1 from public.staff_users where ${ownedStaff});
        delete from public.staff_users where ${ownedStaff};
        do $$ begin
          if exists(select 1 from public.game_sessions where id in (${gameList}))
            or exists(select 1 from public.campaign_instances where id in (${campaignList}))
            or exists(select 1 from public.currency_exchange_rates where game_session_id in (${gameList}))
            or exists(select 1 from public.staff_users where id=${
        literal(staff)
      })
            or exists(select 1 from private.runtime_scheduler_tokens where scheduler_name=${
        literal(scheduler)
      } and token_sha256=${literal(tokenHash)})
          then raise exception 'PR889_FIXTURE_CLEANUP_FAILED'; end if;
        end $$;
        commit;`);
      checks.fixtureCleanup = true;
    }
  } catch (error) {
    evidence.status = "fail";
    evidence.cleanupFailed = true;
    if (!failed) failure = error;
    failed = true;
  } finally {
    await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile(
      "/tmp/ref018/pr889-campaign-postgrest.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
  }
}
if (failed) {
  let diagnostic = failure instanceof Error
    ? failure.stack || `${failure.name}: ${failure.message}`
    : String(failure);
  for (const secret of [serviceKey, token, tokenHash, database]) {
    if (secret) diagnostic = diagnostic.replaceAll(secret, "[redacted]");
  }
  console.error(diagnostic);
  Deno.exit(1);
}
console.log(JSON.stringify(evidence));
