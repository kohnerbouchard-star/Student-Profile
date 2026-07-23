import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

export const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
export const PUBLIC_THREAD_PATTERN = /thr_[0-9a-f]{32}/i;
export const PUBLIC_MESSAGE_PATTERN = /msg_[0-9a-f]{32}/i;

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const env = Object.freeze({
  supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
  anonKey: required("SUPABASE_ANON_KEY"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  poolerUrl: required("POOLER_URL"),
  dbPassword: required("SUPABASE_DB_PASSWORD"),
  projectRef: required("SUPABASE_PROJECT_REF"),
  expectedProjectRef: required("EXPECTED_STAGING_PROJECT_REF"),
  productionProjectRef: required("PRODUCTION_PROJECT_REF"),
  releaseCommit: required("RELEASE_COMMIT"),
  artifactSetSha256: required("EXPECTED_ARTIFACT_SET_SHA256"),
  localRestoreUrl: required("LOCAL_RESTORE_URL"),
  evidencePath: process.env.EVIDENCE_PATH || "/tmp/pr295-connected-acceptance.json",
});

if (!/^[a-z0-9]{20}$/.test(env.projectRef) || env.projectRef !== env.expectedProjectRef) {
  throw new Error("Connected acceptance is not bound to the exact isolated staging project");
}
if (env.projectRef === env.productionProjectRef) throw new Error("Production project selection is prohibited");
if (env.supabaseUrl !== `https://${env.projectRef}.supabase.co`) throw new Error("SUPABASE_URL project binding is invalid");
if (!/^[a-f0-9]{40}$/.test(env.releaseCommit)) throw new Error("RELEASE_COMMIT is invalid");
if (!/^[a-f0-9]{64}$/.test(env.artifactSetSha256)) throw new Error("EXPECTED_ARTIFACT_SET_SHA256 is invalid");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      PGPASSWORD: env.dbPassword,
      PGSSLMODE: "require",
      ...options.env,
    },
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const safe = String(result.stderr || result.stdout || "unknown error")
      .replaceAll(env.dbPassword, "[redacted]")
      .replaceAll(env.anonKey, "[redacted]")
      .replaceAll(env.serviceRoleKey, "[redacted]");
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${safe}`);
  }
  return String(result.stdout || "").trim();
}

export function psql(sql, connection = env.poolerUrl, extraEnv = {}) {
  return run("psql", [connection, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    env: extraEnv,
  });
}

export async function http(path, {
  method = "GET",
  bearer = env.anonKey,
  playerToken,
  body,
  headers = {},
  expectedStatuses = [200],
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const started = performance.now();
  let response;
  try {
    response = await fetch(`${env.supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: env.anonKey,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(playerToken ? { "x-player-session-token": playerToken } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!expectedStatuses.includes(response.status)) {
    const safeCode = parsed && typeof parsed === "object"
      ? String(parsed.error?.code ?? parsed.code ?? "unknown")
      : "non_json";
    throw new Error(`${method} ${path} returned ${response.status} (${safeCode})`);
  }
  return {
    status: response.status,
    body: parsed,
    latencyMs: performance.now() - started,
    retryAfter: response.headers.get("retry-after"),
  };
}

export function assertSafePlayerResponse(value, fixture, label) {
  const clone = structuredClone(value);
  if (clone && typeof clone === "object" && clone.session && typeof clone.session === "object") {
    if ("token" in clone.session) clone.session.token = "[session-redacted]";
  }
  const text = JSON.stringify(clone);
  if (UUID_PATTERN.test(text)) throw new Error(`${label} leaked a raw UUID`);
  if (text.includes(fixture.joinCode) || text.includes(fixture.accessCode)) {
    throw new Error(`${label} leaked a plaintext access credential`);
  }
  if (/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/.test(text)) throw new Error(`${label} leaked a Supabase key`);
  if (/Bearer\s+[A-Za-z0-9._~-]+/i.test(text)) throw new Error(`${label} leaked an authorization header`);
}

export function createFixtureIdentity() {
  const runTag = `pr295-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const playerPrefix = `PR295${randomBytes(3).toString("hex").toUpperCase()}`;
  const playerIdentifiers = Array.from(
    { length: 40 },
    (_, index) => `${playerPrefix}-${String(index + 1).padStart(3, "0")}`,
  );
  return {
    runTag,
    adminEmail: `${runTag}@invalid.example`,
    adminPassword: `Aa!${randomBytes(18).toString("base64url")}`,
    gameName: `PR295 Connected Acceptance ${runTag}`,
    joinCode: `PR295-${randomBytes(4).toString("hex").toUpperCase()}`,
    accessCode: `AC-${randomBytes(4).toString("hex").toUpperCase()}`,
    playerPrefix,
    playerIdentifiers,
    directSessionTokens: playerIdentifiers.map(() => randomBytes(32).toString("base64url")),
    expiredSessionToken: randomBytes(32).toString("base64url"),
    authUserId: null,
    gameId: null,
    staffId: null,
    playerRows: [],
    baselineRateLimitKeys: [],
  };
}

export async function createAuthUser(fixture) {
  const response = await fetch(`${env.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: fixture.adminEmail,
      password: fixture.adminPassword,
      email_confirm: true,
      app_metadata: { acceptance_operator: true, environment: "staging" },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) throw new Error(`Unable to create temporary staging Auth user (${response.status})`);
  fixture.authUserId = body.id;
}

export async function deleteAuthUser(fixture) {
  if (!fixture.authUserId) return;
  const response = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(fixture.authUserId)}`, {
    method: "DELETE",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Unable to remove temporary staging Auth user (${response.status})`);
  }
  fixture.authUserId = null;
}

export function setupDatabaseFixture(fixture) {
  const joinHash = sha256(fixture.joinCode.trim().replace(/\s+/g, "").toUpperCase());
  const accessHash = sha256(fixture.accessCode.trim().replace(/\s+/g, "").toUpperCase());
  const sessions = [
    ...fixture.directSessionTokens.map((token, index) => ({
      playerIdentifier: fixture.playerIdentifiers[index],
      tokenHash: sha256(token),
      status: "active",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    })),
    {
      playerIdentifier: fixture.playerIdentifiers[39],
      tokenHash: sha256(fixture.expiredSessionToken),
      status: "expired",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    },
  ];
  psql(`
    begin;
    insert into public.staff_users (supabase_auth_user_id,email,display_name)
    values (${sqlLiteral(fixture.authUserId)},${sqlLiteral(fixture.adminEmail)},${sqlLiteral(`PR295 Acceptance ${fixture.runTag}`)});

    insert into public.game_sessions (
      owner_staff_user_id,name,status,game_join_code_hash,game_join_code_status,lifecycle_state,started_at
    )
    select id,${sqlLiteral(fixture.gameName)},'active',${sqlLiteral(joinHash)},'active','active',now()
    from public.staff_users where email=${sqlLiteral(fixture.adminEmail)};

    insert into public.game_settings (game_session_id,difficulty_preset)
    select id,'standard' from public.game_sessions where name=${sqlLiteral(fixture.gameName)};

    insert into public.message_game_policies (
      game_session_id,player_threads_enabled,max_player_thread_participants,
      default_retention_days,attachments_enabled,updated_by_staff_user_id
    )
    select g.id,true,2,365,false,s.id
    from public.game_sessions g join public.staff_users s on s.id=g.owner_staff_user_id
    where g.name=${sqlLiteral(fixture.gameName)};

    insert into public.marketplace_policies (game_session_id,updated_by_staff_user_id)
    select g.id,s.id
    from public.game_sessions g join public.staff_users s on s.id=g.owner_staff_user_id
    where g.name=${sqlLiteral(fixture.gameName)};

    insert into public.players (
      game_session_id,display_name,roster_label,status,player_identifier,player_identifier_normalized
    )
    select g.id,
           'Acceptance Player ' || lpad(series::text,3,'0'),
           'LOAD-' || lpad(series::text,3,'0'),
           'active',
           ${sqlLiteral(fixture.playerPrefix)} || '-' || lpad(series::text,3,'0'),
           ${sqlLiteral(fixture.playerPrefix)} || '-' || lpad(series::text,3,'0')
    from public.game_sessions g cross join generate_series(1,40) series
    where g.name=${sqlLiteral(fixture.gameName)};

    insert into public.player_access_credentials (
      game_session_id,player_id,normalized_student_code_hash,status
    )
    select p.game_session_id,p.id,${sqlLiteral(accessHash)},'active'
    from public.players p join public.game_sessions g on g.id=p.game_session_id
    where g.name=${sqlLiteral(fixture.gameName)}
      and p.player_identifier=${sqlLiteral(fixture.playerIdentifiers[0])};

    insert into public.account_balances (game_session_id,player_id,account_type,balance,currency_code)
    select p.game_session_id,p.id,'cash',1000,'ECO'
    from public.players p join public.game_sessions g on g.id=p.game_session_id
    where g.name=${sqlLiteral(fixture.gameName)};

    with payload as (
      select * from jsonb_to_recordset($sessions$${JSON.stringify(sessions)}$sessions$::jsonb)
      as item("playerIdentifier" text,"tokenHash" text,status text,"expiresAt" timestamptz)
    )
    insert into public.player_sessions (
      game_session_id,player_id,session_token_hash,status,expires_at
    )
    select p.game_session_id,p.id,payload."tokenHash",payload.status,payload."expiresAt"
    from payload
    join public.players p on p.player_identifier=payload."playerIdentifier"
    join public.game_sessions g on g.id=p.game_session_id and g.name=${sqlLiteral(fixture.gameName)};
    commit;
  `);

  const state = JSON.parse(psql(`
    select json_build_object(
      'gameId',g.id,
      'staffId',s.id,
      'players',(
        select json_agg(json_build_object('id',p.id,'identifier',p.player_identifier) order by p.player_identifier)
        from public.players p where p.game_session_id=g.id
      )
    )::text
    from public.game_sessions g join public.staff_users s on s.id=g.owner_staff_user_id
    where g.name=${sqlLiteral(fixture.gameName)};
  `));
  fixture.gameId = state.gameId;
  fixture.staffId = state.staffId;
  fixture.playerRows = state.players;
  if (!fixture.gameId || !fixture.staffId || fixture.playerRows.length !== 40) {
    throw new Error("Synthetic staging fixture is incomplete");
  }
}

export function readRateLimitKeys() {
  return JSON.parse(psql(`
    select coalesce(json_agg(json_build_object(
      'dimension',dimension,'keyHash',key_hash,'windowStartedAt',window_started_at,
      'windowSeconds',window_seconds
    ) order by dimension,key_hash,window_started_at,window_seconds),'[]'::json)::text
    from public.request_rate_limit_buckets;
  `) || "[]");
}

export function captureRateLimitBaseline(fixture) {
  fixture.baselineRateLimitKeys = readRateLimitKeys();
}

function cleanupRateLimitDelta(fixture, cleanupEvidence) {
  const baseline = new Set(fixture.baselineRateLimitKeys.map((row) => JSON.stringify(row)));
  const delta = readRateLimitKeys().filter((row) => !baseline.has(JSON.stringify(row)));
  for (const row of delta) {
    psql(`
      delete from public.request_rate_limit_buckets
      where dimension=${sqlLiteral(row.dimension)}
        and key_hash=${sqlLiteral(row.keyHash)}
        and window_started_at=${sqlLiteral(row.windowStartedAt)}::timestamptz
        and window_seconds=${Number(row.windowSeconds)};
    `);
  }
  const residual = readRateLimitKeys().filter((row) => !baseline.has(JSON.stringify(row)));
  cleanupEvidence.rateLimitDelta = delta.length;
  cleanupEvidence.residualRateLimitRows = residual.length;
  if (residual.length) throw new Error(`Rate-limit cleanup left ${residual.length} residual rows`);
}

function cleanupDatabaseFixture(fixture) {
  if (!fixture.gameId) {
    fixture.gameId = psql(`select id from public.game_sessions where name=${sqlLiteral(fixture.gameName)} limit 1;`) || null;
  }
  if (!fixture.staffId) {
    fixture.staffId = psql(`select id from public.staff_users where email=${sqlLiteral(fixture.adminEmail)} limit 1;`) || null;
  }
  if (!fixture.gameId) {
    if (fixture.staffId) psql(`delete from public.staff_users where id=${sqlLiteral(fixture.staffId)};`);
    return;
  }
  const tables = psql(`
    select table_name
    from information_schema.columns
    where table_schema='public' and column_name='game_session_id' and table_name <> 'game_sessions'
    group by table_name order by table_name;
  `).split("\n").map((value) => value.trim()).filter(Boolean);
  const statements = tables.map((table) => {
    if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error(`Unsafe cleanup table: ${table}`);
    return `delete from public.${table} where game_session_id=${sqlLiteral(fixture.gameId)};`;
  });
  statements.push(`delete from public.game_sessions where id=${sqlLiteral(fixture.gameId)};`);
  if (fixture.staffId) statements.push(`delete from public.staff_users where id=${sqlLiteral(fixture.staffId)};`);
  psql(`begin; set local session_replication_role=replica; ${statements.join("\n")} commit;`);
}

export async function cleanupFixture(fixture, cleanupEvidence) {
  try {
    cleanupDatabaseFixture(fixture);
  } finally {
    try {
      cleanupRateLimitDelta(fixture, cleanupEvidence);
    } finally {
      await deleteAuthUser(fixture);
    }
  }
  const counts = psql(`
    select
      (select count(*) from public.game_sessions where name=${sqlLiteral(fixture.gameName)}) || ' ' ||
      (select count(*) from public.staff_users where email=${sqlLiteral(fixture.adminEmail)}) || ' ' ||
      (select count(*) from public.player_sessions ps join public.players p on p.id=ps.player_id
       where p.player_identifier like ${sqlLiteral(fixture.playerPrefix + '-%')});
  `).split(/\s+/).map(Number);
  cleanupEvidence.residualGameRows = counts[0];
  cleanupEvidence.residualStaffRows = counts[1];
  cleanupEvidence.residualPlayerSessions = counts[2];
  cleanupEvidence.completed = counts.every((value) => value === 0);
  if (!cleanupEvidence.completed) throw new Error(`Zero-residue verification failed (${counts.join(",")})`);
}

export async function signInAdmin(fixture) {
  const response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: fixture.adminEmail, password: fixture.adminPassword }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`Temporary Admin sign-in failed (${response.status})`);
  return body.access_token;
}

export function safeError(error, fixture) {
  return String(error instanceof Error ? error.message : error)
    .replaceAll(env.anonKey, "[redacted]")
    .replaceAll(env.serviceRoleKey, "[redacted]")
    .replaceAll(fixture.adminPassword, "[redacted]")
    .replaceAll(fixture.joinCode, "[redacted]")
    .replaceAll(fixture.accessCode, "[redacted]")
    .replace(UUID_PATTERN, "[uuid-redacted]");
}

export { randomUUID };
